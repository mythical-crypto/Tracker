import test from 'node:test';
import assert from 'node:assert/strict';
import { assetStatistics } from '../lib/asset-statistics.ts';

const asset = (patch = {}) => ({ quantity: 4, price: 15, cost: 40, realized: 7, trades: [], ...patch });
const trade = (type, quantity, total, extra = {}) => ({ type, quantity, total, date: '2026-10-01', fee: 0, ...extra });

test('position statistics separate remaining cost, unrealized and realized results', () => {
  const s = assetStatistics(asset({ trades: [trade('buy', 6, 60), trade('sell', 2, 27)] }));
  assert.equal(s.value, 60);
  assert.equal(s.pnl, 20);
  assert.equal(s.roi, 50);
  assert.equal(s.basis, 10);
  assert.equal(s.totalResult, 27);
  assert.equal(s.boughtQuantity, 6);
  assert.equal(s.soldQuantity, 2);
  assert.equal(s.buyTotal, 60);
  assert.equal(s.sellTotal, 27);
});
test('incomplete Sandbox operations do not replace authoritative accounting', () => {
  const s = assetStatistics(asset({ historyIncomplete: true, accounting: { boughtQuantity: 10, buyCost: 100, soldQuantity: 6, soldTotal: 67 }, trades: [trade('buy', 2, 20)] }));
  assert.equal(s.boughtQuantity, 10);
  assert.equal(s.buyTotal, 100);
  assert.equal(s.soldQuantity, 6);
  assert.equal(s.sellTotal, 67);
  assert.equal(s.buyCount, 1);
});
test('unknown quote, cost and sales result stay unknown; free positions have no invented ROI', () => {
  assert.equal(assetStatistics(asset({ price: null })).value, null);
  assert.equal(assetStatistics(asset({ price: null })).pnl, null);
  assert.equal(assetStatistics(asset({ cost: null })).basis, null);
  assert.equal(assetStatistics(asset({ cost: null })).pnl, null);
  assert.equal(assetStatistics(asset({ realized: null })).totalResult, null);
  const free = assetStatistics(asset({ cost: 0 }));
  assert.equal(free.pnl, 60);
  assert.equal(free.roi, null);
});
test('closed positions retain sales results and disclose missing fees and dates', () => {
  const s = assetStatistics(asset({ quantity: 0, cost: 0, realized: -5, trades: [trade('sell', 4, 35, { date: null, feeUnknown: true })] }));
  assert.equal(s.value, 0);
  assert.equal(s.basis, null);
  assert.equal(s.totalResult, -5);
  assert.equal(s.unknownDates, 1);
  assert.equal(s.unknownFees, 1);
  const closedUnknownBasis = assetStatistics(asset({ quantity: 0, cost: null, price: null, realized: -5 }));
  assert.equal(closedUnknownBasis.value, 0);
  assert.equal(closedUnknownBasis.totalResult, -5);
});
test('a position without accounting or operations has unknown transaction totals, not zero', () => {
  const s = assetStatistics(asset({ cost: null, price: null, realized: null }));
  assert.equal(s.hasHistory, false);
  assert.equal(s.boughtQuantity, null);
  assert.equal(s.soldQuantity, null);
  assert.equal(s.buyTotal, null);
  assert.equal(s.sellTotal, null);
});
