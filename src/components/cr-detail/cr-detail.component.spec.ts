import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrDetailComponent } from './cr-detail.component';
import { SessionService } from '../../session/session.service';
import { details, users } from '../../api/fixtures';
import { CrDetail, ReqUser } from '../../models/cr.models';
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
