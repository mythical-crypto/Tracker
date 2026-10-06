import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const DAY = 86400000;
export function parseSteamHistory(body, now = Date.now()) {
  // The new public Market API may ignore a requested currency; trust its metadata.
  if (body?.ecurrency !== 5) throw new Error('Steam возвращает историю не в RUB. Нужен рублёвый архив Steam; конвертация не применяется.');
  if (!Array.isArray(body.prices)) throw new Error('Некорректная история Steam');
  return normalizePoints(body.prices.filter(p => p.purchases > 0).map(p => ({ at: new Date(p.time * 1000).toISOString(), value: p.price_median })), now);
}
export function parseDropsHistory(body, currencyId, now = Date.now()) {
  const prices = body?.data?.[currencyId]?.prices;
  if (!Array.isArray(body?.timestamps) || !Array.isArray(prices) || body.timestamps.length !== prices.length) throw new Error('Некорректная история DropsTab');
  return normalizePoints(body.timestamps.flatMap((time, i) => typeof time === 'number' && Number.isFinite(time) && time > 0 && time < 8.64e15 ? [{ at: new Date(time).toISOString(), value: prices[i]?.USD }] : []), now);
}
function normalizePoints(points, now) {
  return [...new Map(points.filter(p => typeof p.value === 'number' && Number.isFinite(p.value) && p.value > 0 && Date.parse(p.at) >= now - 366 * DAY && Date.parse(p.at) <= now).map(p => [p.at, p])).values()].sort((a,b) => Date.parse(a.at)-Date.parse(b.at));
}
async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Tracker/1.0 (personal price history)' } });
  if (!r.ok) throw new Error(`Источник HTTP ${r.status}`);
  return r.json();
}
export async function backfill() {
  const cs = JSON.parse(readFileSync('data/portfolio.json','utf8'));
  const sb = JSON.parse(readFileSync('data/sandbox.json','utf8'));
  const cr = JSON.parse(readFileSync('data/crypto.json','utf8'));
  const target = 'data/price-history.json';
  let archive; try { archive = JSON.parse(readFileSync(target,'utf8')); } catch { archive = { items: {} }; }
  archive.attemptedAt = new Date().toISOString();
  for (const [appid, items] of [[730,cs.items.map(a=>({id:`cs2:${a.name}`,name:a.name}))],[590830,sb.items]]) {
    let unavailable;
    for (const asset of items) {
      try {
        if (unavailable) throw new Error(unavailable);
        const url = new URL('https://steamcommunity.com/market/actions');
        url.searchParams.set('q','QueryPriceHistory'); url.searchParams.set('qp',JSON.stringify([appid,asset.name])); url.searchParams.set('currency','5');
        const body = await json(url);
        const points = parseSteamHistory(body.data);
        if (!points.length) throw new Error('За год нет подтверждённых продаж Steam');
        archive.items[asset.id] = { source:'Steam Community Market', sourceUrl:`https://steamcommunity.com/market/listings/${appid}/${encodeURIComponent(asset.name)}`, currency:'RUB', basis:'sale-median', fetchedAt:archive.attemptedAt, points };
        console.log(`${asset.name}: ${points.length} точек RUB`);
        await delay(1500);
      } catch (error) {
        if (/не в RUB|HTTP (429|5\d\d)/.test(error.message)) unavailable = error.message;
        archive.items[asset.id] = { ...archive.items[asset.id], error:error.message };
      }
    }
    if (unavailable) console.log(`Steam ${appid}: ${unavailable}`);
  }
  for (const asset of cr.items) {
    try {
      const response = await fetch(asset.marketUrl, { signal:AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`DropsTab HTTP ${response.status}`);
      const html = await response.text();
      const text = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
      const coin = text && JSON.parse(text).props?.pageProps?.coin;
      if (!Number.isSafeInteger(coin?.currencyId) || coin.symbol !== asset.symbol) throw new Error('DropsTab не подтвердил идентификатор актива');
      const url = new URL('https://dropstab.com/_gateway/api/portfolio/api/currencyHistorical');
      url.searchParams.set('currencyIds',String(coin.currencyId)); url.searchParams.set('timeframe','1Y'); url.searchParams.set('quoteSymbol','USD');
      const points = parseDropsHistory(await json(url),coin.currencyId);
      if (!points.length) throw new Error('DropsTab не предоставил историю USD');
      archive.items[asset.id] = { source:'DropsTab', sourceUrl:asset.marketUrl, currency:'USD', basis:'spot', fetchedAt:archive.attemptedAt, points };
      console.log(`${asset.name}: ${points.length} точек USD`);
    } catch (error) { archive.items[asset.id] = { ...archive.items[asset.id], error:error.message }; console.log(`${asset.name}: ${error.message}`); }
    await delay(400);
  }
  writeFileSync(target,JSON.stringify(archive,null,2)+'\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await backfill();
