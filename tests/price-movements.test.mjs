import assert from 'node:assert/strict';
import test from 'node:test';
import { isSaleMedian, priceMovements } from '../lib/price-movements.ts';

function quote(day, value, coverageKey = 'cs2:Case') {
  return { at: new Date(Date.UTC(2026, 10, day)).toISOString(), value, coverageKey, quantityKey: 'cs2:Case:1', complete: true, cost: null };
}

test('returns actual pairs, latest first, with separate rankings by gain and loss', () => {
  const points = [quote(1, 10), quote(2, 8), quote(3, 8), quote(4, 10), quote(5, 7), quote(6, 7.5)];
  const moves = priceMovements(points, 'recent');
  assert.deepEqual(moves.map(move => move.delta), [.5, -3, 2, -2]);
  assert.deepEqual(moves[1], { from: points[3], to: points[4], delta: -3, percent: -30 });
  assert.equal(moves[2].from.at, points[2].at);
  assert.deepEqual(priceMovements(points, 'drops').map(move => move.delta), [-3, -2]);
  assert.deepEqual(priceMovements(points, 'gains').map(move => move.delta), [2, .5]);
});

test('gaps, changes of quote basis, and equal timestamps cannot create moves', () => {
  const median = 'cs2:Case:sale-median';
  const points = [quote(1, 10), quote(1, 9), quote(2, 100, median), quote(3, 20), quote(8, 1)];
  assert.equal(isSaleMedian(points[2]), true);
  assert.equal(isSaleMedian(points[0]), false);
  assert.deepEqual(priceMovements(points, 'recent'), []);
});

test('no invented baseline before the selected period or percentage on a zero quote', () => {
  const points = [quote(1, 20), quote(2, 0), quote(3, 2)];
  const moves = priceMovements(points.slice(1), 'recent');
  assert.deepEqual(moves.map(move => [move.delta, move.percent]), [[2, null]]);
  assert.deepEqual(priceMovements(points.slice(-1), 'recent'), []);
  assert.deepEqual(priceMovements([], 'recent'), []);
});
