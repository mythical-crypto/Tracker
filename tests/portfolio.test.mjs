import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv, aggregate } from '../scripts/import-csv.mjs';

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
  const live = JSON.parse(readFileSync(new URL('../data/live.json', import.meta.url)));
  const items = [...portfolio.items, ...portfolio.closedItems];
  assert.equal(items.reduce((sum, item) => sum + item.trades.length, 0), 110);
  assert.equal(portfolio.items.length, 48);
  assert.equal(portfolio.closedItems.length, 2);
  assert.ok(portfolio.items.every((item) => item.quantity > 0 && item.costKopecks > 0 && prices.items[item.name]?.priceKopecks > 0));
  assert.equal(prices.source, 'Steam Community Market');
  assert.equal(prices.currency, 'RUB');
  assert.deepEqual(live.prices, prices);
  assert.ok(live.history.snapshots.length >= 1);
});
