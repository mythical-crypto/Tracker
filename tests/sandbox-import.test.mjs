import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSandboxHistory, parseSteamDate, parseSteamRubles, importSandboxHistory } from '../scripts/import-sandbox-history.mjs';
import { buildSandboxPortfolio } from '../scripts/extra-sources.mjs';
import { tradeDate, newestTradeFirst } from '../lib/trades.ts';
import { newerLedger, mergeAssetQuotes, mergePortfolio } from '../lib/calculations.ts';

const header = ['Item Name', 'Game Name', 'Acted On', 'Display Price', 'Price in Cents', 'Type', 'Market Name', 'App Id', 'Asset Id', 'Class Id'];
const csv = rows => [header, ...rows].map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
const row = (name, qty, price, type = 'purchase', id = 'asset') => [qty === 1 ? name : `${qty} ${name}`, 's&box', '12 мая', price, '9822800', type, name, '590830', id, 'class'];

test('Steam history selects app ID, reads grouped quantities and display RUB totals', () => {
  const source = csv([row('Aviator Helmet', 4, '982,28 руб.'), ['Other', 's&box', 'bad date', 'bad price', '', 'purchase', 'Other', '730', 'a', 'b']]);
  const result = parseSandboxHistory(source, { year: 2026 });
  assert.equal(result.ignoredRows, 1);
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].trade.quantity, 4);
  assert.equal(result.transactions[0].trade.total, 982.28);
  assert.equal(result.transactions[0].trade.unitPrice, 245.57);
  assert.equal(result.transactions[0].trade.date, '2026-05-12');
  assert.equal(result.transactions[0].trade.feeUnknown, true);
  assert.equal(parseSteamRubles('1 599,90 руб.'), 159990);
  assert.equal(parseSteamRubles('330 руб.'), 33000);
  assert.throws(() => parseSteamRubles('$2.00'), /рублях/);
});

test('identical Steam rows retain multiplicity and stable IDs instead of losing sales', () => {
  const source = csv([row('Navy Check Raincoat with Cap', 1, '674,58 руб.', 'sale'), row('Navy Check Raincoat with Cap', 1, '674,58 руб.', 'sale')]);
  const first = parseSandboxHistory(source, { year: 2026 });
  assert.equal(first.duplicateRows, 1);
  assert.equal(first.transactions.length, 2);
  assert.notEqual(first.transactions[0].trade.id, first.transactions[1].trade.id);
  assert.deepEqual(parseSandboxHistory(source, { year: 2026 }), first);
});

test('Steam dates keep day precision, require valid dates and do not invent a year or time', () => {
  const unknown = parseSteamDate('16 мар');
  assert.equal(unknown.date, null);
  assert.equal(tradeDate(unknown), '16 мар · год неизвестен');
  assert.match(tradeDate(parseSteamDate('12 мая', 2026)), /2026/);
  assert.doesNotMatch(tradeDate(parseSteamDate('12 мая', 2026)), /\d\d:\d\d/);
  assert.throws(() => parseSteamDate('31 апр', 2026), /Некорректная дата/);
  assert.throws(() => parseSteamDate('29 фев', 2026), /Некорректная дата/);
  assert.equal(parseSteamDate('29 фев 2024').date, '2024-02-29');
  const trades = [parseSteamDate('16 мар', 2026), parseSteamDate('12 мая', 2026)].sort(newestTradeFirst);
  assert.equal(trades[0].date, '2026-05-12');
});

test('partial import replaces display placeholders without duplicating aggregate positions', () => {
  const previous = buildSandboxPortfolio({ inventory: null });
  const parsed = parseSandboxHistory(csv([row('Aviator Helmet', 4, '982,28 руб.')]), { year: 2026 });
  const next = importSandboxHistory(previous, parsed, { importedAt: '2026-10-05T14:00:00Z' });
  const old = previous.items.find(item => item.name === 'Aviator Helmet');
  const item = next.items.find(item => item.name === old.name);
  assert.equal(item.quantity, 32);
  assert.equal(item.cost, old.cost);
  assert.equal(item.averageBuyPrice, old.averageBuyPrice);
  assert.equal(item.trades.length, 1);
  assert.equal(item.trades[0].quantity, 4);
  assert.equal(item.historyIncomplete, true);
  const again = importSandboxHistory(next, parsed);
  assert.deepEqual(again.items, next.items);
  const refreshed = buildSandboxPortfolio({ inventory: null, previous: next, fetchedAt: '2026-10-05T15:00:00Z', prices: { 'Aviator Helmet': { price: 300, updatedAt: '2026-10-05T15:00:00Z' } } });
  assert.deepEqual(refreshed.items.find(asset => asset.id === item.id).trades, item.trades);
  assert.deepEqual(refreshed.historyImport, next.historyImport);
});

