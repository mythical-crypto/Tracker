import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeObservation, parseTrackedItems, positionInputs, steamReference, trackedId } from '../lib/tracked-items.ts';
import { trackedSteamQuote } from '../lib/tracked-steam-quote.ts';

const at = '2026-10-19T14:08:00Z';
const request = (item, game = 'cs2') => new Request('https://tracker.test/api/steam-quote?' + new URLSearchParams({ item, game }));

test('Steam names and item links share a watch identity, independent of spelling case', () => {
  const link = steamReference('cs2', 'https://steamcommunity.com/market/listings/590830/Punk%20Helmet');
  assert.equal(link.game, 'sandbox');
  assert.equal(trackedId(link), trackedId(steamReference('sandbox', '  punk helmet  ')));
  for (const unsafe of ['https://steamcommunity.com@elsewhere.test/market/listings/730/A', 'https://example.test/not-steam', 'https://steamcommunity.com/market/listings/440/A', 'https://steamcommunity.com/market/listings/730/%ZZ']) {
    assert.throws(() => steamReference('cs2', unsafe));
  }
  assert.throws(() => steamReference('cs2', 'https://steamcommunity.com/market/listings/730/G18DA243004?variant=special'));
});

test('watch quantities and acquisition prices preserve unknown costs and handle decimal commas', () => {
  assert.deepEqual(positionInputs('', ''), { quantity: null, buyPrice: null });
  assert.deepEqual(positionInputs('5', '0'), { quantity: 5, buyPrice: 0 });
  assert.deepEqual(positionInputs('2', '31,82'), { quantity: 2, buyPrice: 31.82 });
  for (const [q, p] of [['', '12'], ['2.4','1'], ['0', ''], ['1','-1'], ['1','1.222']]) assert.throws(() => positionInputs(q,p));
});

test('quote failure and repeats preserve real observations and unknowns', () => {
  const point = { at, value: 14.13 }, now = Date.parse(at);
  const history = mergeObservation([], point, now);
  assert.equal(history.length, 1);
  assert.equal(mergeObservation(history, null, now), history);
  assert.equal(mergeObservation(history, point, now), history);
  assert.equal(mergeObservation(history, { at: '2100-01-01T00:00:00Z', value: 1 }, now), history);
  assert.deepEqual(parseTrackedItems(null), []);
  assert.throws(() => parseTrackedItems('[{"game":"cs2"}]'));
});

test('protected Steam lookup requests the lowest RUB listing from only the selected game', async () => {
  const calls = [];
  const fetchQuote = async url => { calls.push(new URL(url)); return Response.json({success:true, lowest_price:'1 025,12 руб.', median_price:'800,00 руб.'}); };
  assert.equal((await trackedSteamQuote(request('Punk Helmet'), false, fetchQuote)).status, 401);
  assert.equal((await trackedSteamQuote(request('https://different.test/item'), true, fetchQuote)).status, 400);
  assert.equal(calls.length, 0);
  const result = await trackedSteamQuote(request('Punk Helmet','sandbox'), true, fetchQuote, () => at);
  assert.deepEqual(await result.json(), { game:'sandbox', name:'Punk Helmet', currency:'RUB', quote:{ at, value:1025.12 } });
  assert.equal(calls.length, 1); assert.equal(calls[0].origin, 'https://steamcommunity.com');
  assert.equal(calls[0].searchParams.get('appid'),'590830'); assert.equal(calls[0].searchParams.get('currency'),'5');
  const unpriced = await trackedSteamQuote(request('Fracture Case'), true, async () => Response.json({success:true,lowest_price:'$1.53'}));
  assert.equal(unpriced.status,503); assert.equal((await unpriced.json()).quote, undefined);
});

test('new Steam group links resolve an exact listing and refuse ambiguous variants', async () => {
  const url = 'https://steamcommunity.com/market/listings/730/G18DA243004';
  const html = '<meta property="og:title" content="Fracture Case - Steam Community Market"/>';
  const fetcher = async u => String(u) === url ? new Response(html + JSON.stringify('"market_hash_name":"Fracture Case"')) : Response.json({success:true,lowest_price:'20,54 ₽'});
  const result = await trackedSteamQuote(request(url), true, fetcher, () => at);
  assert.deepEqual((await result.json()).quote, { at, value:20.54 });
  const group = await trackedSteamQuote(request(url), true, async () => new Response(html + '"market_hash_name":"Other Variant"'));
  assert.equal(group.status,422);
});
