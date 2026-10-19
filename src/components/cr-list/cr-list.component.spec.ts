import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrListComponent } from './cr-list.component';
import { SessionService } from '../../session/session.service';
import { summaries, users } from '../../api/fixtures';
import { CrSummary, ReqUser } from '../../models/cr.models';
import { CrApiService } from '../../api/cr-api.service';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render(user: ReqUser): Promise<ComponentFixture<CrListComponent>> {
	TestBed.configureTestingModule({
		imports: [CrListComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrListComponent);
	fixture.detectChanges(); // ngOnInit -> load()
	await flush(); // let the mock API resolve
	fixture.detectChanges(); // render the loaded/empty state
	return fixture;
}

function changeFilter(fixture: ComponentFixture<CrListComponent>, status: string): void {
	const select: HTMLSelectElement = fixture.nativeElement.querySelector('.cr-list__filter');
	select.value = status;
	select.dispatchEvent(new Event('change'));
	fixture.detectChanges();
}

function renderedIds(fixture: ComponentFixture<CrListComponent>): string[] {
	return Array.from(fixture.nativeElement.querySelectorAll('.cr-list__row'), (row: HTMLTableRowElement) => row.cells[0].textContent.trim());
}

describe('CrListComponent', () => {
	it('renders a row per change request in the user org', async () => {
		const fixture = await render(users.approver);
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(3); // org-alpha: CR-1, CR-2, CR-3
	});

	it('shows the empty state when the org has no change requests', async () => {
		const fixture = await render({ id: 'x', orgCode: 'org-empty', policies: ['cr_r_o'] });
		expect(fixture.nativeElement.querySelector('.cr-list__empty')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();
	});

	it('shows all loaded rows with ALL selected by default', async () => {
		const fixture = await render(users.approver);
		expect(fixture.nativeElement.querySelector('.cr-list__filter').value).toBe('ALL');
		expect(renderedIds(fixture)).toEqual(['CR-1', 'CR-2', 'CR-3']);
		expect(fixture.nativeElement.querySelector('.cr-list__no-matches')).toBeNull();
	});

	it.each([
		['PENDING_APPROVAL', 'CR-1'],
		['APPLIED', 'CR-2'],
		['DRAFT', 'CR-3'],
	])('renders only %s rows when the filter changes', async (status, id) => {
		const fixture = await render(users.approver);
		changeFilter(fixture, status);
		expect(renderedIds(fixture)).toEqual([id]);
		expect(fixture.nativeElement.querySelector('.cr-status').textContent.trim()).toBe(status);
	});

	it('shows no matching results without treating loaded records as API-empty', async () => {
		const fixture = await render(users.approver);
		changeFilter(fixture, 'REJECTED');
		expect(renderedIds(fixture)).toEqual([]);
		expect(fixture.nativeElement.querySelector('.cr-list__no-matches').textContent).toContain('No change requests match');
		expect(fixture.nativeElement.querySelector('.cr-list__empty')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();
		expect(fixture.componentInstance.state.status).toBe('loaded');
	});

	it('keeps the API-empty state when the selected status changes', async () => {
		const fixture = await render({ id: 'x', orgCode: 'org-empty', policies: ['cr_r_o'] });
		changeFilter(fixture, 'REJECTED');
		expect(fixture.nativeElement.querySelector('.cr-list__empty')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__no-matches')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();
	});

	it('preserves source rows while switching filters and restores all records', async () => {
		const fixture = await render(users.approver);
		const source = fixture.componentInstance.state.data;
		const snapshot = source.map((row) => ({ ...row }));
		source.forEach(Object.freeze);
		Object.freeze(source);
		const api = TestBed.inject(CrApiService);
		const listSpy = jest.spyOn(api, 'listChangeRequests');

		changeFilter(fixture, 'PENDING_APPROVAL');
		expect(renderedIds(fixture)).toEqual(['CR-1']);
		changeFilter(fixture, 'REJECTED');
		expect(fixture.nativeElement.querySelector('.cr-list__no-matches')).not.toBeNull();
		changeFilter(fixture, 'APPLIED');
		expect(renderedIds(fixture)).toEqual(['CR-2']);
		expect(fixture.nativeElement.querySelector('.cr-list__no-matches')).toBeNull();
		changeFilter(fixture, 'ALL');
		expect(renderedIds(fixture)).toEqual(['CR-1', 'CR-2', 'CR-3']);
		expect(fixture.componentInstance.state.data).toBe(source);
		expect(source).toEqual(snapshot);
		expect(listSpy).not.toHaveBeenCalled();
	});

	it('emits the selected id when a filtered row is clicked', async () => {
		const fixture = await render(users.approver);
		const selectSpy = jest.spyOn(fixture.componentInstance.select, 'emit');
		changeFilter(fixture, 'APPLIED');
		fixture.nativeElement.querySelector('.cr-list__row').click();
		expect(selectSpy).toHaveBeenCalledWith('CR-2');
	});

	it('preserves loading, error and retry behavior with an active filter', async () => {
		const fixture = await render(users.approver);
		changeFilter(fixture, 'APPLIED');
		const api = TestBed.inject(CrApiService);
		api.failNext = true;
		const pendingLoad = fixture.componentInstance.load();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__loading')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__no-matches')).toBeNull();
		await pendingLoad;
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__error').textContent).toContain('Network error');
		expect(fixture.nativeElement.querySelector('.cr-list__no-matches')).toBeNull();

		fixture.nativeElement.querySelector('.cr-list__error button').click();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__loading')).not.toBeNull();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__error')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__loading')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__filter').value).toBe('APPLIED');
		expect(renderedIds(fixture)).toEqual(['CR-2']);
	});
});

