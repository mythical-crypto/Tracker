import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { refreshPrices } from '../scripts/update-prices.mjs';
import { refreshSandbox, updateExtras } from '../scripts/update-extras.mjs';
import { buildCryptoPortfolio, fetchCryptoSource, fetchSteamPrice, rublesToKopecks } from '../scripts/extra-sources.mjs';
import { combinedSnapshot } from '../scripts/record-total.mjs';

const oldAt = '2026-10-05T10:00:00.000Z';
const newAt = '2026-10-05T10:15:00.000Z';
const quiet = { log() {}, error() {} };

test('Steam parser requires a complete numeric RUB price and requests only Community Market RUB', async () => {
  assert.equal(rublesToKopecks('1\u00a0234,56 руб.'), 123456);
  assert.equal(rublesToKopecks('3.12 ₽'), 312);
  for (const price of ['-2 руб.', '1,234 руб.', '12oops руб.', '0 руб.']) assert.throws(() => rublesToKopecks(price));
  const price = await fetchSteamPrice('A/B', { appid: '730', fetchSource: async (url) => {
    assert.equal(url.origin, 'https://steamcommunity.com');
    assert.equal(url.searchParams.get('currency'), '5');
    assert.equal(url.searchParams.get('appid'), '730');
    assert.equal(url.searchParams.get('market_hash_name'), 'A/B');
    return { success: true, lowest_price: '1 234,56 руб.' };
  } });
  assert.equal(price, 1234.56);
  await assert.rejects(fetchSteamPrice('A', { fetchSource: async () => ({ success: true, lowest_price: '$2.00' }) }), /рубл/);
});

test('CS2 partial refresh records actual quote dates, quantity coverage and retained prices', async () => {
  const portfolio = { items: [{ name: 'A', quantity: 2, costKopecks: 100 }, { name: 'B', quantity: 3, costKopecks: 200 }] };
  const previous = { items: { A: { priceKopecks: 100, updatedAt: oldAt }, B: { priceKopecks: 200, updatedAt: oldAt } }, lastSuccessAt: oldAt, lastFullSuccessAt: oldAt };
  const result = await refreshPrices(portfolio, previous, { snapshots: [] }, { fetchQuote: async (name) => { if (name === 'B') throw new Error('HTTP 429'); return 150; }, wait: async () => {}, clock: () => newAt, logger: quiet });
  assert.equal(result.prices.items.B.updatedAt, oldAt);
  assert.equal(result.prices.items.B.priceKopecks, 200);
  assert.equal(result.prices.items.A.updatedAt, newAt);
  const snapshot = result.history.snapshots[0];
  assert.equal(snapshot.valueKopecks, 900);
  assert.equal(snapshot.freshCount, 1);
  assert.equal(snapshot.complete, true);
  assert.deepEqual(snapshot.itemQuantities, { A: 2, B: 3 });
  assert.deepEqual(snapshot.itemUpdatedAt, { A: newAt, B: oldAt });
  assert.equal(result.prices.lastFullSuccessAt, oldAt);
  assert.equal(previous.items.A.priceKopecks, 100);
});

test('Steam rate limiting stops requests after three failures and creates no fresh historical point', async () => {
  let calls = 0;
  const items = Array.from({ length: 10 }, (_, index) => ({ name: `A${index}`, quantity: 1, costKopecks: 100, price: 1, updatedAt: oldAt }));
  const previousPrices = { items: Object.fromEntries(items.map((item) => [item.name, { priceKopecks: 100, updatedAt: oldAt }])), lastSuccessAt: oldAt };
  const result = await refreshPrices({ items }, previousPrices, { snapshots: [] }, { fetchQuote: async () => { calls++; throw new Error('HTTP 429'); }, wait: async () => {}, clock: () => newAt, logger: quiet });
  assert.equal(calls, 3);
  assert.equal(result.successful, 0);
  assert.equal(result.errors, 10);
  assert.deepEqual(result.history.snapshots, []);
  assert.equal(result.prices.lastSuccessAt, oldAt);
  calls = 0;
  const sandbox = await refreshSandbox({ items, fetchedAt: oldAt, snapshots: [] }, { fetchPrice: async () => { calls++; throw new Error('HTTP 503'); }, pause: async () => {}, now: newAt });
  assert.equal(calls, 3);
  assert.equal(sandbox.errorCount, 10);
  assert.equal(sandbox.portfolio.fetchedAt, oldAt);
  assert.equal(sandbox.portfolio.snapshots.length, 0);
});

test('rate-limited refreshes prioritize the oldest quotes so later positions are not starved', async () => {
  const items = [{ name: 'Fresh', quantity: 1, costKopecks: 100 }, { name: 'Old', quantity: 1, costKopecks: 100 }, { name: 'Unknown', quantity: 1, costKopecks: 100 }];
  const order = [];
  await refreshPrices({ items }, { items: { Fresh: { priceKopecks: 100, updatedAt: newAt }, Old: { priceKopecks: 100, updatedAt: oldAt } } }, { snapshots: [] }, { fetchQuote: async (name) => { order.push(name); return 100; }, wait: async () => {}, clock: () => newAt, logger: quiet });
  assert.deepEqual(order, ['Unknown', 'Old', 'Fresh']);
});

