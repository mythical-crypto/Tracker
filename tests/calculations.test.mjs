import test from 'node:test';
import assert from 'node:assert/strict';
import { assetPnl, assetPriceHistory, convert, summarize, filterHistory, historyChange, periodChange, mergeAssetQuotes, mergePortfolio, mergeSnapshots, newer } from '../lib/calculations.ts';

test('USD totals use an explicit rate and absent FX stays unknown', () => {
  assert.equal(convert(2, 'USD', 85), 170);
  assert.equal(convert(2, 'USD', null), null);
  assert.equal(convert(null, 'RUB', 85), null);
  assert.equal(convert(2, 'USD', Infinity), null);
});
test('unknown purchase costs are excluded from PNL without hiding their market value', () => {
  const assets = [
    { quantity: 2, price: 5, cost: 7, realized: 1, currency: 'USD' },
    { quantity: 1, price: 100, cost: null, realized: null, currency: 'RUB' },
    { quantity: 1, price: null, cost: 200, realized: 0, currency: 'RUB' },
  ];
  const s = summarize(assets, 85);
  assert.equal(s.value, 950);
  assert.equal(s.cost, 795);
  assert.equal(s.pnl, 255);
  assert.equal(s.realized, 85);
  assert.equal(s.priced, 2);
  assert.equal(s.complete, false);
  assert.equal(s.knownCost, 2);
});
test('period filters use actual dates, preserve partial observations, and never invent history', () => {
  const now = Date.parse('2026-10-05T10:00:00Z');
  const snapshots = [{ at: '2026-09-27T10:00:00Z', value: 100, complete: true }, { at: '2026-10-04T10:00:00Z', value: 200, complete: false, pricedCount: 18, totalCount: 19 }];
  assert.deepEqual(filterHistory(snapshots, 'week', now), [snapshots[1]]);
  assert.deepEqual(filterHistory(snapshots, 'year', now), snapshots);
  assert.deepEqual(filterHistory([], 'year', now), []);
});

test('PNL comparison converts USD and RUB consistently and preserves unknown values', () => {
  const dollarAsset = { quantity: 1, price: 200, cost: 100, currency: 'USD' };
  const rubleAsset = { quantity: 1, price: 2000, cost: 1000, currency: 'RUB' };
  assert.ok(assetPnl(dollarAsset, 80) > assetPnl(rubleAsset, 80));
  assert.equal(assetPnl(dollarAsset, 80, true), 100);
  assert.equal(assetPnl({ ...dollarAsset, cost: null }, 80), null);
});

test('graph change requires matching coverage and recorded quantities, regardless of input ordering', () => {
  const first = { at: '2026-10-04', value: 100, complete: false, coverageKey: 'a', itemQuantities: { a: 2 } };
  assert.equal(historyChange([first]), null);
  assert.equal(historyChange([first, { ...first, at: '2026-10-05', value: 110 }]), 10);
  assert.equal(historyChange([first, { ...first, value: 200, coverageKey: 'a|b' }]), null);
  assert.equal(historyChange([first, { ...first, at: '2026-10-05', value: 200, itemQuantities: { a: 4 } }]), null);
  assert.equal(historyChange([first, { ...first, at: '2026-10-05', value: 110, itemQuantities: undefined }]), null);
  assert.equal(historyChange([{ ...first, at: '2026-10-05', value: 110 }, first]), 10);
});

test('unknown totals remain unknown while actual zero-cost positions retain their PNL', () => {
  const unknown = summarize([{ quantity: 1, price: null, cost: null, realized: null, currency: 'USD' }], null);
  assert.equal(unknown.value, null);
  assert.equal(unknown.cost, null);
  assert.equal(unknown.pnl, null);
  assert.equal(unknown.realized, null);
  const free = summarize([{ quantity: 1, price: 25, cost: 0, realized: 0, currency: 'RUB' }], null);
  assert.equal(free.pnl, 25);
  assert.equal(free.roi, null);
  assert.equal(free.cost, 0);
});

