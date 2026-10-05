import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { retainSnapshots } from './history.mjs';
import { summarizeCosts } from './cost-coverage.mjs';

export function combinedSnapshot(cs, prices, sb, cr, history, at = new Date().toISOString()) {
  const fx = cr.usdRub;
  if (!Number.isFinite(fx) || fx <= 0) throw new Error('Нет курса оценки USD/RUB');
  const assets = [
    ...cs.items.map((item) => ({ id: `cs2:${item.name}`, quantity: item.quantity, price: prices.items[item.name]?.priceKopecks === undefined ? null : prices.items[item.name].priceKopecks / 100, cost: Number.isFinite(item.costKopecks) ? item.costKopecks / 100 : null, updatedAt: prices.items[item.name]?.updatedAt, currency: 'RUB' })),
    ...sb.items,
    ...cr.items,
  ].filter((item) => item.quantity > 0);
  const priced = assets.filter((item) => Number.isFinite(item.price) && item.price >= 0);
  const last = [...history.snapshots].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1);
  const previousAt = last ? Date.parse(last.at) : -Infinity;
  const freshCount = priced.filter((item) => Number.isFinite(Date.parse(item.updatedAt)) && Date.parse(item.updatedAt) > previousAt).length;
  const fxUpdatedAt = cr.fxUpdatedAt ?? null;
  if (!priced.length || (!freshCount && !(Date.parse(fxUpdatedAt) > previousAt))) return null;
  const itemUpdatedAt = Object.fromEntries(priced.filter((item) => item.updatedAt).map((item) => [item.id, item.updatedAt]));
  return {
    at,
    value: priced.reduce((sum, item) => sum + item.quantity * item.price * (item.currency === 'USD' ? fx : 1), 0),
    ...summarizeCosts(assets, { usdRub: fx }),
    complete: priced.length === assets.length,
    pricedCount: priced.length,
    totalCount: assets.length,
    freshCount,
    coverageKey: priced.map((item) => item.id).sort().join('|'),
    quantityKey: assets.map((item) => `${item.id}:${item.quantity}`).sort().join('|'),
    itemPrices: Object.fromEntries(priced.map((item) => [item.id, item.price * (item.currency === 'USD' ? fx : 1)])),
    itemQuantities: Object.fromEntries(assets.map((item) => [item.id, item.quantity])),
    itemUpdatedAt,
    usdRub: fx,
    fxUpdatedAt,
    quoteDates: itemUpdatedAt,
    source: 'Сумма оценок Steam и DropsTab; курс оценки DropsTab',
  };
}

function main() {
  const read = (name) => JSON.parse(readFileSync(`data/${name}.json`, 'utf8'));
  const history = read('combined-history');
  const snapshot = combinedSnapshot(read('portfolio'), read('prices'), read('sandbox'), read('crypto'), history);
  if (!snapshot) { console.log('Общая оценка: новых наблюдений нет; история сохранена без дополнительной точки'); return; }
  history.snapshots.push(snapshot);
  history.snapshots = retainSnapshots(history.snapshots, Date.parse(snapshot.at));
  writeFileSync('data/combined-history.json', JSON.stringify(history, null, 2) + '\n');
  console.log(`Общая оценка: ${snapshot.pricedCount}/${snapshot.totalCount} позиций; сохранён снимок`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