test('missing crypto quotes keep the previous observation and FX date without another historical point', () => {
  const payload = { portfolios: [{ name: 'Asset', symbol: 'A', slug: 'a', currencyId: 1, quantity: 2, price: { USD: 4 }, initialCap: { USD: 7 } }], portfolioTotal: { totalCap: { USD: 8, RUB: 640 }, initialCap: { USD: 7 } } };
  const first = buildCryptoPortfolio({ payload, transactions: [], fetchedAt: oldAt });
  payload.portfolios[0].price.USD = null;
  payload.portfolioTotal = { totalCap: { USD: -8, RUB: 640 } };
  const next = buildCryptoPortfolio({ payload, transactions: [], previous: first, fetchedAt: newAt });
  assert.equal(next.snapshots.length, 1);
  assert.equal(next.fetchedAt, oldAt);
  assert.equal(next.items[0].updatedAt, oldAt);
  assert.equal(next.usdRub, 80);
  assert.equal(next.fxUpdatedAt, oldAt);
  assert.equal(next.freshCount, 0);
  assert.match(next.error, /0\/1/);
  payload.portfolios[0].quantity = null;
  assert.throws(() => buildCryptoPortfolio({ payload, transactions: [], previous: first, fetchedAt: newAt }), /quantity/);
});

test('crypto missing transaction dates stay unknown and known costs come from covered assets', () => {
  const payload = { portfolios: [{ name: 'Asset', symbol: 'A', slug: 'a', currencyId: 1, quantity: 2, price: { USD: 4 }, initialCap: { USD: 7 } }, { name: 'Other', symbol: 'B', slug: 'b', currencyId: 2, quantity: 1, price: { USD: 1 }, initialCap: { USD: null } }], portfolioTotal: { initialCap: { USD: 100 } } };
  const transactions = [{ currencyId: 1, quantity: 2, priceUsd: 3.5, transactionType: 'BUY', txDate: null }];
  const result = buildCryptoPortfolio({ payload, transactions, fetchedAt: newAt });
  assert.equal(result.items[0].trades[0].date, null);
  assert.equal(result.snapshots[0].cost, 7);
  assert.equal(result.snapshots[0].sourceCost, 100);
  assert.equal(result.snapshots[0].costComplete, false);
  assert.equal(result.snapshots[0].freshCount, 2);
});

test('DropsTab must complete transaction pagination before replacing its saved ledger', async () => {
  const group = { portfolios: [] };
  await assert.rejects(fetchCryptoSource({ fetchSource: async (url) => String(url).includes('/transactions') ? { content: [{ id: 1 }], last: true, totalElements: 2 } : group }), /1\/2/);
  let pages = 0;
  await assert.rejects(fetchCryptoSource({ fetchSource: async (url) => {
    if (!String(url).includes('/transactions')) return group;
    pages++;
    return { content: [{ id: pages }], last: false };
  } }), /20 pages/);
  assert.equal(pages, 20);
});

test('combined snapshots use real quote dates, convertible item values and reject duplicate failed refreshes', () => {
  const cs = { items: [{ name: 'A', quantity: 2, costKopecks: 100 }] };
  const prices = { items: { A: { priceKopecks: 200, updatedAt: oldAt } } };
  const sb = { items: [{ id: 'sb', quantity: 1, price: null, cost: null, currency: 'RUB', updatedAt: null }] };
  const cr = { usdRub: 80, fxUpdatedAt: oldAt, items: [{ id: 'crypto-b', quantity: 3, price: 4, cost: 6, currency: 'USD', updatedAt: oldAt }] };
  const first = combinedSnapshot(cs, prices, sb, cr, { snapshots: [] }, newAt);
  assert.equal(first.value, 964);
  assert.equal(first.complete, false);
  assert.deepEqual(first.itemQuantities, { 'cs2:A': 2, sb: 1, 'crypto-b': 3 });
  assert.deepEqual(first.itemPrices, { 'cs2:A': 2, 'crypto-b': 320 });
  assert.equal(first.itemUpdatedAt['cs2:A'], oldAt);
  assert.equal(combinedSnapshot(cs, prices, sb, cr, { snapshots: [first] }, '2026-10-05T10:30:00.000Z'), null);
  prices.items.A.updatedAt = '2026-10-05T10:29:00.000Z';
  assert.equal(combinedSnapshot(cs, prices, sb, cr, { snapshots: [first] }, '2026-10-05T10:30:00.000Z').freshCount, 1);
});

test('a Sandbox source failure preserves its ledger and does not prevent an independent crypto update', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'tracker-source-test-'));
  const sandboxPath = join(folder, 'sandbox.json');
  const cryptoPath = join(folder, 'crypto.json');
  const previous = { fetchedAt: oldAt, notes: [], items: [{ id: 'a', quantity: 1, price: 2, updatedAt: oldAt, trades: [{ id: 'confirmed' }] }], snapshots: [{ at: oldAt, value: 2 }] };
  try {
    await writeFile(sandboxPath, JSON.stringify(previous));
    await writeFile(cryptoPath, JSON.stringify(previous));
    const result = await updateExtras({ sandboxPath, cryptoPath, now: newAt, logger: quiet, sandboxRefresh: async () => { throw new Error('Sandbox failed'); }, cryptoRefresh: async () => ({ portfolio: { ...previous, freshCount: 1, fetchedAt: newAt }, transactionCount: 1 }) });
    assert.equal(result.successes, 1);
    const sandbox = JSON.parse(await readFile(sandboxPath, 'utf8'));
    const crypto = JSON.parse(await readFile(cryptoPath, 'utf8'));
    assert.deepEqual(sandbox.items, previous.items);
    assert.deepEqual(sandbox.snapshots, previous.snapshots);
    assert.equal(sandbox.fetchedAt, oldAt);
    assert.equal(sandbox.attemptedAt, newAt);
    assert.equal(sandbox.freshCount, 0);
    assert.equal(crypto.fetchedAt, newAt);
  } finally {
    await unlink(sandboxPath);
    await unlink(cryptoPath);
    await rmdir(folder);
  }
});
