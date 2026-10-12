import test from 'node:test';
import assert from 'node:assert/strict';
import { compareAssets } from '../lib/asset-sort.ts';
import { chartDomain, chartSegments } from '../lib/chart-series.ts';
import { currentBasketHistory } from '../lib/basket-history.ts';
import { attachPriceHistory } from '../lib/price-history.ts';
import { assetPriceHistory, historyChange, periodChange } from '../lib/calculations.ts';
import { parseDropsHistory, parseSteamHistory } from '../scripts/backfill-price-history.mjs';

const now = Date.parse('2026-10-06T12:00:00Z');
const point = (at, value, coverageKey='a', quantityKey='a:1') => ({ at, value, cost:null, complete:true, coverageKey, quantityKey });
const asset = (id, price, quantity=1, currency='RUB', cost=10) => ({ id, name:id, price, quantity, currency, cost, averageBuyPrice:cost/quantity, class:currency==='USD'?'crypto':'cs2', source:currency==='USD'?'DropsTab':'Steam Community Market', updatedAt:'2026-10-06T10:00:00Z', trades:[] });

test('unit price, position value and profit sort by different metrics and normalize currencies', () => {
  const a=asset('a',5,100), b=asset('b',10,1), c=asset('c',1,1,'USD');
  assert.ok(compareAssets(a,b,'price','desc',85)>0);
  assert.ok(compareAssets(a,b,'value','desc',85)<0);
  assert.ok(compareAssets(c,b,'price','desc',85)<0);
  assert.ok(compareAssets(c,b,'price','desc',null)>0);
  assert.ok(compareAssets(a,b,'pnl','desc',85)<0);
  assert.ok(compareAssets(a,b,'pnl','asc',85)>0);
  assert.ok(compareAssets(asset('a',20,1,'RUB',100),asset('b',20,1,'RUB',10),'roi','desc',85)>0);
});
test('unknown values stay last in both directions; ties have a stable order', () => {
  for(const direction of ['asc','desc']) assert.ok(compareAssets(asset('a',null),asset('b',1),'price',direction,85)>0);
  assert.ok(compareAssets(asset('a',null),asset('b',null),'price','asc',85)<0);
  assert.ok(compareAssets(asset('a',2),asset('b',2),'value','desc',85)<0);
  const changes=new Map([['a',[null]],['b',[-3]]]);
  assert.ok(compareAssets(asset('a',1),asset('b',1),'change0','desc',85,false,changes)>0);
});
test('chart leaves gaps for changed coverage, holdings, long outages and missing costs', () => {
  const data=[point('2026-10-01',10),point('2026-10-02',11),point('2026-10-03',12,'b'),point('2026-10-04',13,'b','b:2'),point('2026-10-08',14,'b','b:2')];
  assert.deepEqual(chartSegments(data).map(s=>s.length),[2,1,1,1]);
  assert.deepEqual(chartSegments([{...data[0],cost:2},data[1],{...data[2],cost:3}],'cost').map(s=>s.length),[1,1]);
});
test('axis preserves tiny crypto variation and does not force a zero baseline', () => {
  const domain=chartDomain([1e-10,1.01e-10]);
  assert.ok(domain.min>0 && domain.max>domain.min && domain.max-domain.min<1e-11);
  assert.ok(chartDomain([123000,123100]).max<125000);
});
test('Steam history in EUR is rejected, even after a RUB request; zero-volume days are omitted', () => {
  assert.throws(()=>parseSteamHistory({ecurrency:3,prices:[]},now),/не в RUB/);
  assert.deepEqual(parseSteamHistory({ecurrency:5,prices:[{time:now/1000-3600,price_median:25,purchases:2},{time:now/1000-7200,price_median:12,purchases:0}]},now).map(p=>p.value),[25]);
});
test('DropsTab imports only real USD values in the date window without filling gaps', () => {
  const d={timestamps:[now-400*86400000,now-86400000,now-1000,now+86400000],data:{42:{prices:[{USD:1},{USD:2},{EUR:3},{USD:4}]}}};
  assert.deepEqual(parseDropsHistory(d,42,now),[{at:new Date(now-86400000).toISOString(),value:2}]);
  assert.throws(()=>parseDropsHistory({timestamps:[now],data:{42:{prices:[]}}},42,now),/Некорректная/);
});
test('archives require matching source and currency; latest spot updates the quote, sale medians do not', () => {
  const a=asset('a',2,1,'USD');
  const archive={currency:'USD',source:'DropsTab',basis:'spot',points:[{at:'2026-10-06T11:00:00Z',value:3},{at:'2026-10-07T11:00:00Z',value:50}]};
  assert.equal(attachPriceHistory(a,archive,now).price,3);
  assert.equal(attachPriceHistory(a,{...archive,currency:'RUB'},now).priceHistory.length,0);
  assert.equal(attachPriceHistory(a,{...archive,source:'Other'},now).priceHistory.length,0);
  assert.equal(attachPriceHistory(a,{...archive,basis:'sale-median'},now).price,2);
  const merged=assetPriceHistory(attachPriceHistory(a,archive,now),[],now);
  assert.equal(merged.at(-1).value,3);
});
test('year comparison uses current holdings and only shared observation days, never forward fills', () => {
  const a={...asset('a',1,2,'USD'),priceHistory:[point('2026-10-03T10:00:00Z',10),point('2026-10-04T10:00:00Z',20),point('2026-10-05T10:00:00Z',30)]};
  const b={...asset('b',1,3,'USD'),priceHistory:[point('2026-10-03T11:00:00Z',2),point('2026-10-05T11:00:00Z',4)]};
  assert.deepEqual(currentBasketHistory([a,b],now).map(s=>s.value),[26,72]);
  assert.ok(currentBasketHistory([a,b],now).every(s=>s.cost===null));
  assert.deepEqual(currentBasketHistory([a,{...b,currency:'RUB'}],now),[]);
});

