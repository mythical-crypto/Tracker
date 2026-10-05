import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv, aggregate } from '../scripts/import-csv.mjs';
import { retainSnapshots } from '../scripts/history.mjs';

test('история сохраняет 15-минутные наблюдения, недельные и годовые точки без лимита 240', () => {
  const now = Date.parse('2026-09-28T00:00:00Z');
  const count = 400 * 96;
  const snapshots = Array.from({ length: count }, (_, index) => ({ at: new Date(now - (count - index) * 15 * 60 * 1000).toISOString() }));
  const retained = retainSnapshots(snapshots, now);
  assert.deepEqual(retained.slice(-192), snapshots.slice(-192));
  for (const days of [7, 30, 365, 390]) {
    const target = now - days * 86400000;
    assert.ok(retained.some((snapshot) => Math.abs(Date.parse(snapshot.at) - target) < (days > 366 ? 7 : 1) * 86400000));
  }
  assert.ok(retained.length > 600 && retained.length < 900);
  assert.ok(retained.every((snapshot) => snapshots.includes(snapshot)));
  assert.deepEqual(retainSnapshots([...snapshots].reverse(), now), retained);
});

test('CSV сохраняет кавычки, запятые и русские названия', () => {
  const rows = parseCsv('Name,Type,Quantity\n"Sticker | Тест, \""Gold\""",buy,2\n');
  assert.equal(rows[0].Name, 'Sticker | Тест, "Gold"');
  assert.equal(rows[0].Quantity, '2');
});

test('FIFO учитывает продажу и оставшуюся себестоимость', () => {
  const base = { name: 'Case', category: 'Кейсы', feeKopecks: 0, date: '2026-01-01' };
  const [item] = aggregate([
    { ...base, type: 'buy', quantity: 2, unitKopecks: 1000, totalKopecks: 2000 },
    { ...base, type: 'buy', quantity: 1, unitKopecks: 2000, totalKopecks: 2000 },
    { ...base, type: 'sell', quantity: 2, unitKopecks: 1500, totalKopecks: 3000 },
  ]);
  assert.equal(item.quantity, 1);
  assert.equal(item.costKopecks, 2000);
  assert.equal(item.realizedKopecks, 1000);
});

test('импорт содержит все операции и Steam-цены для открытых позиций', () => {
  const portfolio = JSON.parse(readFileSync(new URL('../data/portfolio.json', import.meta.url)));
  const prices = JSON.parse(readFileSync(new URL('../data/prices.json', import.meta.url)));
  const history = JSON.parse(readFileSync(new URL('../data/history.json', import.meta.url)));
  const live = JSON.parse(readFileSync(new URL('../data/live.json', import.meta.url)));
  const items = [...portfolio.items, ...portfolio.closedItems];
  assert.equal(items.reduce((sum, item) => sum + item.trades.length, 0), 110);
  assert.equal(portfolio.items.length, 48);
  assert.equal(portfolio.closedItems.length, 2);
  assert.ok(portfolio.items.every((item) => item.quantity > 0 && item.costKopecks > 0 && prices.items[item.name]?.priceKopecks > 0));
  assert.equal(prices.source, 'Steam Community Market');
  assert.equal(prices.currency, 'RUB');
  assert.deepEqual(live.prices, prices);
  assert.deepEqual(live.history, history);
  assert.ok(history.snapshots.length >= 2);
  for (const snapshot of history.snapshots.filter((entry) => entry.freshCount === entry.totalCount)) {
    assert.equal(Object.keys(snapshot.itemPrices).length, portfolio.items.length);
    assert.equal(portfolio.items.reduce((sum, item) => sum + item.quantity * snapshot.itemPrices[item.name], 0), snapshot.valueKopecks);
  }
});
