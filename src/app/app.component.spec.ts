import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { CrApiService } from '../api/cr-api.service';
import { CrDetailComponent } from '../components/cr-detail/cr-detail.component';
import { CrListComponent } from '../components/cr-list/cr-list.component';
import { summaries } from '../api/fixtures';
import { CrSummary } from '../models/cr.models';

async function advanceApi(fixture: ComponentFixture<AppComponent>): Promise<void> {
	jest.advanceTimersByTime(25);
	await Promise.resolve();
	await Promise.resolve();
	fixture.detectChanges();
}

async function appFixture() {
	jest.useFakeTimers();
	TestBed.configureTestingModule({ imports: [AppComponent] });
	await TestBed.compileComponents();
	const api = TestBed.inject(CrApiService);
	api.latencyMs = 25;
	const listSpy = jest.spyOn(api, 'listChangeRequests');
	const fixture = TestBed.createComponent(AppComponent);
	fixture.detectChanges();
	await advanceApi(fixture);
	return { fixture, api, listSpy };
}

function filterBy(fixture: ComponentFixture<AppComponent>, value: string): void {
	const select: HTMLSelectElement = fixture.nativeElement.querySelector('.cr-list__filter');
	select.value = value;
	select.dispatchEvent(new Event('change'));
	fixture.detectChanges();
}

function clickAction(fixture: ComponentFixture<AppComponent>, action: string): void {
	if (action === 'reject') {
		const reason: HTMLTextAreaElement = fixture.nativeElement.querySelector('.cr-actions__reason');
		reason.value = 'Please revise';
		reason.dispatchEvent(new Event('input'));
		fixture.detectChanges();
	}
	fixture.nativeElement.querySelector(action === 'approve' ? '.cr-actions__approve' : '.cr-actions__reject-btn').click();
}

