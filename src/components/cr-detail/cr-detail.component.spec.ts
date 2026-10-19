import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrDetailComponent } from './cr-detail.component';
import { SessionService } from '../../session/session.service';
import { details, users } from '../../api/fixtures';
import { CrDetail, LineItem, ReqUser, TimelineEntry } from '../../models/cr.models';
import { CrApiService } from '../../api/cr-api.service';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render(user: ReqUser, id: string): Promise<ComponentFixture<CrDetailComponent>> {
	TestBed.configureTestingModule({
		imports: [CrDetailComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrDetailComponent);
	fixture.componentRef.setInput('id', id);
	fixture.detectChanges(); // ngOnChanges -> load()
	await flush(); // let the mock API resolve
	fixture.detectChanges(); // render the loaded state
	return fixture;
}

describe('CrDetailComponent', () => {
	it('loads and renders the change request title', async () => {
		const fixture = await render(users.approver, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Add 1 unit of SKU-A');
	});

	it('disables Approve for a read-only viewer on a pending CR', async () => {
		const fixture = await render(users.viewer, 'CR-1'); // viewer: cr_r_o only; CR-1 is PENDING_APPROVAL
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(true);
	});

	it.each(['cr_a_u', 'cr_a_w', 'cr_a_o'])('offers Approve and Reject on a pending CR with %s', async (policy) => {
		const fixture = await render({ ...users.approver, policies: ['cr_r_o', policy] }, 'CR-1');
		fixture.componentInstance.rejectControl.setValue('Changes need revision');
		fixture.detectChanges();

		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		const rejectBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__reject-btn');
		expect(approveBtn.disabled).toBe(false);
		expect(rejectBtn).not.toBeNull();
		expect(rejectBtn.disabled).toBe(false);
	});

	it('hides rejection controls and denies both permissions for a read-only viewer', async () => {
		const fixture = await render(users.viewer, 'CR-1');
		expect(fixture.componentInstance.canApprove).toBe(false);
		expect(fixture.componentInstance.canReject).toBe(false);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-actions__reason')).toBeNull();
	});

	it.each(['CR-2', 'CR-3'])('denies actions for an approver when %s is not pending approval', async (id) => {
		const fixture = await render(users.approver, id);
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(true);
		expect(fixture.componentInstance.canApprove).toBe(false);
		expect(fixture.componentInstance.canReject).toBe(false);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
	});
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

async function selectionFixture() {
	const getChangeRequest = jest.fn();
	TestBed.configureTestingModule({
		imports: [CrDetailComponent],
		providers: [
			{ provide: SessionService, useValue: { user: users.approver } },
			{ provide: CrApiService, useValue: { getChangeRequest } },
		],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrDetailComponent);
	const select = (id: string) => {
		fixture.componentRef.setInput('id', id);
		fixture.detectChanges();
	};
	return { fixture, getChangeRequest, select };
}

describe('CrDetailComponent selection loading', () => {
	it.each(['resolve', 'reject'])('ignores a previous user load %s even before destruction', async (outcome) => {
		const { fixture, getChangeRequest, select } = await selectionFixture();
		const response = deferred<CrDetail>();
		getChangeRequest.mockReturnValueOnce(response.promise);
		select('CR-1');
		TestBed.inject(SessionService).user = users.otherOrg;
		if (outcome === 'resolve') response.resolve(details['CR-1']);
		else response.reject(new Error('Previous session error'));
		await response.promise.catch(() => undefined);
		fixture.detectChanges();
		expect(fixture.componentInstance.detail).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-detail__error')).toBeNull();
		getChangeRequest.mockResolvedValueOnce(details['CR-9']);
		select('CR-9');
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('h2').textContent).toBe(details['CR-9'].title);
	});
	it('loads the initial input exactly once', async () => {
		const { fixture, getChangeRequest, select } = await selectionFixture();
		const response = deferred<CrDetail>();
		getChangeRequest.mockReturnValue(response.promise);
		select('CR-1');
		fixture.detectChanges();
		expect(getChangeRequest).toHaveBeenCalledTimes(1);
		expect(getChangeRequest).toHaveBeenCalledWith(users.approver, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-detail__loading')).not.toBeNull();
		response.resolve(details['CR-1']);
		await response.promise;
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('h2').textContent).toBe(details['CR-1'].title);
	});

	it('loads a new selection and removes old details and action controls while loading', async () => {
		const { fixture, getChangeRequest, select } = await selectionFixture();
		getChangeRequest.mockResolvedValueOnce(details['CR-1']);
		select('CR-1');
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-actions')).not.toBeNull();
		const response = deferred<CrDetail>();
		getChangeRequest.mockReturnValueOnce(response.promise);
		select('CR-2');
		expect(getChangeRequest).toHaveBeenLastCalledWith(users.approver, 'CR-2');
		expect(fixture.componentInstance.detail).toBeNull();
		expect(fixture.componentInstance.canApprove).toBe(false);
		expect(fixture.componentInstance.canReject).toBe(false);
		expect(fixture.nativeElement.querySelector('.cr-detail__loading')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-detail__header')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-diff')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-actions')).toBeNull();
		response.resolve(details['CR-2']);
		await response.promise;
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('h2').textContent).toBe(details['CR-2'].title);
	});

	it.each(['resolve', 'reject'])('ignores an older request that completes with %s after the newest selection', async (outcome) => {
		const { fixture, getChangeRequest, select } = await selectionFixture();
		const older = deferred<CrDetail>();
		const newer = deferred<CrDetail>();
		getChangeRequest.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
		select('CR-1');
		select('CR-2');
		newer.resolve(details['CR-2']);
		await newer.promise;
		if (outcome === 'resolve') older.resolve(details['CR-1']);
		else older.reject(new Error('Old request failed'));
		await older.promise.catch(() => undefined);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('h2').textContent).toBe(details['CR-2'].title);
		expect(fixture.nativeElement.querySelector('.cr-detail__error')).toBeNull();
	});

	it('keeps loading the newest selection when an older response arrives first', async () => {
		const { fixture, getChangeRequest, select } = await selectionFixture();
		const older = deferred<CrDetail>();
		const newer = deferred<CrDetail>();
		getChangeRequest.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
		select('CR-1');
		select('CR-2');
		older.resolve(details['CR-1']);
		await older.promise;
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__loading')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-actions')).toBeNull();
		newer.resolve(details['CR-2']);
		await newer.promise;
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('h2').textContent).toBe(details['CR-2'].title);
	});

	it('shows a load error and recovers on a successful new selection', async () => {
		const { fixture, getChangeRequest, select } = await selectionFixture();
		getChangeRequest.mockRejectedValueOnce(new Error('Network error'));
		select('CR-1');
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__error').textContent).toContain('Network error');
		getChangeRequest.mockResolvedValueOnce(details['CR-2']);
		select('CR-2');
		expect(fixture.nativeElement.querySelector('.cr-detail__error')).toBeNull();
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('h2').textContent).toBe(details['CR-2'].title);
	});

	it('shows not-found without stale details and retries the current id', async () => {
		const { fixture, getChangeRequest, select } = await selectionFixture();
		getChangeRequest.mockRejectedValueOnce(new Error('Not found'));
		select('missing');
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__error').textContent).toContain('Not found');
		expect(fixture.nativeElement.querySelector('.cr-actions')).toBeNull();
		getChangeRequest.mockRejectedValueOnce(new Error('Not found'));
		fixture.nativeElement.querySelector('.cr-detail__error button').click();
		fixture.detectChanges();
		expect(getChangeRequest).toHaveBeenLastCalledWith(users.approver, 'missing');
		await Promise.resolve();
	});

	it('shows an empty selection and invalidates a pending response without another API call', async () => {
		const { fixture, getChangeRequest, select } = await selectionFixture();
		const response = deferred<CrDetail>();
		getChangeRequest.mockReturnValue(response.promise);
		select('CR-1');
		select('');
		response.resolve(details['CR-1']);
		await response.promise;
		fixture.detectChanges();
		expect(getChangeRequest).toHaveBeenCalledTimes(1);
		expect(fixture.componentInstance.state.status).toBe('empty');
		expect(fixture.nativeElement.querySelector('.cr-detail__empty')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-actions')).toBeNull();
	});

	it('ignores a response after destruction', async () => {
		const { fixture, getChangeRequest, select } = await selectionFixture();
		const response = deferred<CrDetail>();
		getChangeRequest.mockReturnValue(response.promise);
		select('CR-1');
		const previousState = fixture.componentInstance.state;
		fixture.destroy();
		response.resolve(details['CR-1']);
		await response.promise;
		expect(fixture.componentInstance.state).toBe(previousState);
	});
});