test('stored Sandbox import reconciles quantities, confirmed sales, source totals and inventory-only costs', () => {
  const portfolio = JSON.parse(readFileSync(new URL('../data/sandbox.json', import.meta.url), 'utf8'));
  const confirmed = portfolio.items.flatMap(item => item.trades).filter(trade => trade.source === 'steam-csv');
  assert.equal(confirmed.length, 35);
  assert.equal(portfolio.historyImport.buyCount, 28);
  assert.equal(portfolio.historyImport.sellCount, 7);
  assert.equal(portfolio.historyImport.boughtQuantity, 105);
  assert.equal(portfolio.historyImport.soldQuantity, 15);
  assert.equal(portfolio.historyImport.buyTotal, 21421.84);
  assert.equal(portfolio.historyImport.sellTotal, 10115.37);
  assert.ok(confirmed.every(trade => trade.date.startsWith('2026-') && trade.feeUnknown));
  assert.equal(portfolio.items.reduce((sum, item) => sum + item.quantity, 0), 362);
  assert.equal(Math.round(portfolio.items.reduce((sum, item) => sum + (item.cost ?? 0), 0) * 100), 7233912);
  assert.ok(portfolio.items.every(item => item.verifiedQuantity === item.quantity));
  assert.equal(portfolio.items.find(item => item.name === 'QA Team T-Shirt').cost, null);
  assert.equal(portfolio.items.find(item => item.name === 'Lifejacket').cost, 677.35);
  assert.ok(Math.abs(portfolio.items.find(item => item.name.startsWith('Navy Check')).realized - 6680.37) < 1e-9);
  assert.ok(!portfolio.items.flatMap(item => item.trades).some(trade => trade.id === 'sandbox-sale-assumed-1'));
});

test('newer price files do not replace imported accounting; their quotes remain usable', () => {
  const imported = { ledgerAt: '2026-10-05T14:00:00Z', at: '2026-10-05T12:00:00Z', items: [{ id: 'one', class: 'sandbox', currency: 'RUB', price: 1, updatedAt: '2026-10-05T12:00:00Z', trades: ['confirmed'] }] };
  const quotes = { at: '2026-10-05T15:00:00Z', items: [{ ...imported.items[0], price: 2, updatedAt: '2026-10-05T15:00:00Z', trades: [] }] };
  assert.equal(newerLedger(imported, quotes, p => p.ledgerAt, p => p.at), imported);
  assert.equal(newerLedger(quotes, imported, p => p.ledgerAt, p => p.at), imported);
  const merged = mergeAssetQuotes(imported.items, quotes.items);
  assert.equal(merged[0].price, 2);
  assert.deepEqual(merged[0].trades, ['confirmed']);
  const status = { name: 'Steam', url: 'https://steamcommunity.com', at: imported.at };
  const current = { assets: imported.items, sources: { cs2: status, sandbox: { ...status, ledgerAt: imported.ledgerAt }, crypto: status }, history: { cs2: [], sandbox: [], crypto: [] }, combinedHistory: [], sandboxNotes: ['keep imported history'], verifiedAt: null };
  const incoming = { ...current, assets: quotes.items, sources: { ...current.sources, sandbox: { ...status, at: quotes.at } }, sandboxNotes: [] };
  const refreshed = mergePortfolio(current, incoming);
  assert.equal(refreshed.sources.sandbox.ledgerAt, imported.ledgerAt);
  assert.equal(refreshed.sources.sandbox.at, quotes.at);
  assert.equal(refreshed.assets[0].price, 2);
  assert.deepEqual(refreshed.assets[0].trades, ['confirmed']);
  assert.deepEqual(refreshed.sandboxNotes, current.sandboxNotes);
});
