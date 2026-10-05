import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { retainSnapshots } from './history.mjs';
import { fetchSteamPrice, transientSourceFailure } from './extra-sources.mjs';

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

export { rublesToKopecks } from './extra-sources.mjs';

async function fetchPrice(name) {
  return Math.round(await fetchSteamPrice(name, { appid: '730' }) * 100);
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

export async function refreshPrices(portfolio, previous, previousHistory, { iconsOnly = false, withIcons = false, fetchQuote = fetchPrice, fetchImage = fetchIcon, wait = pause, clock = () => new Date().toISOString(), logger = console } = {}) {
  const history = { ...previousHistory, snapshots: [...previousHistory.snapshots] };
  const prices = { ...previous, source: 'Steam Community Market', currency: 'RUB', items: { ...previous.items } };
  let successful = 0, errors = 0;
  let consecutiveTransientFailures = 0;
  let unavailable = false;
  const requestedItems = [...portfolio.items].sort((a, b) => (Date.parse(prices.items[a.name]?.updatedAt) || 0) - (Date.parse(prices.items[b.name]?.updatedAt) || 0));
  for (const [index, item] of requestedItems.entries()) {
    const existing = prices.items[item.name] || {};
    const next = { ...existing };
    if (!iconsOnly) {
      try {
        if (unavailable) throw new Error('Steam временно недоступен; сохранена прежняя котировка');
        const price = await fetchQuote(item.name);
        if (!Number.isSafeInteger(price) || price <= 0) throw new Error('Некорректная цена Steam');
        next.priceKopecks = price;
        next.updatedAt = clock();
        delete next.error;
        successful++;
        consecutiveTransientFailures = 0;
      } catch (error) {
        next.error = String(error.message);
        errors++;
        consecutiveTransientFailures = transientSourceFailure(error) ? consecutiveTransientFailures + 1 : 0;
        if (consecutiveTransientFailures >= 3) unavailable = true;
      }
    }
    if (withIcons && !next.icon) {
      try { next.icon = await fetchImage(item.name); delete next.iconError; }
      catch (error) { next.iconError = String(error.message); }
    }
    prices.items[item.name] = next;
    logger.log(`${index + 1}/${portfolio.items.length} ${item.name}: ${next.priceKopecks ? `${(next.priceKopecks / 100).toFixed(2)} ₽` : 'нет цены'}${next.error ? ` (${next.error})` : ''}`);
    if (index < portfolio.items.length - 1 && !unavailable && (!iconsOnly || !existing.icon)) await wait(4000);
  }

  const now = clock();
  if (!iconsOnly) {
    prices.lastAttemptAt = now;
    prices.freshCount = successful;
    prices.totalCount = portfolio.items.length;
    prices.lastSuccessAt = successful ? now : previous.lastSuccessAt;
    prices.lastFullSuccessAt = successful > 0 && errors === 0 ? now : previous.lastFullSuccessAt;
  }
  const valueKopecks = portfolio.items.reduce((sum, item) => sum + item.quantity * (prices.items[item.name]?.priceKopecks || 0), 0);
  const costKopecks = portfolio.items.reduce((sum, item) => sum + item.costKopecks, 0);
  if (!iconsOnly && successful > 0) {
    const itemPrices = Object.fromEntries(portfolio.items.flatMap((item) => {
      const price = prices.items[item.name]?.priceKopecks;
      return Number.isSafeInteger(price) && price > 0 ? [[item.name, price]] : [];
    }));
    const held = portfolio.items.filter((item) => item.quantity > 0);
    const itemQuantities = Object.fromEntries(held.map((item) => [item.name, item.quantity]));
    const itemUpdatedAt = Object.fromEntries(held.filter((item) => prices.items[item.name]?.updatedAt && itemPrices[item.name] !== undefined).map((item) => [item.name, prices.items[item.name].updatedAt]));
    history.snapshots.push({ at: now, valueKopecks, costKopecks, freshCount: successful, totalCount: held.length, pricedCount: Object.keys(itemPrices).length, complete: Object.keys(itemPrices).length === held.length, coverageKey: Object.keys(itemPrices).sort().join('|'), quantityKey: held.map((item) => `${item.name}:${item.quantity}`).sort().join('|'), itemPrices, itemQuantities, itemUpdatedAt, quoteDates: itemUpdatedAt });
    history.snapshots = retainSnapshots(history.snapshots, Date.parse(now));
  }
  return { prices, history, successful, errors };
}

async function main() {
  const portfolio = JSON.parse(readFileSync('data/portfolio.json', 'utf8'));
  const previous = JSON.parse(readFileSync('data/prices.json', 'utf8'));
  const previousHistory = JSON.parse(readFileSync('data/history.json', 'utf8'));
  const iconsOnly = process.argv.includes('--icons-only');
  const { prices, history, successful, errors } = await refreshPrices(portfolio, previous, previousHistory, { iconsOnly, withIcons: process.argv.includes('--icons') || iconsOnly });
  writeFileSync('data/prices.json', JSON.stringify(prices, null, 2) + '\n');
  writeFileSync('data/history.json', JSON.stringify(history, null, 2) + '\n');
  writeFileSync('data/live.json', JSON.stringify({ prices, history }) + '\n');
  process.stdout.write(iconsOnly ? `Изображения Steam: ${Object.values(prices.items).filter((item) => item.icon).length}/${portfolio.items.length}\n` : `Обновлено ${successful}/${portfolio.items.length}; ошибок ${errors}\n`);
  if (!iconsOnly && successful === 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
