import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CrApiService } from '../../api/cr-api.service';
import { SessionService } from '../../session/session.service';
import { CrStatus, CrSummary } from '../../models/cr.models';
import { idle, loading, ViewState } from '../../common/view-state';

/**
 * Change Request LIST page. Loads the caller's CRs and renders loading / loaded / empty / error
 * states, plus a status filter applied to the loaded rows without changing the source data.
 */
@Component({
	selector: 'app-cr-list',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './cr-list.component.html',
})
export class CrListComponent implements OnInit, OnDestroy {
	@Input() selectedId: string | null = null;
	@Output() select = new EventEmitter<string>();

	state: ViewState<CrSummary[]> = idle();
	statusFilter: CrStatus | 'ALL' = 'ALL';
	readonly statuses: (CrStatus | 'ALL')[] = [
		'ALL',
		'DRAFT',
		'SUBMITTED',
		'PENDING_APPROVAL',
		'APPROVED',
		'APPLIED',
		'REJECTED',
		'CANCELLED',
	];
	private loadRequest = 0;
	private destroyed = false;

	constructor(private readonly api: CrApiService, private readonly session: SessionService) {}

	ngOnInit(): void {
		void this.load();
	}

	ngOnDestroy(): void {
		this.destroyed = true;
		this.loadRequest++;
	}

	async load(): Promise<void> {
		if (this.destroyed) return;
		const request = ++this.loadRequest;
		const user = this.session.user;
		const isCurrent = () => request === this.loadRequest && !this.destroyed && this.session.user === user;
		this.state = loading();
		try {
			const rows = await this.api.listChangeRequests(user);
			if (!isCurrent()) return;
			this.state = { status: rows.length ? 'loaded' : 'empty', data: rows };
		} catch (err) {
			if (!isCurrent()) return;
			this.state = { status: 'error', data: null, error: (err as Error).message };
		}
	}

	onFilterChange(value: string): void {
		this.statusFilter = value as CrStatus | 'ALL';
	}

	/** Rows to render, after applying the active status filter. */
	get visibleRows(): CrSummary[] {
		const rows = this.state.data ?? [];
		return this.statusFilter === 'ALL' ? rows : rows.filter((row) => row.status === this.statusFilter);
	}
}
