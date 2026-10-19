import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrListComponent } from './cr-list.component';
import { SessionService } from '../../session/session.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';
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