const comparisonNow = Date.parse('2026-10-05T10:00:00Z');
const observed = (at, value = 100, extra = {}) => ({ at, value, cost: 70, complete: true, coverageKey: 'a', quantityKey: 'a:2', ...extra });

test('daily weekly and monthly changes require a real full-period baseline and expose observation dates', () => {
  const last = observed('2026-10-05T10:00:00Z', 120);
  assert.equal(periodChange([observed('2026-10-05T09:00:00Z'), last], 7, comparisonNow).status, 'insufficient');
  const day = periodChange([observed('2026-10-04T09:45:00Z'), last], 1, comparisonNow);
  assert.equal(day.absolute, 20);
  assert.equal(day.percent, 20);
  assert.equal(day.from, '2026-10-04T09:45:00Z');
  assert.equal(day.to, last.at);
  assert.equal(periodChange([observed('2026-10-04T08:59:00Z'), last], 1, comparisonNow).status, 'insufficient');
  assert.equal(periodChange([observed('2026-09-28T08:00:00Z'), last], 7, comparisonNow).status, 'ready');
  assert.equal(periodChange([observed('2026-09-05T00:00:00Z'), last], 30, comparisonNow).status, 'ready');
  assert.equal(periodChange([observed('2026-09-04T00:00:00Z'), last], 30, comparisonNow).status, 'insufficient');
});

test('value trends reject changed quantities or coverage anywhere in the interval and stale quotes', () => {
  const first = observed('2026-10-04T10:00:00Z');
  const last = observed('2026-10-05T10:00:00Z', 120);
  const changed = observed('2026-10-05T09:00:00Z', 110, { quantityKey: 'a:3' });
  assert.equal(periodChange([first, changed, last], 1, comparisonNow).status, 'incomparable');
  assert.equal(periodChange([first, { ...last, coverageKey: 'a|b' }], 1, comparisonNow).status, 'incomparable');
  assert.equal(periodChange([first, { ...last, quantityKey: undefined }], 1, comparisonNow).status, 'incomparable');
  assert.equal(periodChange([first, { ...last, at: '2026-10-05T08:59:00Z' }], 1, comparisonNow).status, 'stale');
  assert.equal(periodChange([first, { ...last, itemUpdatedAt: { a: '2026-10-05T08:00:00Z' } }], 1, comparisonNow).status, 'stale');
});

test('unit-price history uses quote dates, excludes ambiguous legacy partial updates and never draws historical cost', () => {
  const asset = { id: 'a', name: 'Name', price: 8, cost: 50, averageBuyPrice: 5, quantity: 10, updatedAt: '2026-10-05T10:00:00Z' };
  const old = observed('2026-10-04T10:00:00Z', 12, { itemPrices: { a: 6 }, freshCount: 1, pricedCount: 1 });
  const partial = observed('2026-10-05T09:00:00Z', 20, { itemPrices: { a: 7 }, freshCount: 1, pricedCount: 2 });
  const repeated = { ...old, at: '2026-10-05T08:00:00Z', itemUpdatedAt: { a: old.at } };
  const history = assetPriceHistory(asset, [old, partial, repeated], comparisonNow);
  assert.deepEqual(history.map(s => s.at), [old.at, asset.updatedAt]);
  assert.deepEqual(history.map(s => s.value), [6, 8]);
  assert.ok(history.every(s => s.cost === null));
  assert.equal(periodChange(history, 1, comparisonNow).percent, (8 - 6) / 6 * 100);
  assert.equal(periodChange(assetPriceHistory({ ...asset, quantity: 99 }, [old], comparisonNow), 1, comparisonNow).percent, (8 - 6) / 6 * 100);
});

test('future and invalid observations cannot become period endpoints and zero baseline percent stays unknown', () => {
  const first = observed('2026-10-04T10:00:00Z', 0);
  const last = observed('2026-10-05T10:00:00Z', 10);
  const future = observed('2026-10-06T10:00:00Z', 500);
  const result = periodChange([future, observed('bad-date'), first, last], 1, comparisonNow);
  assert.equal(result.absolute, 10);
  assert.equal(result.percent, null);
  assert.deepEqual(filterHistory([first, last, future], 'day', comparisonNow), [first, last]);
});

