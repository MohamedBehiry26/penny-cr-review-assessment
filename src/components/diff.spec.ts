import { computeDiff } from './diff.util';
import { LineItem } from '../models/cr.models';

const base: LineItem[] = [
	{ sku: 'SKU-A', description: 'Widget A', quantity: 10, unitPrice: 500 },
	{ sku: 'SKU-B', description: 'Widget B', quantity: 30, unitPrice: 100 },
];

describe('computeDiff', () => {
	it('detects a removed sku', () => {
		expect(computeDiff(base, [base[0]]).find((r) => r.sku === 'SKU-B')?.kind).toBe('removed');
	});

	it('detects an added sku', () => {
		const rows = computeDiff(base, [...base, { sku: 'SKU-C', description: 'C', quantity: 1, unitPrice: 5 }]);
		expect(rows.find((r) => r.sku === 'SKU-C')?.kind).toBe('added');
	});

	it('detects a quantity-only change as changed', () => {
		// SKU-A quantity 10 -> 11 (same unit price) is a real change.
		const rows = computeDiff(base, [{ ...base[0], quantity: 11 }, base[1]]);
		expect(rows.find((r) => r.sku === 'SKU-A')?.kind).toBe('changed');
	});

	it('detects a description-only change as changed', () => {
		const rows = computeDiff(base, [{ ...base[0], description: 'Widget A (new supplier)' }, base[1]]);
		expect(rows.find((r) => r.sku === 'SKU-A')?.kind).toBe('changed');
	});

	it('detects a unit-price-only change as changed', () => {
		const rows = computeDiff(base, [{ ...base[0], unitPrice: 501 }, base[1]]);
		expect(rows.find((r) => r.sku === 'SKU-A')?.kind).toBe('changed');
	});

	it('classifies equal values in separate objects as unchanged', () => {
		const rows = computeDiff(
			base,
			base.map((item) => ({ ...item })),
		);
		expect(rows.map((row) => row.kind)).toEqual(['unchanged', 'unchanged']);
	});

	it.each([{ quantity: 0 }, { unitPrice: 0 }, { description: '' }])('detects a change to an empty or zero value: %p', (change) => {
		const rows = computeDiff([base[0]], [{ ...base[0], ...change }]);
		expect(rows[0].kind).toBe('changed');
	});

	it('returns no rows for empty inputs', () => {
		expect(computeDiff([], [])).toEqual([]);
	});

	it('classifies every item as added or removed when one side is empty', () => {
		expect(computeDiff([], base)).toEqual(base.map((item) => ({ sku: item.sku, kind: 'added', proposed: item })));
		expect(computeDiff(base, [])).toEqual(base.map((item) => ({ sku: item.sku, kind: 'removed', baseline: item })));
	});

	it('treats a different sku as a removal and addition', () => {
		const replacement = { ...base[0], sku: 'SKU-C' };
		expect(computeDiff([base[0]], [replacement])).toEqual([
			{ sku: 'SKU-A', kind: 'removed', baseline: base[0] },
			{ sku: 'SKU-C', kind: 'added', proposed: replacement },
		]);
	});

	it('matches by sku regardless of proposed order without mutating inputs', () => {
		const baseline = base.map((item) => ({ ...item }));
		const proposed = [{ ...base[1] }, { ...base[0], quantity: 11 }];
		const beforeBaseline = baseline.map((item) => ({ ...item }));
		const beforeProposed = proposed.map((item) => ({ ...item }));
		baseline.forEach(Object.freeze);
		proposed.forEach(Object.freeze);
		Object.freeze(baseline);
		Object.freeze(proposed);

		expect(computeDiff(baseline, proposed)).toEqual([
			{ sku: 'SKU-A', kind: 'changed', baseline: beforeBaseline[0], proposed: beforeProposed[1] },
			{ sku: 'SKU-B', kind: 'unchanged', baseline: beforeBaseline[1], proposed: beforeProposed[0] },
		]);
		expect(baseline).toEqual(beforeBaseline);
		expect(proposed).toEqual(beforeProposed);
	});
});