async function renderPreview(overrides: Partial<CrDetail> = {}) {
	const { fixture, getChangeRequest, select } = await selectionFixture();
	const response: CrDetail = JSON.parse(JSON.stringify({ ...details['CR-1'], ...overrides }));
	const snapshot = JSON.parse(JSON.stringify(response));
	response.baselineLineItems.forEach(Object.freeze);
	response.proposedLineItems.forEach(Object.freeze);
	Object.freeze(response.baselineLineItems);
	Object.freeze(response.proposedLineItems);
	Object.freeze(response);
	getChangeRequest.mockResolvedValueOnce(response);
	select(response.id);
	await Promise.resolve();
	fixture.detectChanges();
	return { fixture, response, snapshot };
}

describe('CrDetailComponent diff preview and totals', () => {
	it('renders all four categories with meaningful before/after values without changing API data', async () => {
		const { fixture, response, snapshot } = await renderPreview({
			baselineLineItems: [
				{ sku: 'REMOVED', description: 'Old service', quantity: 2, unitPrice: 10 },
				{ sku: 'CHANGED', description: 'Old description', quantity: 3, unitPrice: 20 },
				{ sku: 'SAME', description: 'Same service', quantity: 1, unitPrice: 30 },
			],
			proposedLineItems: [
				{ sku: 'CHANGED', description: 'New description', quantity: 4, unitPrice: 25 },
				{ sku: 'SAME', description: 'Same service', quantity: 1, unitPrice: 30 },
				{ sku: 'ADDED', description: 'New service', quantity: 5, unitPrice: 6 },
			],
			baselineTotal: 110,
			newTotal: 160,
			delta: 50,
		});
		const expectedRows = [
			['removed', 'REMOVED', 'Removed', ['Description: Old service', 'Quantity: 2', 'Unit price: USD 10.00'], ['—']],
			[
				'changed',
				'CHANGED',
				'Changed',
				['Description: Old description', 'Quantity: 3', 'Unit price: USD 20.00'],
				['Description: New description', 'Quantity: 4', 'Unit price: USD 25.00'],
			],
			[
				'unchanged',
				'SAME',
				'Unchanged',
				['Description: Same service', 'Quantity: 1', 'Unit price: USD 30.00'],
				['Description: Same service', 'Quantity: 1', 'Unit price: USD 30.00'],
			],
			['added', 'ADDED', 'Added', ['—'], ['Description: New service', 'Quantity: 5', 'Unit price: USD 6.00']],
		];
		expect(fixture.nativeElement.querySelectorAll('.cr-diff__row').length).toBe(4);
		for (const [kind, sku, label, before, after] of expectedRows) {
			const row: HTMLTableRowElement = fixture.nativeElement.querySelector(`[data-kind="${kind}"]`);
			expect(row.cells[0].textContent.trim()).toBe(sku);
			expect(row.querySelector('.cr-diff__kind').textContent.trim()).toBe(label);
			for (const value of before) expect(row.querySelector('.cr-diff__before').textContent).toContain(value);
			for (const value of after) expect(row.querySelector('.cr-diff__after').textContent).toContain(value);
		}
		expect(fixture.nativeElement.querySelector('.cr-diff__unchanged')).toBeNull();
		expect(response).toEqual(snapshot);
	});

	it.each([
		['quantity', { quantity: 11 }, '.cr-diff__quantity', 'Quantity: 10', 'Quantity: 11'],
		['unit price', { unitPrice: 499.5 }, '.cr-diff__unit-price', 'Unit price: USD 500.00', 'Unit price: USD 499.50'],
		[
			'description',
			{ description: 'Replacement widget' },
			'.cr-diff__description',
			'Description: Widget A',
			'Description: Replacement widget',
		],
	])('shows a %s-only change in the before and after cells', async (_, change, field, before, after) => {
		const item = details['CR-1'].baselineLineItems[0];
		const { fixture } = await renderPreview({
			baselineLineItems: [item],
			proposedLineItems: [{ ...item, ...(change as Partial<LineItem>) }],
		});
		const row: HTMLTableRowElement = fixture.nativeElement.querySelector('.cr-diff__row');
		expect(row.getAttribute('data-kind')).toBe('changed');
		expect(row.querySelector('.cr-diff__kind').textContent).toBe('Changed');
		expect(row.querySelector(`.cr-diff__before ${field}`).textContent).toBe(before);
		expect(row.querySelector(`.cr-diff__after ${field}`).textContent).toBe(after);
	});

	it.each([
		[8000, 8500, 500, 'USD 8,000.00', 'USD 8,500.00', 'USD 500.00'],
		[8500, 8000, -500, 'USD 8,500.00', 'USD 8,000.00', 'USD -500.00'],
		[3000, 3000, 0, 'USD 3,000.00', 'USD 3,000.00', 'USD 0.00'],
		[1000.125, 1001.375, 1.25, 'USD 1,000.13', 'USD 1,001.38', 'USD 1.25'],
	])(
		'renders API totals %s → %s and delta %s using existing money formatting',
		async (baselineTotal, newTotal, delta, before, after, difference) => {
			const { fixture } = await renderPreview({ baselineTotal, newTotal, delta });
			expect(fixture.nativeElement.querySelector('.cr-detail__baseline-total').textContent).toBe(`Before total: ${before}`);
			expect(fixture.nativeElement.querySelector('.cr-detail__proposed-total').textContent).toBe(`Proposed total: ${after}`);
			expect(fixture.nativeElement.querySelector('.cr-detail__delta').textContent).toBe(`Delta: ${difference}`);
			expect(fixture.nativeElement.querySelector('.cr-detail__totals').textContent.replace(/\s+/g, ' ').trim()).toBe(
				`Before total: ${before} · Proposed total: ${after} · Delta: ${difference}`,
			);
		},
	);

	it('uses the response currency for totals and unit prices', async () => {
		const { fixture } = await renderPreview({ currency: 'EUR' });
		expect(fixture.nativeElement.querySelector('.cr-detail__baseline-total').textContent).toBe('Before total: EUR 8,000.00');
		expect(fixture.nativeElement.querySelector('.cr-detail__proposed-total').textContent).toBe('Proposed total: EUR 8,500.00');
		expect(fixture.nativeElement.querySelector('.cr-detail__delta').textContent).toBe('Delta: EUR 500.00');
		expect(fixture.nativeElement.querySelector('.cr-diff__unit-price').textContent).toBe('Unit price: EUR 500.00');
	});

	it('shows an explicit empty preview and zero totals for empty line-item collections', async () => {
		const { fixture } = await renderPreview({ baselineLineItems: [], proposedLineItems: [], baselineTotal: 0, newTotal: 0, delta: 0 });
		expect(fixture.nativeElement.querySelector('.cr-diff__empty').textContent).toContain('No line items in the baseline or proposal.');
		expect(fixture.nativeElement.querySelector('.cr-diff__table')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-diff__unchanged')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-detail__baseline-total').textContent).toBe('Before total: USD 0.00');
		expect(fixture.nativeElement.querySelector('.cr-detail__proposed-total').textContent).toBe('Proposed total: USD 0.00');
		expect(fixture.nativeElement.querySelector('.cr-detail__delta').textContent).toBe('Delta: USD 0.00');
	});

	it('shows no line-item changes while retaining unchanged rows', async () => {
		const { fixture } = await renderPreview(details['CR-3']);
		expect(fixture.nativeElement.querySelector('.cr-diff__unchanged').textContent).toBe('No line-item changes.');
		expect(fixture.nativeElement.querySelector('.cr-diff__empty')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-diff__kind').textContent).toBe('Unchanged');
		expect(fixture.nativeElement.querySelector('.cr-diff__before .cr-diff__description').textContent).toBe('Description: Service C');
		expect(fixture.nativeElement.querySelector('.cr-diff__after .cr-diff__description').textContent).toBe('Description: Service C');
	});

	it.each(['added', 'removed'])('renders %s items when the opposite collection is empty', async (kind) => {
		const items = [{ sku: 'ZERO', description: '', quantity: 0, unitPrice: 0 }];
		const { fixture } = await renderPreview({
			baselineLineItems: kind === 'removed' ? items : [],
			proposedLineItems: kind === 'added' ? items : [],
			baselineTotal: 0,
			newTotal: 0,
			delta: 0,
		});
		const row: HTMLTableRowElement = fixture.nativeElement.querySelector('.cr-diff__row');
		expect(row.getAttribute('data-kind')).toBe(kind);
		expect(row.querySelector('.cr-diff__quantity').textContent).toBe('Quantity: 0');
		expect(row.querySelector('.cr-diff__unit-price').textContent).toBe('Unit price: USD 0.00');
		expect(row.querySelector(kind === 'added' ? '.cr-diff__before' : '.cr-diff__after').textContent.trim()).toBe('—');
		expect(fixture.nativeElement.querySelector('.cr-diff__empty')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-diff__unchanged')).toBeNull();
	});
});

async function renderTimeline(audit: TimelineEntry[]) {
	const context = await selectionFixture();
	const response: CrDetail = JSON.parse(JSON.stringify({ ...details['CR-1'], audit }));
	const snapshot = JSON.parse(JSON.stringify(response));
	response.audit.forEach(Object.freeze);
	Object.freeze(response.audit);
	Object.freeze(response);
	context.getChangeRequest.mockResolvedValueOnce(response);
	context.select(response.id);
	await Promise.resolve();
	context.fixture.detectChanges();
	return { ...context, response, snapshot };
}

function timelineActions(fixture: ComponentFixture<CrDetailComponent>): string[] {
	return Array.from(fixture.nativeElement.querySelectorAll('.cr-timeline__action'), (element: HTMLElement) => element.textContent.trim());
}

describe('CrDetailComponent audit timeline', () => {
	it('renders unsorted audit events oldest first', async () => {
		const { fixture } = await renderTimeline(details['CR-1'].audit);
		expect(timelineActions(fixture)).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL']);
		expect(Array.from(fixture.nativeElement.querySelectorAll('.cr-timeline__at'), (element: HTMLElement) => element.textContent)).toEqual([
			'02 Mar 2026, 09:00 UTC',
			'02 Mar 2026, 09:30 UTC',
			'02 Mar 2026, 10:00 UTC',
		]);
	});

	it('retains the order of an already chronological audit history', async () => {
		const { fixture } = await renderTimeline(details['CR-2'].audit);
		expect(timelineActions(fixture)).toEqual(['CREATE', 'APPROVE', 'APPLY']);
	});

	it('preserves original relative order for events with equal timestamps', async () => {
		const { fixture } = await renderTimeline([
			{ action: 'SUBMIT', byUserId: 'alice', at: '2026-03-02T10:00:00.000Z' },
			{ action: 'CREATE', byUserId: 'alice', at: '2026-03-02T09:00:00.000Z' },
			{ action: 'SEND_FOR_APPROVAL', byUserId: 'alice', at: '2026-03-02T10:00:00.000Z' },
			{ action: 'APPROVE', byUserId: 'mona', at: '2026-03-02T10:00:00.000Z' },
		]);
		expect(timelineActions(fixture)).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL', 'APPROVE']);
	});

	it('orders ISO timestamps by instant including timezone offsets and keeps equivalent instants stable', async () => {
		const { fixture } = await renderTimeline([
			{ action: 'APPROVE', byUserId: 'mona', at: '2026-03-02T09:30:00.000Z' },
			{ action: 'SUBMIT', byUserId: 'alice', at: '2026-03-02T11:00:00.000+02:00' },
			{ action: 'CREATE', byUserId: 'alice', at: '2026-03-02T08:00:00.000Z' },
			{ action: 'SEND_FOR_APPROVAL', byUserId: 'alice', at: '2026-03-02T09:00:00.000Z' },
		]);
		expect(timelineActions(fixture)).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL', 'APPROVE']);
	});

	it('formats offset timestamps in UTC while retaining the exact source datetime', async () => {
		const at = '2026-01-01T00:05:30.123+02:00';
		const { fixture } = await renderTimeline([{ action: 'CREATE', byUserId: 'alice', at }]);
		const time: HTMLTimeElement = fixture.nativeElement.querySelector('time');
		expect(time.textContent).toBe('31 Dec 2025, 22:05 UTC');
		expect(time.getAttribute('datetime')).toBe(at);
	});

	it('preserves an invalid timestamp instead of inventing a date', async () => {
		const { fixture } = await renderTimeline([{ action: 'CREATE', byUserId: 'alice', at: 'invalid' }]);
		expect(fixture.nativeElement.querySelector('time').textContent).toBe('invalid');
	});

	it('shows a clear empty message instead of an empty list', async () => {
		const { fixture } = await renderTimeline([]);
		expect(fixture.nativeElement.querySelector('.cr-timeline__empty').textContent).toBe('No audit history available.');
		expect(fixture.nativeElement.querySelector('.cr-timeline__list')).toBeNull();
		expect(timelineActions(fixture)).toEqual([]);
	});

	it('renders the provided action, user id, timestamp and optional note without inventing metadata', async () => {
		const { fixture } = await renderTimeline([
			{ action: 'CREATE', byUserId: 'alice', at: '2026-03-02T09:00:00.000Z' },
			{ action: 'REJECT', byUserId: 'mona', at: '2026-03-02T10:00:00.000Z', note: 'Please revise the quantity.' },
		]);
		const entries: NodeListOf<HTMLLIElement> = fixture.nativeElement.querySelectorAll('.cr-timeline__entry');
		expect(entries.length).toBe(2);
		expect(entries[0].querySelector('.cr-timeline__note')).toBeNull();
		expect(entries[1].querySelector('.cr-timeline__action').textContent).toBe('REJECT');
		expect(entries[1].querySelector('.cr-timeline__by').textContent).toBe('mona');
		expect(entries[1].querySelector('.cr-timeline__at').textContent).toBe('02 Mar 2026, 10:00 UTC');
		expect(entries[1].querySelector('time').getAttribute('datetime')).toBe('2026-03-02T10:00:00.000Z');
		expect(entries[1].querySelector('.cr-timeline__note').textContent).toBe('Please revise the quantity.');
		expect(entries[1].textContent.replace(/\s+/g, ' ').trim()).toBe('REJECT · mona · 02 Mar 2026, 10:00 UTC · Please revise the quantity.');
		expect(fixture.nativeElement.querySelector('.cr-timeline__empty')).toBeNull();
	});

	it('sorts a copy without mutating frozen API arrays or event objects', async () => {
		const { fixture, response, snapshot } = await renderTimeline(details['CR-1'].audit);
		fixture.detectChanges();
		expect(timelineActions(fixture)).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL']);
		expect(fixture.componentInstance.timeline).not.toBe(response.audit);
		expect(response).toEqual(snapshot);
		expect(response.audit.map((entry) => entry.action)).toEqual(['SEND_FOR_APPROVAL', 'SUBMIT', 'CREATE']);
	});

	it('clears the old timeline while loading and renders the newly selected CR history', async () => {
		const { fixture, getChangeRequest, select } = await renderTimeline(details['CR-1'].audit);
		expect(timelineActions(fixture)).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL']);
		const response = deferred<CrDetail>();
		getChangeRequest.mockReturnValueOnce(response.promise);
		select('CR-2');
		expect(fixture.nativeElement.querySelector('.cr-timeline')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-detail__loading')).not.toBeNull();
		response.resolve(details['CR-2']);
		await response.promise;
		fixture.detectChanges();
		expect(timelineActions(fixture)).toEqual(['CREATE', 'APPROVE', 'APPLY']);
		expect(fixture.nativeElement.querySelector('.cr-timeline__empty')).toBeNull();
	});
});

const approvedDetail: CrDetail = {
	...details['CR-1'],
	status: 'APPROVED',
	updatedAt: '2026-03-02T11:00:00.000Z',
	audit: [...details['CR-1'].audit, { action: 'APPROVE', byUserId: 'mona', at: '2026-03-02T11:00:00.000Z' }],
};

async function approvalFixture(detail = details['CR-1'], user = users.approver) {
	const context = await selectionFixture();
	TestBed.inject(SessionService).user = user;
	const approve = jest.fn();
	TestBed.inject(CrApiService).approve = approve;
	context.getChangeRequest.mockResolvedValueOnce(detail);
	context.select(detail.id);
	await Promise.resolve();
	context.fixture.detectChanges();
	return { ...context, approve };
}

describe('CrDetailComponent approve action', () => {
	it('approves once from the DOM and renders the confirmed status and audit response', async () => {
		const { fixture, approve } = await approvalFixture();
		const response = deferred<CrDetail>();
		approve.mockReturnValueOnce(response.promise);
		fixture.nativeElement.querySelector('.cr-actions__approve').click();
		expect(approve).toHaveBeenCalledTimes(1);
		const [user, id, at] = approve.mock.calls[0];
		expect(user).toBe(users.approver);
		expect(id).toBe('CR-1');
		expect(new Date(at).toISOString()).toBe(at);
		response.resolve(approvedDetail);
		await response.promise;
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__header .cr-status').textContent).toBe('APPROVED');
		expect(timelineActions(fixture)).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL', 'APPROVE']);
		const events = fixture.nativeElement.querySelectorAll('.cr-timeline__entry');
		expect(events[3].querySelector('.cr-timeline__by').textContent).toBe('mona');
		expect(events[3].querySelector('.cr-timeline__at').textContent).toBe('02 Mar 2026, 11:00 UTC');
		expect(fixture.componentInstance.submitting).toBe(false);
		expect(fixture.nativeElement.querySelector('.cr-actions__approve').disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
	});

	it('blocks a read-only user even when the handler is invoked directly', async () => {
		const { fixture, approve } = await approvalFixture(details['CR-1'], users.viewer);
		await fixture.componentInstance.approve();
		expect(approve).not.toHaveBeenCalled();
		expect(fixture.nativeElement.querySelector('.cr-actions__approve').disabled).toBe(true);
		expect(fixture.componentInstance.submitting).toBe(false);
	});

	it('rechecks the current user policy at invocation time', async () => {
		const { fixture, approve } = await approvalFixture();
		TestBed.inject(SessionService).user = users.viewer;
		await fixture.componentInstance.approve();
		expect(approve).not.toHaveBeenCalled();
	});

	it.each(['CR-2', 'CR-3'])('blocks direct approval of non-pending %s', async (id) => {
		const { fixture, approve } = await approvalFixture(details[id]);
		await fixture.componentInstance.approve();
		expect(approve).not.toHaveBeenCalled();
	});

	it('prevents duplicate submissions and disables both action buttons while pending', async () => {
		const { fixture, approve } = await approvalFixture();
		const response = deferred<CrDetail>();
		approve.mockReturnValueOnce(response.promise);
		const pending = fixture.componentInstance.approve();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-actions').getAttribute('aria-busy')).toBe('true');
		expect(fixture.nativeElement.querySelector('.cr-actions__submitting').getAttribute('role')).toBe('status');
		expect(fixture.nativeElement.querySelector('.cr-actions__approve').disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject-btn').disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reason').readOnly).toBe(true);
		const rejectSpy = jest.spyOn(fixture.componentInstance, 'reject');
		fixture.nativeElement.querySelector('.cr-actions__approve').click();
		fixture.nativeElement.querySelector('.cr-actions__reject-btn').click();
		await fixture.componentInstance.approve();
		expect(approve).toHaveBeenCalledTimes(1);
		expect(rejectSpy).not.toHaveBeenCalled();
		response.resolve(approvedDetail);
		await pending;
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-actions').getAttribute('aria-busy')).toBe('false');
		expect(fixture.nativeElement.querySelector('.cr-actions__submitting')).toBeNull();
	});

	it('keeps actions locked during reconciliation and reports the freshly read pending status', async () => {
		const { fixture, approve, getChangeRequest } = await approvalFixture();
		const failure = deferred<CrDetail>();
		const refresh = deferred<CrDetail>();
		approve.mockReturnValueOnce(failure.promise);
		getChangeRequest.mockReturnValueOnce(refresh.promise);
		const pending = fixture.componentInstance.approve();
		failure.reject(new Error('Network error'));
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-actions__error').textContent).toContain('Checking current status');
		expect(fixture.componentInstance.submitting).toBe(true);
		await fixture.componentInstance.approve();
		refresh.resolve(details['CR-1']);
		await pending;
		fixture.detectChanges();
		expect(getChangeRequest).toHaveBeenLastCalledWith(users.approver, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-actions__error').textContent).toContain('Current status: PENDING_APPROVAL');
		expect(fixture.nativeElement.querySelector('.cr-actions__error').getAttribute('role')).toBe('alert');
		expect(fixture.nativeElement.querySelector('.cr-actions__approve').disabled).toBe(false);
		expect(approve).toHaveBeenCalledTimes(1);
	});

	it('reports an unknown outcome if reconciliation fails and Retry performs only a read', async () => {
		const { fixture, approve, getChangeRequest } = await approvalFixture();
		const failure = deferred<CrDetail>();
		const refresh = deferred<CrDetail>();
		approve.mockReturnValueOnce(failure.promise);
		getChangeRequest.mockReturnValueOnce(refresh.promise);
		const pending = fixture.componentInstance.approve();
		failure.reject(new Error('Network error'));
		await Promise.resolve();
		refresh.reject(new Error('Read unavailable'));
		await pending;
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__error').textContent).toContain('Approval outcome is unknown');
		expect(fixture.nativeElement.querySelector('.cr-detail__error').textContent).toContain('Read unavailable');
		expect(fixture.nativeElement.querySelector('.cr-actions')).toBeNull();
		await fixture.componentInstance.approve();
		getChangeRequest.mockResolvedValueOnce(approvedDetail);
		fixture.nativeElement.querySelector('.cr-detail__error button').click();
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__header .cr-status').textContent).toBe('APPROVED');
		expect(approve).toHaveBeenCalledTimes(1);
	});

	it('reconciles the real failNext mutation without issuing a second approval', async () => {
		jest.useFakeTimers();
		try {
			TestBed.configureTestingModule({
				imports: [CrDetailComponent],
				providers: [{ provide: SessionService, useValue: { user: users.approver } }],
			});
			await TestBed.compileComponents();
			const api = TestBed.inject(CrApiService);
			api.latencyMs = 25;
			const approveSpy = jest.spyOn(api, 'approve');
			const readSpy = jest.spyOn(api, 'getChangeRequest');
			const fixture = TestBed.createComponent(CrDetailComponent);
			fixture.componentRef.setInput('id', 'CR-1');
			fixture.detectChanges();
			jest.advanceTimersByTime(25);
			await Promise.resolve();
			fixture.detectChanges();
			api.failNext = true;
			const pending = fixture.componentInstance.approve();
			expect(fixture.componentInstance.detail.status).toBe('PENDING_APPROVAL');
			jest.advanceTimersByTime(25);
			await Promise.resolve();
			expect(api.failNext).toBe(false);
			expect(fixture.componentInstance.submitting).toBe(true);
			jest.advanceTimersByTime(25);
			await pending;
			fixture.detectChanges();
			expect(fixture.nativeElement.querySelector('.cr-detail__header .cr-status').textContent).toBe('APPROVED');
			expect(fixture.nativeElement.querySelector('.cr-actions__error').textContent).toContain('Approval response failed: Network error');
			expect(fixture.nativeElement.querySelector('.cr-actions__error').textContent).toContain('Current status: APPROVED');
			expect(fixture.componentInstance.detail.audit.filter((entry) => entry.action === 'APPROVE').length).toBe(1);
			expect(fixture.componentInstance.submitting).toBe(false);
			void fixture.componentInstance.approve();
			expect(approveSpy).toHaveBeenCalledTimes(1);
			expect(readSpy).toHaveBeenCalledTimes(2);
		} finally {
			jest.useRealTimers();
		}
	});

	it.each(['resolve', 'reject'])('ignores an old approval %s after selecting another CR', async (outcome) => {
		const { fixture, approve, getChangeRequest, select } = await approvalFixture();
		const response = deferred<CrDetail>();
		approve.mockReturnValueOnce(response.promise);
		const pending = fixture.componentInstance.approve();
		const updatedSpy = jest.spyOn(fixture.componentInstance.updated, 'emit');
		getChangeRequest.mockResolvedValueOnce(details['CR-3']);
		select('CR-3');
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('h2').textContent).toBe(details['CR-3'].title);
		if (outcome === 'resolve') response.resolve(approvedDetail);
		else {
			getChangeRequest.mockResolvedValueOnce(approvedDetail);
			response.reject(new Error('Old approval failed'));
		}
		await pending;
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('h2').textContent).toBe(details['CR-3'].title);
		expect(fixture.componentInstance.detail.status).toBe('DRAFT');
		expect(fixture.componentInstance.submitting).toBe(false);
		expect(fixture.nativeElement.querySelector('.cr-actions__error')).toBeNull();
		expect(getChangeRequest).toHaveBeenCalledTimes(outcome === 'resolve' ? 2 : 3);
		expect(updatedSpy).toHaveBeenCalledWith(approvedDetail);
	});

	it('ignores a reconciliation response after selection changes', async () => {
		const { fixture, approve, getChangeRequest, select } = await approvalFixture();
		const failure = deferred<CrDetail>();
		const refresh = deferred<CrDetail>();
		approve.mockReturnValueOnce(failure.promise);
		getChangeRequest.mockReturnValueOnce(refresh.promise);
		const pending = fixture.componentInstance.approve();
		failure.reject(new Error('Network error'));
		await Promise.resolve();
		getChangeRequest.mockResolvedValueOnce(details['CR-2']);
		select('CR-2');
		await Promise.resolve();
		refresh.resolve(approvedDetail);
		await pending;
		fixture.detectChanges();
		expect(fixture.componentInstance.detail.id).toBe('CR-2');
		expect(fixture.nativeElement.querySelector('.cr-actions__error')).toBeNull();
	});

	it.each(['resolve', 'reject'])('does not update component state after destruction when approval completes with %s', async (outcome) => {
		const { fixture, approve, getChangeRequest } = await approvalFixture();
		const response = deferred<CrDetail>();
		approve.mockReturnValueOnce(response.promise);
		const pending = fixture.componentInstance.approve();
		fixture.destroy();
		const previousState = fixture.componentInstance.state;
		if (outcome === 'resolve') response.resolve(approvedDetail);
		else response.reject(new Error('Old approval failed'));
		await pending;
		expect(fixture.componentInstance.state).toBe(previousState);
		expect(fixture.componentInstance.actionError).toBeUndefined();
		expect(getChangeRequest).toHaveBeenCalledTimes(1);
		await fixture.componentInstance.approve();
		expect(approve).toHaveBeenCalledTimes(1);
	});
});

const rejectedDetail: CrDetail = {
	...details['CR-1'],
	status: 'REJECTED',
	updatedAt: '2026-03-02T11:00:00.000Z',
	audit: [...details['CR-1'].audit, { action: 'REJECT', byUserId: 'mona', at: '2026-03-02T11:00:00.000Z', note: 'Please revise' }],
};

async function rejectionFixture(detail = details['CR-1'], user = users.approver) {
	const context = await approvalFixture(detail, user);
	const reject = jest.fn();
	TestBed.inject(CrApiService).reject = reject;
	return { ...context, reject };
}

function enterReason(fixture: ComponentFixture<CrDetailComponent>, value: string): void {
	const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('.cr-actions__reason');
	textarea.value = value;
	textarea.dispatchEvent(new Event('input'));
	textarea.dispatchEvent(new Event('blur'));
	fixture.detectChanges();
}

describe('CrDetailComponent reject action', () => {
	it('rechecks selection and current user permissions inside the handler', async () => {
		const { fixture, reject } = await rejectionFixture();
		enterReason(fixture, 'Please revise');
		fixture.componentInstance.id = 'CR-2';
		await fixture.componentInstance.reject();
		fixture.componentInstance.id = 'CR-1';
		TestBed.inject(SessionService).user = users.viewer;
		await fixture.componentInstance.reject();
		expect(reject).not.toHaveBeenCalled();
	});

	it('blocks direct rejection while the newly selected detail is loading', async () => {
		const { fixture, reject, getChangeRequest, select } = await rejectionFixture();
		const response = deferred<CrDetail>();
		getChangeRequest.mockReturnValueOnce(response.promise);
		select('CR-3');
		fixture.componentInstance.rejectControl.setValue('Please revise');
		await fixture.componentInstance.reject();
		expect(reject).not.toHaveBeenCalled();
		response.resolve(details['CR-3']);
		await response.promise;
	});

	it('ignores old rejection reconciliation without clearing a new selection reason', async () => {
		const { fixture, reject, getChangeRequest, select } = await rejectionFixture();
		enterReason(fixture, 'Please revise');
		const failure = deferred<CrDetail>();
		const refresh = deferred<CrDetail>();
		reject.mockReturnValueOnce(failure.promise);
		getChangeRequest.mockReturnValueOnce(refresh.promise);
		const pending = fixture.componentInstance.reject();
		failure.reject(new Error('Network error'));
		await Promise.resolve();
		getChangeRequest.mockResolvedValueOnce(details['CR-3']);
		select('CR-3');
		await Promise.resolve();
		fixture.componentInstance.rejectControl.setValue('New selection reason');
		refresh.resolve(rejectedDetail);
		await pending;
		fixture.detectChanges();
		expect(fixture.componentInstance.detail.id).toBe('CR-3');
		expect(fixture.componentInstance.rejectControl.value).toBe('New selection reason');
		expect(fixture.nativeElement.querySelector('.cr-actions__error')).toBeNull();
	});

	it('rejects from the DOM with a trimmed reason and renders status and audit, then resets the form', async () => {
		const { fixture, reject } = await rejectionFixture();
		const response = deferred<CrDetail>();
		reject.mockReturnValueOnce(response.promise);
		enterReason(fixture, '  Please revise \n');
		expect(fixture.nativeElement.querySelector('.cr-actions__reject-btn').disabled).toBe(false);
		fixture.nativeElement.querySelector('.cr-actions__reject-btn').click();
		expect(reject).toHaveBeenCalledTimes(1);
		const [user, id, at, reason] = reject.mock.calls[0];
		expect(user).toBe(users.approver);
		expect(id).toBe('CR-1');
		expect(new Date(at).toISOString()).toBe(at);
		expect(reason).toBe('Please revise');
		response.resolve(rejectedDetail);
		await response.promise;
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__header .cr-status').textContent).toBe('REJECTED');
		expect(timelineActions(fixture)).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL', 'REJECT']);
		expect(fixture.nativeElement.querySelector('.cr-timeline__note').textContent).toBe('Please revise');
		expect(fixture.componentInstance.rejectControl.value).toBe('');
		expect(fixture.componentInstance.rejectControl.touched).toBe(false);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
	});

	it.each(['', '   ', '\n\t '])('blocks an invalid reason %p and links accessible feedback to the textarea', async (reason) => {
		const { fixture, reject } = await rejectionFixture();
		enterReason(fixture, reason);
		await fixture.componentInstance.reject();
		fixture.detectChanges();
		expect(reject).not.toHaveBeenCalled();
		expect(fixture.componentInstance.rejectControl.invalid).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject-btn').disabled).toBe(true);
		const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('.cr-actions__reason');
		const error: HTMLElement = fixture.nativeElement.querySelector('.cr-actions__reason-error');
		expect(textarea.getAttribute('aria-required')).toBe('true');
		expect(textarea.getAttribute('aria-invalid')).toBe('true');
		expect(textarea.getAttribute('aria-describedby')).toBe(error.id);
		expect(error.getAttribute('role')).toBe('alert');
		expect(error.textContent).toContain('Please enter a rejection reason');
		enterReason(fixture, 'Valid reason');
		expect(fixture.nativeElement.querySelector('.cr-actions__reason-error')).toBeNull();
		expect(textarea.getAttribute('aria-invalid')).toBe('false');
		expect(textarea.getAttribute('aria-describedby')).toBeNull();
	});

	it('marks an untouched invalid control as touched on direct invocation', async () => {
		const { fixture, reject } = await rejectionFixture();
		expect(fixture.componentInstance.rejectControl.touched).toBe(false);
		await fixture.componentInstance.reject();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-actions__reason-error')).not.toBeNull();
		expect(reject).not.toHaveBeenCalled();
	});

	it('blocks a read-only user with a valid reason even on direct invocation', async () => {
		const { fixture, reject } = await rejectionFixture(details['CR-1'], users.viewer);
		fixture.componentInstance.rejectControl.setValue('Please revise');
		await fixture.componentInstance.reject();
		expect(reject).not.toHaveBeenCalled();
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
	});

	it.each(['CR-2', 'CR-3'])('blocks rejection of non-pending %s', async (id) => {
		const { fixture, reject } = await rejectionFixture(details[id]);
		fixture.componentInstance.rejectControl.setValue('Please revise');
		await fixture.componentInstance.reject();
		expect(reject).not.toHaveBeenCalled();
	});

	it.each(['approve', 'reject'])('blocks duplicate and overlapping actions while %s is pending', async (action: 'approve' | 'reject') => {
		const { fixture, approve, reject } = await rejectionFixture();
		enterReason(fixture, 'Please revise');
		const response = deferred<CrDetail>();
		approve.mockReturnValue(response.promise);
		reject.mockReturnValue(response.promise);
		const pending = fixture.componentInstance[action]();
		fixture.detectChanges();
		await fixture.componentInstance.approve();
		await fixture.componentInstance.reject();
		expect(approve).toHaveBeenCalledTimes(action === 'approve' ? 1 : 0);
		expect(reject).toHaveBeenCalledTimes(action === 'reject' ? 1 : 0);
		expect(fixture.nativeElement.querySelector('.cr-actions__approve').disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject-btn').disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reason').readOnly).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions').getAttribute('aria-busy')).toBe('true');
		expect(fixture.nativeElement.querySelector('.cr-actions__submitting').textContent).toContain('Processing request');
		response.resolve(action === 'approve' ? approvedDetail : rejectedDetail);
		await pending;
		expect(fixture.componentInstance.submitting).toBe(false);
	});

	it('reconciles a failed rejection once, retaining the reason when the current status remains pending', async () => {
		const { fixture, reject, approve, getChangeRequest } = await rejectionFixture();
		enterReason(fixture, ' Please revise ');
		const failure = deferred<CrDetail>();
		const refresh = deferred<CrDetail>();
		reject.mockReturnValueOnce(failure.promise);
		getChangeRequest.mockReturnValueOnce(refresh.promise);
		const pending = fixture.componentInstance.reject();
		failure.reject(new Error('Network error'));
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-actions__error').textContent).toContain('Rejection response failed');
		await fixture.componentInstance.reject();
		await fixture.componentInstance.approve();
		expect(fixture.componentInstance.submitting).toBe(true);
		refresh.resolve(details['CR-1']);
		await pending;
		fixture.detectChanges();
		expect(getChangeRequest).toHaveBeenCalledTimes(2);
		expect(fixture.nativeElement.querySelector('.cr-actions__error').textContent).toContain('Current status: PENDING_APPROVAL');
		expect(fixture.componentInstance.rejectControl.value).toBe(' Please revise ');
		expect(fixture.nativeElement.querySelector('.cr-actions__reason').readOnly).toBe(false);
		expect(reject).toHaveBeenCalledTimes(1);
		expect(approve).not.toHaveBeenCalled();
	});

	it('reports an unknown outcome when rejection and read fail, allowing only a read on Retry', async () => {
		const { fixture, reject, getChangeRequest } = await rejectionFixture();
		enterReason(fixture, 'Please revise');
		const failure = deferred<CrDetail>();
		const refresh = deferred<CrDetail>();
		reject.mockReturnValueOnce(failure.promise);
		getChangeRequest.mockReturnValueOnce(refresh.promise);
		const pending = fixture.componentInstance.reject();
		failure.reject(new Error('Network error'));
		await Promise.resolve();
		refresh.reject(new Error('Read unavailable'));
		await pending;
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__error').textContent).toContain('Rejection outcome is unknown');
		expect(fixture.nativeElement.querySelector('.cr-actions')).toBeNull();
		expect(fixture.componentInstance.rejectControl.value).toBe('Please revise');
		await fixture.componentInstance.reject();
		getChangeRequest.mockResolvedValueOnce(rejectedDetail);
		fixture.nativeElement.querySelector('.cr-detail__error button').click();
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.componentInstance.detail.status).toBe('REJECTED');
		expect(reject).toHaveBeenCalledTimes(1);
	});

	it('reconciles real failNext rejection to REJECTED with a single trimmed audit note', async () => {
		jest.useFakeTimers();
		try {
			TestBed.configureTestingModule({ imports: [CrDetailComponent] });
			await TestBed.compileComponents();
			const api = TestBed.inject(CrApiService);
			api.latencyMs = 25;
			const rejectSpy = jest.spyOn(api, 'reject');
			const readSpy = jest.spyOn(api, 'getChangeRequest');
			const fixture = TestBed.createComponent(CrDetailComponent);
			fixture.componentRef.setInput('id', 'CR-1');
			fixture.detectChanges();
			jest.advanceTimersByTime(25);
			await Promise.resolve();
			fixture.componentInstance.rejectControl.setValue('  Please revise  ');
			api.failNext = true;
			const pending = fixture.componentInstance.reject();
			jest.advanceTimersByTime(25);
			await Promise.resolve();
			expect(fixture.componentInstance.submitting).toBe(true);
			jest.advanceTimersByTime(25);
			await pending;
			fixture.detectChanges();
			expect(fixture.nativeElement.querySelector('.cr-detail__header .cr-status').textContent).toBe('REJECTED');
			expect(fixture.nativeElement.querySelector('.cr-actions__error').textContent).toContain('Current status: REJECTED');
			expect(fixture.nativeElement.querySelector('.cr-timeline__note').textContent).toBe('Please revise');
			expect(fixture.componentInstance.detail.audit.filter((entry) => entry.action === 'REJECT').length).toBe(1);
			expect(fixture.componentInstance.rejectControl.value).toBe('');
			expect(rejectSpy).toHaveBeenCalledTimes(1);
			expect(readSpy).toHaveBeenCalledTimes(2);
		} finally {
			jest.useRealTimers();
		}
	});

	it.each(['resolve', 'reject'])('ignores an old rejection %s and clears the reason for a new selection', async (outcome) => {
		const { fixture, reject, getChangeRequest, select } = await rejectionFixture();
		enterReason(fixture, 'Please revise');
		const response = deferred<CrDetail>();
		reject.mockReturnValueOnce(response.promise);
		const pending = fixture.componentInstance.reject();
		const updatedSpy = jest.spyOn(fixture.componentInstance.updated, 'emit');
		getChangeRequest.mockResolvedValueOnce(details['CR-3']);
		select('CR-3');
		await Promise.resolve();
		if (outcome === 'resolve') response.resolve(rejectedDetail);
		else {
			getChangeRequest.mockResolvedValueOnce(rejectedDetail);
			response.reject(new Error('Old rejection failed'));
		}
		await pending;
		fixture.detectChanges();
		expect(fixture.componentInstance.detail.id).toBe('CR-3');
		expect(fixture.componentInstance.rejectControl.value).toBe('');
		expect(fixture.nativeElement.querySelector('.cr-actions__error')).toBeNull();
		expect(getChangeRequest).toHaveBeenCalledTimes(outcome === 'resolve' ? 2 : 3);
		expect(updatedSpy).toHaveBeenCalledWith(rejectedDetail);
	});

	it.each(['resolve', 'reject'])('ignores rejection %s after destruction', async (outcome) => {
		const { fixture, reject, getChangeRequest } = await rejectionFixture();
		enterReason(fixture, 'Please revise');
		const response = deferred<CrDetail>();
		reject.mockReturnValueOnce(response.promise);
		const pending = fixture.componentInstance.reject();
		fixture.destroy();
		const previousState = fixture.componentInstance.state;
		if (outcome === 'resolve') response.resolve(rejectedDetail);
		else response.reject(new Error('Old rejection failed'));
		await pending;
		expect(fixture.componentInstance.state).toBe(previousState);
		expect(fixture.componentInstance.rejectControl.value).toBe('Please revise');
		expect(fixture.componentInstance.actionError).toBeUndefined();
		expect(getChangeRequest).toHaveBeenCalledTimes(1);
		await fixture.componentInstance.reject();
		expect(reject).toHaveBeenCalledTimes(1);
	});
});