describe('AppComponent List/Detail integration', () => {
	afterEach(() => jest.useRealTimers());

	it.each([
		['approve', 'APPROVED', 'ALL'],
		['reject', 'REJECTED', 'ALL'],
		['approve', 'APPROVED', 'PENDING_APPROVAL'],
		['reject', 'REJECTED', 'PENDING_APPROVAL'],
	])('refreshes List after %s and preserves %s status with the %s filter', async (action, status, filter) => {
		const { fixture, listSpy } = await appFixture();
		const detail = fixture.debugElement.query(By.directive(CrDetailComponent)).componentInstance;
		filterBy(fixture, filter);
		clickAction(fixture, action);
		await advanceApi(fixture);
		expect(fixture.nativeElement.querySelector('.cr-list__loading')).not.toBeNull();
		await advanceApi(fixture);
		expect(listSpy).toHaveBeenCalledTimes(2);
		expect(fixture.nativeElement.querySelector('.cr-list__filter').value).toBe(filter);
		expect(fixture.componentInstance.selectedId).toBe('CR-1');
		expect(fixture.debugElement.query(By.directive(CrDetailComponent)).componentInstance).toBe(detail);
		expect(fixture.nativeElement.querySelector('.cr-detail__header .cr-status').textContent).toBe(status);
		if (filter === 'ALL') {
			expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(3);
			expect(fixture.nativeElement.querySelector('.cr-list__row .cr-status').textContent).toBe(status);
		} else {
			expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(0);
			expect(fixture.nativeElement.querySelector('.cr-list__no-matches')).not.toBeNull();
			expect(fixture.nativeElement.querySelector('.cr-list__empty')).toBeNull();
		}
	});

	it.each(['approve', 'reject'])('refreshes after a real %s error reconciles to a changed status', async (action) => {
		const { fixture, api, listSpy } = await appFixture();
		api.failNext = true;
		clickAction(fixture, action);
		await advanceApi(fixture);
		expect(listSpy).toHaveBeenCalledTimes(1);
		await advanceApi(fixture);
		await advanceApi(fixture);
		expect(listSpy).toHaveBeenCalledTimes(2);
		expect(fixture.nativeElement.querySelector('.cr-list__row .cr-status').textContent).toBe(
			action === 'approve' ? 'APPROVED' : 'REJECTED',
		);
		expect(fixture.nativeElement.querySelector('.cr-actions__error').textContent).toContain('response failed');
	});

	it('emits no update for an unknown outcome, then refreshes only after a read-only Retry confirms change', async () => {
		const { fixture, api, listSpy } = await appFixture();
		api.failNext = true;
		clickAction(fixture, 'approve');
		await advanceApi(fixture);
		api.failNext = true;
		await advanceApi(fixture);
		expect(fixture.nativeElement.querySelector('.cr-detail__error').textContent).toContain('Approval outcome is unknown');
		expect(listSpy).toHaveBeenCalledTimes(1);
		const approveSpy = jest.spyOn(api, 'approve');
		fixture.nativeElement.querySelector('.cr-detail__error button').click();
		await advanceApi(fixture);
		await advanceApi(fixture);
		expect(listSpy).toHaveBeenCalledTimes(2);
		expect(approveSpy).not.toHaveBeenCalled();
		expect(fixture.nativeElement.querySelector('.cr-list__row .cr-status').textContent).toBe('APPROVED');
	});

	it('does not refresh when reconciliation confirms the original pending status', async () => {
		const { fixture, api, listSpy } = await appFixture();
		jest.spyOn(api, 'approve').mockImplementationOnce(() => new Promise((_, reject) => setTimeout(() => reject(new Error('Offline')), 25)));
		clickAction(fixture, 'approve');
		await advanceApi(fixture);
		await advanceApi(fixture);
		expect(listSpy).toHaveBeenCalledTimes(1);
		expect(fixture.nativeElement.querySelector('.cr-actions__error').textContent).toContain('Current status: PENDING_APPROVAL');
	});

	it('wires row selection and ignores late action notifications after selecting another CR', async () => {
		const { fixture, listSpy } = await appFixture();
		clickAction(fixture, 'approve');
		fixture.nativeElement.querySelectorAll('.cr-list__row')[1].click();
		fixture.detectChanges();
		await advanceApi(fixture);
		expect(fixture.componentInstance.selectedId).toBe('CR-2');
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toBe('Replace SKU-B supplier');
		expect(listSpy).toHaveBeenCalledTimes(1);
	});

	it('clears selection on user/org switching and ignores an old session action', async () => {
		const { fixture, listSpy } = await appFixture();
		clickAction(fixture, 'approve');
		const userSelect: HTMLSelectElement = fixture.nativeElement.querySelector('.app-header select');
		userSelect.value = 'otherOrg';
		userSelect.dispatchEvent(new Event('change'));
		fixture.detectChanges();
		await advanceApi(fixture);
		await advanceApi(fixture);
		expect(fixture.componentInstance.selectedId).toBeNull();
		expect(fixture.nativeElement.querySelector('app-cr-detail')).toBeNull();
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(1);
		expect(fixture.nativeElement.querySelector('.cr-list__row td').textContent).toBe('CR-9');
		expect(listSpy).toHaveBeenCalledTimes(2);
	});

	it('discards old-org List results after recreating panes for a new session', async () => {
		const { fixture, listSpy } = await appFixture();
		let resolveOld!: (rows: CrSummary[]) => void;
		listSpy.mockReturnValueOnce(new Promise((resolve) => (resolveOld = resolve)));
		const oldList = fixture.debugElement.query(By.directive(CrListComponent)).componentInstance;
		const pending = oldList.load();
		fixture.componentInstance.switchUser('otherOrg');
		fixture.detectChanges();
		await advanceApi(fixture);
		await advanceApi(fixture);
		resolveOld([summaries[0]]);
		await pending;
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(1);
		expect(fixture.nativeElement.querySelector('.cr-list__row td').textContent).toBe('CR-9');
	});

	it('keeps confirmed Detail visible if List refresh fails and preserves the filter through an empty retry', async () => {
		const { fixture, listSpy } = await appFixture();
		filterBy(fixture, 'PENDING_APPROVAL');
		listSpy.mockImplementationOnce(() => new Promise((_, reject) => setTimeout(() => reject(new Error('Refresh offline')), 25)));
		clickAction(fixture, 'approve');
		await advanceApi(fixture);
		await advanceApi(fixture);
		expect(fixture.nativeElement.querySelector('.cr-list__error').textContent).toContain('Refresh offline');
		expect(fixture.nativeElement.querySelector('.cr-detail__header .cr-status').textContent).toBe('APPROVED');
		expect(fixture.componentInstance.selectedId).toBe('CR-1');
		listSpy.mockResolvedValueOnce([]);
		fixture.nativeElement.querySelector('.cr-list__error button').click();
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__empty')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__no-matches')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__filter').value).toBe('PENDING_APPROVAL');
		expect(listSpy).toHaveBeenCalledTimes(3);
	});
});
