import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCryptoPortfolio, buildSandboxPortfolio } from '../scripts/extra-sources.mjs';
import { refreshSandbox } from '../scripts/update-extras.mjs';
import { summarizeCosts, annotateCostCoverage } from '../scripts/cost-coverage.mjs';

const read = (file) => JSON.parse(readFileSync(new URL(`../data/${file}.json`, import.meta.url), 'utf8'));

test('sandbox keeps raw buy lots, weighted costs, the provisional sale and inventory-only items', () => {
  const portfolio = buildSandboxPortfolio({ previous: { items: read('sandbox').items.map(({ accounting, historyIncomplete, ...item }) => item) }, inventory: null });
  const items = new Map(portfolio.items.map((item) => [item.name, item]));
  assert.equal(portfolio.items.length, 19);
  assert.equal(portfolio.source, 'Steam Community Market');
  assert.equal(portfolio.items.reduce((sum, item) => sum + item.trades.length, 0), 20);
  const crossbody = items.get('Crossbody Bag Shirt');
  assert.equal(crossbody.quantity, 37);
  assert.equal(crossbody.cost, 7140);
  assert.equal(crossbody.averageBuyPrice, 7140 / 37);
  const navy = items.get('Navy Check Raincoat with Cap');
  assert.equal(navy.quantity, 1);
  assert.equal(navy.cost, 229);
  assert.ok(Math.abs(navy.realized - 6676.8) < 1e-9);
  assert.equal(navy.trades.at(-1).date, null);
  assert.equal(navy.trades.at(-1).feeUnknown, true);
  assert.equal(navy.trades[0].feeUnknown, true);
  assert.ok(portfolio.notes.some((note) => note.includes('предварительная')));
  for (const name of ['QA Team T-Shirt', 'Lifejacket']) {
    assert.equal(items.get(name).quantityStatus, 'extra');
    assert.equal(items.get(name).cost, null);
    assert.equal(items.get(name).trades.length, 0);
  }
  assert.equal(portfolio.items.filter((item) => item.quantityStatus === 'match').length, 17);
});

test('crypto preserves seven assets, closed PX, source fees, and FX provenance', () => {
  const portfolio = read('crypto');
  const items = new Map(portfolio.items.map((item) => [item.symbol, item]));
  assert.equal(portfolio.items.length, 7);
  assert.equal(portfolio.source, 'DropsTab');
  assert.ok(portfolio.items.every((item) => item.source === 'DropsTab'));
  assert.equal(portfolio.items.reduce((sum, item) => sum + item.trades.length, 0), 44);
  assert.equal(portfolio.items.filter((item) => item.quantity > 0).length, 6);
  assert.equal(items.get('PX').quantity, 0);
  assert.equal(items.get('PX').trades.length, 3);
  assert.equal(items.get('PX').realized, -30.307256);
  assert.equal(items.get('ASTER').currency, 'USD');
  assert.ok(items.get('ASTER').trades.some((trade) => trade.fee > 0 && trade.date && trade.total === trade.quantity * trade.unitPrice));
  assert.ok(portfolio.usdRub > 0);
  assert.match(portfolio.fxSource, /DropsTab/);
  assert.equal(portfolio.sourceUrl, 'https://dropstab.com/p/na-piccu-x62hsarup5');
  assert.doesNotMatch(JSON.stringify(portfolio), /1169512|mythical|shareToken|profileImage/i);
  const feeTrade = portfolio.items.flatMap((item) => item.trades).find((trade) => trade.feeQuantity > 0);
  assert.ok(feeTrade);
  assert.ok(feeTrade.feeCurrency);
  assert.ok(['CURRENCY', 'PERCENT'].includes(feeTrade.feeType));
  assert.ok(portfolio.snapshots.length >= 1);
  assert.equal(portfolio.snapshots.at(-1).at, portfolio.fetchedAt);
  assert.ok(portfolio.snapshots.every((snapshot) => snapshot.coverageKey && snapshot.pricedCount <= snapshot.totalCount));
  assert.ok(portfolio.snapshots.every((snapshot) => snapshot.source === 'DropsTab'));
});