function deferredRows() {
	let resolve!: (rows: CrSummary[]) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<CrSummary[]>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

async function refreshFixture(): Promise<ComponentFixture<CrListComponent>> {
	const listChangeRequests = jest.fn().mockResolvedValue(summaries.slice(0, 3));
	TestBed.configureTestingModule({
		imports: [CrListComponent],
		providers: [
			{ provide: SessionService, useValue: { user: users.approver } },
			{ provide: CrApiService, useValue: { listChangeRequests } },
		],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrListComponent);
	fixture.detectChanges();
	await Promise.resolve();
	fixture.detectChanges();
	listChangeRequests.mockClear();
	return fixture;
}

describe('CrListComponent refresh safety', () => {
	it('highlights only the input selection and moves aria-current with it', async () => {
		const fixture = await refreshFixture();
		const selectSpy = jest.spyOn(fixture.componentInstance.select, 'emit');
		fixture.componentRef.setInput('selectedId', 'CR-1');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__row--selected button').textContent.trim()).toBe('CR-1');
		expect(fixture.nativeElement.querySelectorAll('[aria-current="true"]').length).toBe(1);
		fixture.componentRef.setInput('selectedId', 'CR-2');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__row--selected button').textContent.trim()).toBe('CR-2');
		expect(fixture.nativeElement.querySelector('[aria-label="Review CR-1"]').hasAttribute('aria-current')).toBe(false);
		expect(fixture.nativeElement.querySelector('[aria-selected]')).toBeNull();
		expect(selectSpy).not.toHaveBeenCalled();
	});

	it('retains selection through filter hide/show without emitting or mutating rows', async () => {
		const fixture = await refreshFixture();
		fixture.componentRef.setInput('selectedId', 'CR-1');
		fixture.detectChanges();
		const source = fixture.componentInstance.state.data;
		const selectSpy = jest.spyOn(fixture.componentInstance.select, 'emit');
		changeFilter(fixture, 'DRAFT');
		expect(fixture.nativeElement.querySelector('.cr-list__row--selected')).toBeNull();
		expect(fixture.componentInstance.selectedId).toBe('CR-1');
		changeFilter(fixture, 'ALL');
		expect(fixture.nativeElement.querySelector('.cr-list__row--selected button').textContent.trim()).toBe('CR-1');
		expect(fixture.componentInstance.state.data).toBe(source);
		expect(selectSpy).not.toHaveBeenCalled();
	});

	it('offers a native keyboard-focusable selection button without double emitting', async () => {
		const fixture = await refreshFixture();
		const button: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-list__row button');
		const selectSpy = jest.spyOn(fixture.componentInstance.select, 'emit');
		expect(button.type).toBe('button');
		expect(button.tabIndex).toBe(0);
		expect(button.getAttribute('aria-label')).toBe('Review CR-1');
		button.click();
		expect(selectSpy).toHaveBeenCalledTimes(1);
		expect(selectSpy).toHaveBeenCalledWith('CR-1');
	});
	it.each(['resolve', 'reject'])('ignores an older refresh that completes with %s', async (outcome) => {
		const fixture = await refreshFixture();
		const api = TestBed.inject(CrApiService);
		const older = deferredRows();
		const newer = deferredRows();
		jest.spyOn(api, 'listChangeRequests').mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
		const firstLoad = fixture.componentInstance.load();
		const secondLoad = fixture.componentInstance.load();
		newer.resolve([{ ...summaries[0], status: 'APPROVED' }]);
		await secondLoad;
		if (outcome === 'resolve') older.resolve([summaries[0]]);
		else older.reject(new Error('Old refresh failed'));
		await firstLoad;
		fixture.detectChanges();
		expect(renderedIds(fixture)).toEqual(['CR-1']);
		expect(fixture.nativeElement.querySelector('.cr-status').textContent).toBe('APPROVED');
		expect(fixture.nativeElement.querySelector('.cr-list__error')).toBeNull();
	});

	it('rejects old user results even before a new-session load completes', async () => {
		const fixture = await refreshFixture();
		const api = TestBed.inject(CrApiService);
		const older = deferredRows();
		jest.spyOn(api, 'listChangeRequests').mockReturnValueOnce(older.promise).mockResolvedValueOnce([summaries[3]]);
		const pending = fixture.componentInstance.load();
		TestBed.inject(SessionService).user = users.otherOrg;
		older.resolve([summaries[0]]);
		await pending;
		fixture.detectChanges();
		expect(renderedIds(fixture)).toEqual([]);
		await fixture.componentInstance.load();
		fixture.detectChanges();
		expect(renderedIds(fixture)).toEqual(['CR-9']);
	});

	it.each(['resolve', 'reject'])('ignores pending %s after destruction and prevents further loads', async (outcome) => {
		const fixture = await refreshFixture();
		const response = deferredRows();
		const spy = jest.spyOn(TestBed.inject(CrApiService), 'listChangeRequests').mockReturnValueOnce(response.promise);
		const pending = fixture.componentInstance.load();
		fixture.destroy();
		const previousState = fixture.componentInstance.state;
		if (outcome === 'resolve') response.resolve([]);
		else response.reject(new Error('Old refresh failed'));
		await pending;
		await fixture.componentInstance.load();
		expect(fixture.componentInstance.state).toBe(previousState);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('preserves the filter across loading, error, retry and API-empty refresh', async () => {
		const fixture = await refreshFixture();
		changeFilter(fixture, 'PENDING_APPROVAL');
		const response = deferredRows();
		const spy = jest.spyOn(TestBed.inject(CrApiService), 'listChangeRequests').mockReturnValueOnce(response.promise);
		const pending = fixture.componentInstance.load();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__loading')).not.toBeNull();
		response.reject(new Error('Refresh failed'));
		await pending;
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__error').textContent).toContain('Refresh failed');
		spy.mockResolvedValueOnce([]);
		fixture.nativeElement.querySelector('.cr-list__error button').click();
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__empty')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__no-matches')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__filter').value).toBe('PENDING_APPROVAL');
	});
});
