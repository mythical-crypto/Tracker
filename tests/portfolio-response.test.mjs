import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { authorizedPortfolioResponse, MAX_RESPONSE_BYTES, portfolioJsonResponse } from '../lib/portfolio-response.ts';

const fixture = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));

test('small JSON remains readable without compression and cannot be cached publicly', async () => {
  const data = { assets: [{ id: 'test', price: null }], history: [] };
  for (const encoding of [null, 'gzip', 'gzip;q=0', 'br']) {
    const response = await portfolioJsonResponse(data, encoding);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-encoding'), null);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('vary'), 'Accept-Encoding');
    assert.deepEqual(await response.json(), data);
  }
});

test('retained multi-category history fits the transport limit as gzip and round-trips without data loss', async t => {
  const repeat = value => Array.from({ length: 677 }, (_, index) => {
    const at = new Date(Date.UTC(2026, 0, 1) + index * 900_000).toISOString();
    const itemPrices = value.itemPrices && Object.fromEntries(Object.entries(value.itemPrices).map(([id, price], assetIndex) => [id, Number((price * (1 + ((index * 17 + assetIndex * 31) % 1000) / 10_000)).toFixed(6))]));
    const quoteDates = value.quoteDates && Object.fromEntries(Object.keys(value.quoteDates).map(id => [id, at]));
    const itemUpdatedAt = value.itemUpdatedAt && Object.fromEntries(Object.keys(value.itemUpdatedAt).map(id => [id, at]));
    return { ...value, at, itemPrices, quoteDates, itemUpdatedAt };
  });
  const data = {
    assets: [...fixture('sandbox').items, ...fixture('crypto').items],
    history: { cs2: repeat(fixture('history').snapshots.at(-1)), sandbox: repeat(fixture('sandbox').snapshots.at(-1)), crypto: repeat(fixture('crypto').snapshots.at(-1)) },
    combinedHistory: repeat(fixture('combined-history').snapshots.at(-1)),
  };
  const originalBytes = Buffer.byteLength(JSON.stringify(data));
  assert.ok(originalBytes > MAX_RESPONSE_BYTES, 'fixture must exercise the actual oversized-response case');
  const response = await portfolioJsonResponse(data, 'gzip, deflate, br');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-encoding'), 'gzip');
  const wire = Buffer.from(await response.arrayBuffer());
  assert.ok(wire.byteLength < MAX_RESPONSE_BYTES);
  t.diagnostic(`Full history: ${originalBytes} JSON bytes; ${wire.byteLength} gzip bytes`);
  assert.deepEqual(JSON.parse(gunzipSync(wire).toString('utf8')), data);
});

test('oversized identity response fails explicitly rather than silently trimming historical observations', async () => {
  const data = { history: 'x'.repeat(MAX_RESPONSE_BYTES + 1) };
  for (const encoding of [null, 'br', 'gzip;q=0, *;q=1', 'gzip;q=invalid']) {
    const response = await portfolioJsonResponse(data, encoding);
    assert.equal(response.status, 406);
    assert.equal(response.headers.get('content-encoding'), null);
    assert.equal((await response.json()).error, 'compression_required');
  }
  for (const encoding of ['gzip;q=0.5', '*;q=1']) {
    assert.equal((await portfolioJsonResponse(data, encoding)).status, 200);
  }
});

test('authorization runs before loading or serializing any portfolio data', async () => {
  let loaded = 0;
  const load = async () => { loaded++; return { private: true }; };
  const request = new Request('https://vault.invalid/api/portfolio', { headers: { 'Accept-Encoding': 'gzip' } });
  const blocked = await authorizedPortfolioResponse(request, () => false, load);
  assert.equal(blocked.status, 401);
  assert.equal(loaded, 0);
  assert.deepEqual(await blocked.json(), { error: 'Требуется вход' });
  const allowed = await authorizedPortfolioResponse(request, () => true, load);
  assert.equal(loaded, 1);
  assert.deepEqual(await allowed.json(), { private: true });
});