test('sandbox partial refresh preserves quote dates, verification, icons, and partial snapshots', async () => {
  const previous = read('sandbox');
  const failedNames = new Set(['Punk Helmet', 'QA Team T-Shirt']);
  const result = await refreshSandbox(previous, {
    now: '2026-10-06T00:00:00.000Z',
    fetchPrice: async (name) => {
      if (failedNames.has(name)) throw new Error('offline');
      return 123;
    },
    pause: async () => {},
  });
  const nextByName = new Map(result.portfolio.items.map((item) => [item.name, item]));
  assert.equal(nextByName.get('Punk Helmet').verifiedQuantity, 25);
  assert.equal(nextByName.get('Punk Helmet').price, previous.items.find((item) => item.name === 'Punk Helmet').price);
  assert.equal(nextByName.get('Punk Helmet').updatedAt, previous.items.find((item) => item.name === 'Punk Helmet').updatedAt);
  assert.equal(nextByName.get('Punk Helmet').icon, previous.items.find((item) => item.name === 'Punk Helmet').icon);
  assert.equal(nextByName.get('QA Team T-Shirt').quantityStatus, 'extra');
  assert.equal(result.portfolio.verifiedAt, previous.verifiedAt);
  assert.equal(result.portfolio.fetchedAt, '2026-10-06T00:00:00.000Z');
  assert.equal(result.errorCount, 2);
  assert.deepEqual(result.portfolio.historyImport, previous.historyImport);
  assert.deepEqual(result.portfolio.items.map(item => item.trades), previous.items.map(item => item.trades));
  assert.equal(nextByName.get('Lifejacket').cost, 677.35);
  assert.ok(Math.abs(nextByName.get('Navy Check Raincoat with Cap').realized - 6680.37) < 1e-9);
  const snapshot = result.portfolio.snapshots.at(-1);
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.pricedCount, 18);
  assert.equal(snapshot.totalCount, 19);
  assert.ok(snapshot.cost > 0);
  assert.equal(snapshot.knownCostCount, result.portfolio.items.filter((item) => item.quantity > 0 && item.cost !== null).length);
  assert.equal(snapshot.costComplete, false);
  assert.ok(snapshot.coverageKey.split('|').length === 18);
});

test('crypto builder retains trades and calculates a live portfolio conversion ratio', () => {
  const fixture = {
    updatedAt: 1000,
    portfolios: [{
      name: 'Example', slug: 'example', symbol: 'EX', currencyId: 8,
      quantity: '2', price: { USD: '4' }, initialCap: { USD: '7' }, averageBuyPrice: { USD: '3.5' },
      totalCap: { USD: '8' }, realizedProfit: { USD: '0' }, image: '',
    }],
    portfolioTotal: { totalCap: { USD: '8', RUB: '680' }, initialCap: { USD: '7' } },
  };
  const trade = { id: 1, groupId: 1169512, currencyId: 8, transactionType: 'BUY', quantity: 2, priceUsd: 3.5, fee: 0.1, txDate: 1000 };
  const portfolio = buildCryptoPortfolio({ payload: fixture, transactions: [trade], fetchedAt: '2026-10-05T00:00:00.000Z' });
  assert.equal(portfolio.items[0].trades[0].date, '1970-01-01T00:00:01.000Z');
  assert.equal(portfolio.items[0].trades[0].total, 7);
  assert.equal(portfolio.usdRub, 85);
  assert.equal(portfolio.items[0].updatedAt, portfolio.fetchedAt);
});

test('crypto quote timestamps describe fetches and preserve stale fallback dates', () => {
  const fixture = {
    portfolios: [{ name: 'Example', slug: 'example', symbol: 'EX', currencyId: 8, quantity: 2, price: { USD: 4 }, lastUpdated: 1000 }],
    portfolioTotal: {},
  };
  const first = buildCryptoPortfolio({ payload: fixture, transactions: [], fetchedAt: '2026-10-05T10:00:00.000Z' });
  assert.equal(first.items[0].updatedAt, first.fetchedAt);
  fixture.portfolios[0].price.USD = null;
  const next = buildCryptoPortfolio({ payload: fixture, transactions: [], previous: first, fetchedAt: '2026-10-05T11:00:00.000Z' });
  assert.equal(next.items[0].price, first.items[0].price);
  assert.equal(next.items[0].updatedAt, first.items[0].updatedAt);
  const unknown = buildCryptoPortfolio({ payload: fixture, transactions: [], fetchedAt: next.fetchedAt });
  assert.equal(unknown.items[0].price, null);
  assert.equal(unknown.items[0].updatedAt, null);
});

test('blank and null source numbers remain unknown rather than becoming zero', () => {
  const fixture = {
    portfolios: [{ name: 'Example', slug: 'example', symbol: 'EX', currencyId: 8, quantity: '2', price: { USD: null }, initialCap: { USD: '' }, averageBuyPrice: { USD: null }, totalCap: { USD: '0' }, realizedProfit: { USD: null } }],
    portfolioTotal: { totalCap: { USD: null, RUB: null }, initialCap: { USD: null } },
  };
  const portfolio = buildCryptoPortfolio({ payload: fixture, transactions: [], fetchedAt: '2026-10-05T00:00:00.000Z' });
  assert.equal(portfolio.items[0].price, null);
  assert.equal(portfolio.items[0].cost, null);
  assert.equal(portfolio.items[0].averageBuyPrice, null);
  assert.equal(portfolio.items[0].realized, null);
  assert.equal(portfolio.usdRub, undefined);
  assert.equal(portfolio.snapshots.length, 0);
});