test('source freshness is selected independently and history keeps local observations', () => {
  const snapshot = { at: '2026-10-05T10:00:00Z', value: 100, complete: true };
  const old = { at: '2026-10-04T10:00:00Z', value: 90, complete: true };
  assert.deepEqual(mergeSnapshots([snapshot], [old]), [old, snapshot]);
  assert.equal(newer(snapshot, old, s => s.at), snapshot);
  const current = {
    assets: [{ id: 'cs', class: 'cs2' }, { id: 'sb', class: 'sandbox' }, { id: 'cr', class: 'crypto' }],
    sources: { cs2: { at: snapshot.at }, sandbox: { at: snapshot.at }, crypto: { at: old.at } },
    history: { cs2: [snapshot], sandbox: [snapshot], crypto: [old] }, combinedHistory: [snapshot],
    usdRub: 80, sandboxNotes: ['local'], verifiedAt: snapshot.at,
  };
  const incoming = {
    ...current, assets: current.assets.map(a => ({ ...a, id: `${a.id}-incoming` })),
    sources: { cs2: { at: old.at }, sandbox: { at: null }, crypto: { at: snapshot.at } },
    history: { cs2: [old], sandbox: [], crypto: [old, snapshot] }, combinedHistory: [old],
    usdRub: 85, sandboxNotes: ['old'], verifiedAt: old.at,
  };
  const merged = mergePortfolio(current, incoming);
  assert.deepEqual(merged.assets.map(a => a.id), ['cs', 'sb', 'cr-incoming']);
  assert.deepEqual(merged.sandboxNotes, ['local']);
  assert.equal(merged.usdRub, 85);
  assert.deepEqual(merged.combinedHistory, [old, snapshot]);
});

test('partial source refresh preserves newer individual quotes while applying the latest ledger', () => {
  const current = { id: 'A', class: 'sandbox', currency: 'RUB', quantity: 2, cost: 50, price: 30, updatedAt: '2026-10-05T10:00:00Z' };
  const incoming = { ...current, quantity: 1, cost: 25, price: 20, updatedAt: '2026-10-05T09:00:00Z' };
  const [merged] = mergeAssetQuotes([incoming], [current]);
  assert.equal(merged.quantity, 1);
  assert.equal(merged.cost, 25);
  assert.equal(merged.price, 30);
  assert.equal(merged.updatedAt, current.updatedAt);
  const currentStatus = { at: current.updatedAt, attemptedAt: current.updatedAt };
  const failedStatus = { at: current.updatedAt, attemptedAt: '2026-10-05T11:00:00Z', error: 'Unavailable' };
  assert.equal(newer(currentStatus, failedStatus, s => s.attemptedAt).error, 'Unavailable');
});

test('delivery errors refresh and clear independently of quote and source attempt dates', () => {
  const snapshot = observed('2026-10-05T10:00:00Z');
  const status = { at: snapshot.at, attemptedAt: snapshot.at, readAt: snapshot.at, error: 'Steam failed' };
  const current = { assets: [], sources: { cs2: status, sandbox: status, crypto: status }, history: { cs2: [], sandbox: [], crypto: [] }, combinedHistory: [] };
  const failed = { ...status, readAt: '2026-10-05T10:05:00Z', deliveryError: 'GitHub unavailable' };
  const incoming = { ...current, sources: { ...current.sources, cs2: failed } };
  const merged = mergePortfolio(current, incoming);
  assert.equal(merged.sources.cs2.deliveryError, 'GitHub unavailable');
  assert.equal(merged.sources.cs2.error, 'Steam failed');
  const cleared = mergePortfolio(merged, { ...incoming, sources: { ...incoming.sources, cs2: { ...status, readAt: '2026-10-05T10:10:00Z' } } });
  assert.equal(cleared.sources.cs2.deliveryError, undefined);
  assert.equal(cleared.sources.cs2.error, 'Steam failed');
});
