import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CrApiService } from '../../api/cr-api.service';
import { SessionService } from '../../session/session.service';
import { CrDetail, ReqUser, TimelineEntry } from '../../models/cr.models';
import { idle, loading, ViewState } from '../../common/view-state';
import { computeDiff, DiffRow } from '../diff.util';
import { formatMoney } from '../../common/money.util';
import { canApprovePolicy } from '../../common/permissions';

/**
 * Change Request DETAIL page: loads a CR and renders the diff/preview, the approval timeline, and
 * permission-aware Approve/Reject actions, including rejection validation and error reconciliation.
 */
@Component({
	selector: 'app-cr-detail',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule],
	templateUrl: './cr-detail.component.html',
})
export class CrDetailComponent implements OnChanges, OnDestroy {
	@Input() id!: string;
	@Output() updated = new EventEmitter<CrDetail>();

	state: ViewState<CrDetail> = idle();
	submitting = false;
	actionError?: string;
	rejectControl = new FormControl('', {
		nonNullable: true,
		validators: [(control) => (control.value.trim() ? null : { required: true })],
	});
	private loadRequest = 0;
	private destroyed = false;
	private uncertainAction?: { id: string; status: CrDetail['status']; user: ReqUser };

	constructor(private readonly api: CrApiService, private readonly session: SessionService) {}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['id']) {
			this.uncertainAction = undefined;
			this.rejectControl.reset('');
			void this.load();
		}
	}

	ngOnDestroy(): void {
		this.destroyed = true;
		// Pending Promises cannot be cancelled; invalidate their results instead.
		this.loadRequest++;
	}

	async load(): Promise<void> {
		const request = ++this.loadRequest;
		this.actionError = undefined;
		if (!this.id) {
			this.state = { status: 'empty', data: null };
			return;
		}
		this.state = loading();
		try {
			const detail = await this.api.getChangeRequest(this.session.user, this.id);
			if (request !== this.loadRequest) return;
			this.state = { status: 'loaded', data: detail };
			const uncertain = this.uncertainAction;
			if (uncertain?.id === detail.id && uncertain.user === this.session.user) {
				this.uncertainAction = undefined;
				if (detail.status !== uncertain.status) this.updated.emit(detail);
			}
		} catch (err) {
			if (request !== this.loadRequest) return;
			this.state = { status: 'error', data: null, error: (err as Error).message };
		}
	}

	get detail(): CrDetail | null {
		return this.state.data;
	}

	get diff(): DiffRow[] {
		return this.detail ? computeDiff(this.detail.baselineLineItems, this.detail.proposedLineItems) : [];
	}

	get hasLineItemChanges(): boolean {
		return this.diff.some((row) => row.kind !== 'unchanged');
	}

	/** Approval timeline, oldest-first. */
	get timeline(): TimelineEntry[] {
		// Array.sort is stable: equal timestamps retain the API's relative order.
		return [...(this.detail?.audit ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
	}

	/** Whether the current user may approve the loaded CR. */
	get canApprove(): boolean {
		return this.detail?.status === 'PENDING_APPROVAL' && canApprovePolicy(this.session.user);
	}

	get canReject(): boolean {
		return this.detail?.status === 'PENDING_APPROVAL' && canApprovePolicy(this.session.user);
	}

	fmt(amount: number): string {
		return this.detail ? formatMoney(amount, this.detail.currency) : String(amount);
	}

	async approve(): Promise<void> {
		await this.submitAction('approve');
	}

	async reject(): Promise<void> {
		await this.submitAction('reject');
	}

	private async submitAction(action: 'approve' | 'reject'): Promise<void> {
		const detail = this.detail;
		const user = this.session.user;
		if (
			this.destroyed ||
			this.submitting ||
			this.state.status !== 'loaded' ||
			!(action === 'approve' ? this.canApprove : this.canReject) ||
			detail.id !== this.id ||
			detail.orgCode !== user.orgCode
		)
			return;
		if (action === 'reject' && this.rejectControl.invalid) {
			this.rejectControl.markAsTouched();
			return;
		}

		const reason = this.rejectControl.value.trim();
		const label = action === 'approve' ? 'Approval' : 'Rejection';
		const request = this.loadRequest;
		const isCurrent = () => request === this.loadRequest && !this.destroyed && this.session.user === user;
		this.submitting = true;
		this.actionError = undefined;
		try {
			const at = new Date().toISOString();
			const updated = await (action === 'approve' ? this.api.approve(user, detail.id, at) : this.api.reject(user, detail.id, at, reason));
			if (!isCurrent()) return;
			this.state = { status: 'loaded', data: updated };
			if (action === 'reject' && updated.status === 'REJECTED') this.rejectControl.reset('');
			if (updated.status !== detail.status) this.updated.emit(updated);
		} catch (err) {
			if (!isCurrent()) return;
			const message = (err as Error).message;
			this.actionError = `${label} response failed: ${message}. Checking current status.`;
			// The mock store may already have changed. Read once; never retry the mutation automatically.
			try {
				const refreshed = await this.api.getChangeRequest(user, detail.id);
				if (!isCurrent()) return;
				this.state = { status: 'loaded', data: refreshed };
				if (action === 'reject' && refreshed.status === 'REJECTED') this.rejectControl.reset('');
				this.actionError = `${label} response failed: ${message}. Current status: ${refreshed.status}. ${label} was not retried.`;
				if (refreshed.status !== detail.status) this.updated.emit(refreshed);
			} catch (refreshError) {
				if (!isCurrent()) return;
				this.uncertainAction = { id: detail.id, status: detail.status, user };
				this.state = {
					status: 'error',
					data: null,
					error: `${label} outcome is unknown (${message}). Could not refresh: ${
						(refreshError as Error).message
					}. Retry reloads the current status without ${action === 'approve' ? 'approving' : 'rejecting'} again.`,
				};
			}
		} finally {
			// Keep the shared action lock until this operation (including reconciliation) finishes.
			if (!this.destroyed) this.submitting = false;
		}
	}
}
