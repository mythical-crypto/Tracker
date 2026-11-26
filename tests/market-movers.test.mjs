import test from 'node:test';
import assert from 'node:assert/strict';
import { marketMovers } from '../lib/market-movers.ts';

const now = Date.parse('2026-11-25T12:00:00Z');
function series(id, prices, hours = [-24, 0]) {
  const points = prices.map((value, i) => ({
    at: new Date(now + hours[i] * 3600000).toISOString(), value, complete: true,
    coverageKey: id, quantityKey: id + ':1',
  }));
  const after = points.at(-1);
  return [{ id, name: id, price: after.value, updatedAt: after.at }, points];
}
function compare(entries, period = 'latest') {
  return marketMovers(entries.map(([asset]) => asset), new Map(entries.map(([asset, points]) => [asset.id, points])), period, now);
}

test('ranks percentage moves with actual quote dates and native price differences', () => {
  const entries = [series('A', [10, 9]), series('B', [100, 120]), series('C', [5, 4])];
  const result = compare(entries);
  assert.deepEqual(result.map(move => [move.asset.id, move.absolute, move.percent]), [['C', -1, -20], ['A', -1, -10], ['B', 20, 20]]);
  assert.equal(result[0].before.at, '2026-11-24T12:00:00.000Z');
  assert.deepEqual(compare(entries, 1), result);
});

test('last observation does not masquerade as a full period or compare stale, zero-basis or different kinds of quote', () => {
  const recent = series('recent', [15, 14], [-5, -2]);
  const median = series('median', [15, 10]);
  median[1][0].coverageKey += ':sale-median';
  const old = series('old', [10, 15], [-180, -120]);
  const gap = series('gap', [10, 15], [-100, -1]);
  const zero = series('zero', [0, 2]);
  assert.deepEqual(compare([recent, median, old, gap, zero]).map(move => move.asset.id), ['recent']);
  assert.deepEqual(compare([recent], 1), []);
});
