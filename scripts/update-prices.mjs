import { readFileSync, writeFileSync } from 'node:fs';

const portfolio = JSON.parse(readFileSync('data/portfolio.json', 'utf8'));
const previous = JSON.parse(readFileSync('data/prices.json', 'utf8'));
const history = JSON.parse(readFileSync('data/history.json', 'utf8'));
const withIcons = process.argv.includes('--icons');
const iconsOnly = process.argv.includes('--icons-only');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function steamJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Tracker/1.0 (+personal portfolio; Steam Community Market)' }, signal: AbortSignal.timeout(18000) });
      if (response.status === 429 || response.status >= 500) throw new Error(`Steam HTTP ${response.status}`);
      if (!response.ok) throw new Error(`Steam HTTP ${response.status}`);
      const body = await response.json();
      if (!body.success) throw new Error('Steam вернул success=false');
      return body;
    } catch (error) {
      if (attempt === 2) throw error;
      await pause(10000 * (attempt + 1));
    }
  }
}

export function rublesToKopecks(text) {
  const amount = String(text).replace(/\s/g, '').match(/\d+(?:[,.]\d{1,2})?/);
  const parsed = amount ? Number(amount[0].replace(',', '.')) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Некорректная цена Steam: ${text}`);
  return Math.round(parsed * 100);
}

async function fetchPrice(name) {
  const url = new URL('https://steamcommunity.com/market/priceoverview/');
  url.searchParams.set('appid', '730');
  url.searchParams.set('currency', '5');
  url.searchParams.set('market_hash_name', name);
  const body = await steamJson(url);
  if (!String(body.lowest_price).includes('руб')) throw new Error(`Steam не подтвердил RUB: ${body.lowest_price}`);
  return rublesToKopecks(body.lowest_price);
}

async function fetchIcon(name) {
  const url = new URL('https://steamcommunity.com/market/search/render/');
  url.searchParams.set('query', name);
  url.searchParams.set('start', '0');
  url.searchParams.set('count', '10');
  url.searchParams.set('search_descriptions', '0');
  url.searchParams.set('appid', '730');
  url.searchParams.set('norender', '1');
  const body = await steamJson(url);
  const exact = body.results?.find((item) => item.hash_name === name);
  const icon = exact?.asset_description?.icon_url;
  if (icon) return `https://community.fastly.steamstatic.com/economy/image/${icon}/180fx180f`;
  const listing = await fetch(`https://steamcommunity.com/market/listings/730/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(18000) });
  if (!listing.ok) throw new Error(`Страница Steam HTTP ${listing.status}`);
  const html = await listing.text();
  const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
  if (!match) throw new Error('Картинка предмета не найдена');
  return match[1].replaceAll('&amp;', '&');
}

const now = new Date().toISOString();
const prices = { ...previous, source: 'Steam Community Market', currency: 'RUB', lastAttemptAt: iconsOnly ? previous.lastAttemptAt : now, items: { ...previous.items } };
let successful = 0, errors = 0;
for (const [index, item] of portfolio.items.entries()) {
  const existing = prices.items[item.name] || {};
  const next = { ...existing };
  if (!iconsOnly) {
    try {
      next.priceKopecks = await fetchPrice(item.name);
      next.updatedAt = new Date().toISOString();
      delete next.error;
      successful++;
    } catch (error) {
      next.error = String(error.message);
      errors++;
    }
  }
  if (withIcons && !next.icon) {
    try { next.icon = await fetchIcon(item.name); delete next.iconError; }
    catch (error) { next.iconError = String(error.message); }
  }
  prices.items[item.name] = next;
  process.stdout.write(`${index + 1}/${portfolio.items.length} ${item.name}: ${next.priceKopecks ? `${(next.priceKopecks / 100).toFixed(2)} ₽` : 'нет цены'}${next.error ? ` (${next.error})` : ''}\n`);
  if (!iconsOnly || !existing.icon) await pause(2200);
}

if (!iconsOnly) {
  prices.freshCount = successful;
  prices.totalCount = portfolio.items.length;
  prices.lastSuccessAt = successful ? now : previous.lastSuccessAt;
  prices.lastFullSuccessAt = errors === 0 ? now : previous.lastFullSuccessAt;
}
const valueKopecks = portfolio.items.reduce((sum, item) => sum + item.quantity * (prices.items[item.name]?.priceKopecks || 0), 0);
const costKopecks = portfolio.items.reduce((sum, item) => sum + item.costKopecks, 0);
if (!iconsOnly && successful > 0) history.snapshots.push({ at: now, valueKopecks, costKopecks, freshCount: successful, totalCount: portfolio.items.length });
writeFileSync('data/prices.json', JSON.stringify(prices, null, 2) + '\n');
writeFileSync('data/history.json', JSON.stringify(history, null, 2) + '\n');
writeFileSync('data/live.json', JSON.stringify({ prices, history }, null, 2) + '\n');
process.stdout.write(iconsOnly ? `Изображения Steam: ${Object.values(prices.items).filter((item) => item.icon).length}/${portfolio.items.length}\n` : `Обновлено ${successful}/${portfolio.items.length}; ошибок ${errors}\n`);
if (!iconsOnly && successful === 0) process.exitCode = 1;