test('basket retains individual quote dates instead of making old prices fresh', () => {
  const a = {...asset('a',1,2,'USD'),priceHistory:[point('2026-10-05T12:00:00Z',10),point('2026-10-06T00:00:00Z',20)]};
  const b = {...asset('b',1,3,'USD'),priceHistory:[point('2026-10-05T12:00:00Z',2),point('2026-10-06T12:00:00Z',4)]};
  const history = currentBasketHistory([a,b],now);
  assert.equal(periodChange(history,1,now).status,'stale');
  assert.equal(history.at(-1).quoteDates.a,'2026-10-06T00:00:00Z');
  assert.equal(history.at(-1).quoteDates.b,'2026-10-06T12:00:00Z');
});

test('basket does not report a listing versus sale-median change as market growth', () => {
  const a = {...asset('a',1,2,'USD'),priceHistory:[point('2026-10-05T12:00:00Z',10,'a:sale-median'),point('2026-10-06T12:00:00Z',20,'a')]};
  const history = currentBasketHistory([a],now);
  assert.equal(historyChange(history),null);
  assert.equal(periodChange(history,1,now).status,'incomparable');
  assert.deepEqual(chartSegments(history).map(segment=>segment.length),[1,1]);
});

test('basket groups actual UTC days and timestamps, including ISO timezone offsets', () => {
  const a = {...asset('a',1,2,'USD'),priceHistory:[point('2026-10-06T00:30:00+03:00',10)]};
  const b = {...asset('b',1,3,'USD'),priceHistory:[point('2026-10-05T22:00:00Z',2)]};
  const history = currentBasketHistory([a,b],now);
  assert.equal(history.length,1);
  assert.equal(history[0].at,'2026-10-05T22:00:00.000Z');
  assert.equal(history[0].value,26);
});

test('basket keeps shared intraday observations needed for full-period comparisons', () => {
  const a = {...asset('a',1,2,'USD'),priceHistory:[point('2026-10-05T12:00:00Z',10),point('2026-10-05T23:00:00Z',15),point('2026-10-06T12:00:00Z',20)]};
  const b = {...asset('b',1,3,'USD'),priceHistory:[point('2026-10-05T12:00:00Z',2),point('2026-10-05T23:00:00Z',3),point('2026-10-06T12:00:00Z',4)]};
  const history = currentBasketHistory([a,b],now);
  assert.deepEqual(history.map(s=>s.value),[26,39,52]);
  assert.equal(periodChange(history,1,now).status,'ready');
  assert.equal(periodChange(history,1,now).absolute,26);
});

test('cost lines require recorded comparable cost coverage, with complete legacy holdings as fallback', () => {
  const first = {...point('2026-10-01',10),cost:2};
  const second = {...point('2026-10-02',11),cost:3};
  assert.deepEqual(chartSegments([first,second],'cost').map(segment=>segment.length),[1,1]);
  assert.deepEqual(chartSegments([{...first,costComplete:true},{...second,costComplete:true}],'cost').map(segment=>segment.length),[2]);
  assert.deepEqual(chartSegments([{...first,costCoverageKey:'a'},{...second,costCoverageKey:'b'}],'cost').map(segment=>segment.length),[1,1]);
});

test('chart marker boundaries retain isolated observations and both sides of long gaps', async () => {
  const { chartBoundaryPoints } = await import('../lib/chart-series.ts');
  const data = Array.from({length:70},(_,index)=>point(new Date(now-(70-index)*3600000).toISOString(),index));
  const isolated = point('2026-09-01',1);
  const history = [isolated,...data];
  const boundaries = chartBoundaryPoints(history);
  assert.ok(boundaries.has(isolated));
  assert.ok(boundaries.has(data[0]));
  assert.ok(boundaries.has(data.at(-1)));
  assert.equal(boundaries.size,3);
});

test('sparkline growth colour requires comparable unit price observations', async () => {
  const { sparklineTrend } = await import('../lib/chart-series.ts');
  const first = point('2026-10-05',10,'a:sale-median');
  const last = point('2026-10-06',20,'a');
  assert.equal(sparklineTrend([first,last]),'');
  assert.equal(sparklineTrend([last]),'');
  assert.equal(sparklineTrend([{...first,coverageKey:'a'},last]),'rising');
  assert.equal(sparklineTrend([last,point('2026-10-06T12:00:00Z',5)]),'falling');
});