test('cost coverage distinguishes unknown, zero, closed and converted costs', () => {
  const assets = [
    { id: 'zero', quantity: 1, cost: 0, currency: 'RUB' },
    { id: 'usd', quantity: 1, cost: 2, currency: 'USD' },
    { id: 'unknown', quantity: 1, cost: null, currency: 'RUB' },
    { id: 'closed', quantity: 0, cost: 10, currency: 'RUB' },
  ];
  assert.deepEqual(summarizeCosts(assets, { usdRub: 80 }), { cost: 160, knownCostCount: 2, costComplete: false, costCoverageKey: 'usd|zero' });
  assert.deepEqual(summarizeCosts([assets[2]]), { cost: null, knownCostCount: 0, costComplete: false, costCoverageKey: '' });
  assert.equal(summarizeCosts(assets.slice(0, 2)).costComplete, true);
  const original = { at: '2026-10-05T10:00:00.000Z', value: 123, cost: 321 };
  const annotated = annotateCostCoverage(original, assets);
  assert.equal(annotated.at, original.at);
  assert.equal(annotated.value, original.value);
  assert.equal(annotated.cost, original.cost);
  assert.equal(annotated.costComplete, false);
  assert.deepEqual(annotateCostCoverage(annotated, []), annotated);
});

test('stored cost coverage exposes inventory-only Sandbox costs and excludes closed crypto', () => {
  const sandbox = read('sandbox');
  for (const snapshot of sandbox.snapshots) {
    assert.equal(snapshot.knownCostCount, snapshot.costCoverageKey.split('|').filter(Boolean).length);
    assert.equal(snapshot.costComplete, false);
    if (snapshot.at < sandbox.historyImport.importedAt) assert.ok(!snapshot.costCoverageKey.includes('lifejacket'));
    assert.ok(!snapshot.costCoverageKey.includes('qa-team-t-shirt'));
  }
  const crypto = read('crypto');
  assert.ok(crypto.snapshots.every((snapshot) => snapshot.costComplete && snapshot.knownCostCount === crypto.items.filter((item) => item.quantity > 0).length && !snapshot.costCoverageKey.includes('crypto-px')));
});

test('crypto snapshots never turn entirely unknown holding costs into a zero aggregate', () => {
  const fixture = {
    portfolios: [{ name: 'Unknown', slug: 'unknown', symbol: 'UN', currencyId: 9, quantity: 1, price: { USD: 2 }, initialCap: { USD: null } }],
    portfolioTotal: { totalCap: { USD: 2 }, initialCap: { USD: 0 } },
  };
  const result = buildCryptoPortfolio({ payload: fixture, transactions: [], fetchedAt: '2026-10-05T15:00:00.000Z' });
  assert.equal(result.snapshots[0].cost, null);
  assert.equal(result.snapshots[0].knownCostCount, 0);
  assert.equal(result.snapshots[0].costComplete, false);
  assert.equal(result.snapshots[0].costCoverageKey, '');
});

test('crypto snapshot valuation follows its observed quotes and retains divergent source totals', () => {
  const fixture = {
    portfolios: [{ name: 'Example', slug: 'example', symbol: 'EX', currencyId: 8, quantity: 2, price: { USD: 4 }, initialCap: { USD: 7 } }],
    portfolioTotal: { totalCap: { USD: 9, RUB: 720 }, initialCap: { USD: 7 } },
  };
  const result = buildCryptoPortfolio({ payload: fixture, transactions: [], fetchedAt: '2026-10-05T15:00:00.000Z' });
  const snapshot = result.snapshots[0];
  assert.equal(snapshot.value, 8);
  assert.equal(snapshot.sourceValue, 9);
  assert.equal(snapshot.itemPrices['crypto-ex'] * snapshot.itemQuantities['crypto-ex'], snapshot.value);
  assert.equal(snapshot.quoteDates['crypto-ex'], result.fetchedAt);
});

test('stored crypto quotes agree with the last recorded observation and self-contained snapshot values', () => {
  const portfolio = read('crypto');
  const latest = portfolio.snapshots.at(-1);
  for (const item of portfolio.items.filter((item) => item.quantity > 0)) {
    assert.equal(item.price, latest.itemPrices[item.id]);
    assert.equal(item.updatedAt, latest.at);
  }
  for (const snapshot of portfolio.snapshots) {
    const observed = Object.entries(snapshot.itemQuantities).reduce((sum, [id, quantity]) => sum + quantity * snapshot.itemPrices[id], 0);
    assert.ok(Math.abs(observed - snapshot.value) < 1e-8);
  }
});
