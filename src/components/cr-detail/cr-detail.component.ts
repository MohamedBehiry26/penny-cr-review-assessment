import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CrApiService } from '../../api/cr-api.service';
import { SessionService } from '../../session/session.service';
import { CrDetail, TimelineEntry } from '../../models/cr.models';
import { idle, loading, ViewState } from '../../common/view-state';
import { computeDiff, DiffRow } from '../diff.util';
import { formatMoney } from '../../common/money.util';
import { canApprovePolicy } from '../../common/permissions';

/**
 * Change Request DETAIL page: loads a CR and renders the diff/preview, the approval timeline, and
 * permission-aware Approve/Reject actions. `load`, the diff binding, and the template skeleton are
 * provided; the timeline ordering, permission gating, actions, and reject validation are yours.
 */
@Component({
	selector: 'app-cr-detail',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule],
	templateUrl: './cr-detail.component.html',
})
export class CrDetailComponent implements OnChanges, OnDestroy {
	@Input() id!: string;

	state: ViewState<CrDetail> = idle();
	submitting = false;
	actionError?: string;
	// TODO: add validation so the form is invalid until a reason is entered.
	rejectControl = new FormControl('', { nonNullable: true });
	private loadRequest = 0;
	private destroyed = false;

	constructor(private readonly api: CrApiService, private readonly session: SessionService) {}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['id']) void this.load();
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
		const detail = this.detail;
		const user = this.session.user;
		if (
			this.destroyed ||
			this.submitting ||
			this.state.status !== 'loaded' ||
			!this.canApprove ||
			detail.id !== this.id ||
			detail.orgCode !== user.orgCode
		)
			return;

		const request = this.loadRequest;
		const isCurrent = () => request === this.loadRequest && !this.destroyed && this.session.user === user;
		this.submitting = true;
		this.actionError = undefined;
		try {
			const updated = await this.api.approve(user, detail.id, new Date().toISOString());
			if (isCurrent()) this.state = { status: 'loaded', data: updated };
		} catch (err) {
			if (!isCurrent()) return;
			const message = (err as Error).message;
			this.actionError = `Approval response failed: ${message}. Checking current status.`;
			// The mock store may already have changed. Read once; never retry the mutation automatically.
			try {
				const refreshed = await this.api.getChangeRequest(user, detail.id);
				if (!isCurrent()) return;
				this.state = { status: 'loaded', data: refreshed };
				this.actionError = `Approval response failed: ${message}. Current status: ${refreshed.status}. Approval was not retried.`;
			} catch (refreshError) {
				if (!isCurrent()) return;
				this.state = {
					status: 'error',
					data: null,
					error: `Approval outcome is unknown (${message}). Could not refresh: ${
						(refreshError as Error).message
					}. Retry reloads the current status without approving again.`,
				};
			}
		} finally {
			// Keep the shared action lock until this operation (including reconciliation) finishes.
			if (!this.destroyed) this.submitting = false;
		}
	}

	async reject(): Promise<void> {
		// TODO: require a valid rejectControl, then perform the reject action through the API and
		//       reflect the outcome in the view.
		throw new Error('reject() not implemented');
	}
}
