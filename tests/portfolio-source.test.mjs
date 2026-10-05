import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGithubReader, normalizeSteamSnapshot, validCombinedHistory, validExtraPortfolio, validSteamLive } from '../lib/portfolio-source.ts';

const fixture = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));

test('published data contracts accept existing real files and reject wrong source/currency or broken records', () => {
  assert.equal(validSteamLive(fixture('live')), true);
  assert.equal(validCombinedHistory(fixture('combined-history')), true);
  for (const kind of ['sandbox', 'crypto']) {
    const data = fixture(kind);
    assert.equal(validExtraPortfolio(data, kind), true);
    const foreignCurrency = structuredClone(data);
    foreignCurrency.items[0].currency = kind === 'crypto' ? 'RUB' : 'USD';
    assert.equal(validExtraPortfolio(foreignCurrency, kind), false);
    const negativePrice = structuredClone(data);
    negativePrice.items[0].price = -1;
    assert.equal(validExtraPortfolio(negativePrice, kind), false);
    const missingTrades = structuredClone(data);
    delete missingTrades.items[0].trades;
    assert.equal(validExtraPortfolio(missingTrades, kind), false);
    const duplicateId = structuredClone(data);
    duplicateId.items.push(duplicateId.items[0]);
    assert.equal(validExtraPortfolio(duplicateId, kind), false);
  }
  const wrongSteam = fixture('live');
  wrongSteam.prices.currency = 'USD';
  assert.equal(validSteamLive(wrongSteam), false);
  assert.equal(validSteamLive({ prices: { source: 'Steam Community Market', currency: 'RUB' } }), false);
  const brokenHistory = fixture('combined-history');
  brokenHistory.snapshots[0].value = '100';
  assert.equal(validCombinedHistory(brokenHistory), false);
});

test('expired remote cache exposes transport failure, preserves last successful dates, then recovers', async () => {
  let now = 0, requests = 0;
  const original = { version: 1, fetchedAt: '2026-10-05T10:00:00Z' };
  const fresh = { version: 2, fetchedAt: '2026-10-05T10:15:00Z' };
  const read = createGithubReader(async (_url, options) => {
    assert.equal(options.cache, 'no-store');
    requests++;
    return requests === 2 ? new Response('', { status: 503 }) : Response.json(requests === 1 ? original : fresh);
  }, () => now, () => undefined);
  const valid = value => typeof value?.version === 'number';
  assert.deepEqual(await read('fixture.json', valid), { data: original, readAt: new Date(0).toISOString() });
  now = 299_999;
  assert.deepEqual(await read('fixture.json', valid), { data: original, readAt: new Date(0).toISOString() });
  assert.equal(requests, 1);
  now = 300_000;
  const failed = await read('fixture.json', valid);
  assert.deepEqual(failed.data, original);
  assert.match(failed.error, /Не удалось прочитать/);
  assert.equal(requests, 2);
  now += 30_000;
  assert.deepEqual(await read('fixture.json', valid), { data: fresh, readAt: new Date(now).toISOString() });
  assert.equal(requests, 3);
});

test('malformed remote JSON fails visibly and cannot replace valid local fallback', async () => {
  for (const fetcher of [
    async () => { throw new Error('network error'); },
    async () => new Response('invalid json'),
    async () => Response.json({ items: [] }),
  ]) {
    const read = createGithubReader(fetcher, () => 0, () => undefined);
    const result = await read('crypto.json', value => validExtraPortfolio(value, 'crypto'));
    assert.equal(result.data, null);
    assert.match(result.error, /исходными датами/);
    assert.equal(result.error.includes('network error'), false);
  }
});

test('concurrent reads share one remote request', async () => {
  let requests = 0, resolve;
  const gate = new Promise(done => { resolve = done; });
  const read = createGithubReader(async () => { requests++; await gate; return Response.json({ ok: true }); }, () => 0, () => undefined);
  const first = read('fixture.json', value => value?.ok === true);
  const second = read('fixture.json', value => value?.ok === true);
  assert.equal(requests, 1);
  resolve();
  const expected = { data: { ok: true }, readAt: new Date(0).toISOString() };
  assert.deepEqual(await Promise.all([first, second]), [expected, expected]);
});

test('public reads avoid the anonymous REST quota; a configured token uses the private Contents API', async () => {
  for (const token of [undefined, 'test-only-token']) {
    const read = createGithubReader(async (url, options) => {
      assert.equal(new URL(url).hostname, token ? 'api.github.com' : 'raw.githubusercontent.com');
      assert.equal(options.headers.Authorization, token ? `Bearer ${token}` : undefined);
      return Response.json({ ok: true });
    }, () => 0, () => token);
    assert.equal((await read('fixture.json', value => value?.ok === true)).data.ok, true);
  }
});

test('Steam normalization preserves observed quantities and quote times without filling old history', () => {
  const raw = { at: '2026-10-05T11:00:00Z', valueKopecks: 1200, costKopecks: 1000, totalCount: 2,
    itemPrices: { Charm: 100, Sticker: 500 }, itemQuantities: { Sticker: 2, Charm: 2 },
    quoteDates: { Charm: '2026-10-05T10:50:00Z', Sticker: '2026-10-05T10:55:00Z' } };
  const snapshot = normalizeSteamSnapshot(raw);
  assert.equal(snapshot.value, 12);
  assert.deepEqual(snapshot.itemPrices, { 'cs2:Charm': 1, 'cs2:Sticker': 5 });
  assert.deepEqual(snapshot.itemQuantities, { 'cs2:Sticker': 2, 'cs2:Charm': 2 });
  assert.deepEqual(snapshot.itemUpdatedAt, { 'cs2:Charm': raw.quoteDates.Charm, 'cs2:Sticker': raw.quoteDates.Sticker });
  assert.equal(snapshot.quantityKey, 'cs2:Charm:2|cs2:Sticker:2');
  const legacy = normalizeSteamSnapshot({ ...raw, itemQuantities: undefined, quoteDates: undefined });
  assert.equal(legacy.itemQuantities, undefined);
  assert.equal(legacy.itemUpdatedAt, undefined);
  assert.equal(legacy.quantityKey, undefined);
});
