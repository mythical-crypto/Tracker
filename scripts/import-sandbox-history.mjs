import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCsv } from './import-csv.mjs';
import { buildSandboxPortfolio } from './extra-sources.mjs';

const months = { 'янв': 1, 'фев': 2, 'мар': 3, 'апр': 4, 'мая': 5, 'май': 5, 'июн': 6, 'июл': 7, 'авг': 8, 'сен': 9, 'окт': 10, 'ноя': 11, 'дек': 12 };

export function parseSteamDate(label, year = null) {
  const match = label.trim().toLowerCase().match(/^(\d{1,2})\s+([а-яё]+)\.?\s*(\d{4})?$/u);
  const month = match && months[match[2].slice(0, 3)];
  const actualYear = match?.[3] ? Number(match[3]) : year;
  const day = Number(match?.[1]);
  const date = new Date(Date.UTC(actualYear ?? 2000, (month ?? 0) - 1, day));
  if (!month || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || (actualYear !== null && (!Number.isInteger(actualYear) || actualYear < 2000 || actualYear > 2100))) throw new Error(`Некорректная дата Steam: ${label}`);
  return { date: actualYear === null ? null : `${actualYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, dateLabel: label.trim(), datePrecision: actualYear === null ? 'unknown-year' : 'day', monthDay: month * 100 + day };
}

export function parseSteamRubles(display) {
  const match = display.replace(/[\s\u00a0\u202f]/g, '').match(/^(\d+)(?:[,.](\d{1,2}))?(?:руб\.?|₽)$/u);
  if (!match) throw new Error(`Ожидалась сумма в рублях: ${display}`);
  const kopecks = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(kopecks) || kopecks <= 0) throw new Error(`Некорректная сумма: ${display}`);
  return kopecks;
}

export function parseSandboxHistory(csv, { year = null } = {}) {
  const rows = parseCsv(csv).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), value.trim()])));
  if (rows.length && !Object.hasOwn(rows[0], 'App Id')) throw new Error('В CSV отсутствует App Id');
  const transactions = [], occurrences = new Map();
  let selectedRows = 0, duplicateRows = 0;
  for (const [index, row] of rows.entries()) {
    if (row['App Id'] !== '590830') continue;
    selectedRows++;
    const name = row['Market Name'];
    const itemName = row['Item Name'];
    const prefix = itemName.match(/^(\d+)\s+(.+)$/u);
    const quantity = itemName === name ? 1 : prefix?.[2] === name ? Number(prefix[1]) : NaN;
    const type = row.Type === 'purchase' ? 'buy' : row.Type === 'sale' ? 'sell' : null;
    if (!name || !type || !Number.isSafeInteger(quantity) || quantity <= 0 || !row['Asset Id']) throw new Error(`Некорректная строка s&box ${index + 2}`);
    const totalKopecks = parseSteamRubles(row['Display Price']);
    const dateInfo = parseSteamDate(row['Acted On'], year);
    // Steam's grouped history can reuse asset IDs, including identical rows.
    // Preserve multiplicity; occurrence IDs make reimporting this export safe.
    const fingerprint = JSON.stringify([name, row['Asset Id'], row['Class Id'], type, dateInfo.dateLabel, quantity, totalKopecks]);
    const occurrence = (occurrences.get(fingerprint) ?? 0) + 1;
    occurrences.set(fingerprint, occurrence);
    const id = `steam-history-${createHash('sha256').update(fingerprint).digest('hex').slice(0, 24)}-${occurrence}`;
    const trade = { id, type, ...dateInfo, quantity, unitPrice: totalKopecks / 100 / quantity, total: totalKopecks / 100, fee: 0, feeUnknown: true, currency: 'RUB', source: 'steam-csv', sourceOrder: -index };
    if (occurrence > 1) duplicateRows++;
    transactions.push({ name, trade });
  }
  if (!transactions.length) throw new Error('В CSV нет операций s&box (App Id 590830)');
  return { transactions: transactions.sort((a, b) => a.trade.sourceOrder - b.trade.sourceOrder), totalRows: rows.length, selectedRows, ignoredRows: rows.length - selectedRows, duplicateRows };
}

function totals(trades, type) {
  const selected = trades.filter(trade => trade.type === type);
  return { quantity: selected.reduce((n, trade) => n + trade.quantity, 0), total: Math.round(selected.reduce((n, trade) => n + Math.round(trade.total * 100), 0)) / 100 };
}

export function importSandboxHistory(previous, parsed, { importedAt = new Date().toISOString(), filename = 'market_history.csv' } = {}) {
  const groups = new Map();
  for (const { name, trade } of parsed.transactions) groups.set(name, [...(groups.get(name) ?? []), trade]);
  const items = previous.items.map(item => {
    const additions = groups.get(item.name);
    if (!additions) return { ...item, trades: item.trades.map(trade => ({ ...trade, source: trade.source ?? (trade.id?.includes('assumed') ? 'inferred' : 'user-table') })) };
    groups.delete(item.name);
    const oldTrades = item.trades.filter(trade => trade.source === 'steam-csv' || !additions.some(next => next.type === trade.type)).map(trade => ({ ...trade, source: trade.source ?? (trade.id?.includes('assumed') ? 'inferred' : 'user-table') }));
    const trades = [...new Map([...oldTrades, ...additions].map(trade => [trade.id, trade])).values()].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || (a.sourceOrder ?? -Infinity) - (b.sourceOrder ?? -Infinity));
    const photoBuys = totals(item.trades, 'buy'), photoSales = totals(item.trades, 'sell');
    const confirmedBuys = totals(trades.filter(trade => trade.source === 'steam-csv'), 'buy');
    const confirmedSales = totals(trades.filter(trade => trade.source === 'steam-csv'), 'sell');
    const accounting = item.accounting ?? { boughtQuantity: photoBuys.quantity, buyCost: photoBuys.total, soldQuantity: photoSales.quantity, soldTotal: photoSales.total, source: photoBuys.quantity ? 'user-table' : 'steam-csv' };
    const next = { ...accounting };
    // A partial export describes events, not the full position. Never add those
    // purchases to the aggregate table or invent dated opening transactions.
    if (next.boughtQuantity === 0) { next.boughtQuantity = confirmedBuys.quantity; next.buyCost = confirmedBuys.total; }
    if (confirmedBuys.quantity > next.boughtQuantity || confirmedSales.quantity > next.soldQuantity) {
      const ledgerQuantity = confirmedBuys.quantity - confirmedSales.quantity;
      if (item.verifiedQuantity !== undefined && ledgerQuantity !== item.verifiedQuantity) throw new Error(`История превышает исходный учёт и не совпадает с инвентарём: ${item.name}`);
      next.boughtQuantity = confirmedBuys.quantity; next.buyCost = confirmedBuys.total; next.soldQuantity = confirmedSales.quantity; next.soldTotal = confirmedSales.total; next.source = 'steam-csv';
    }
    if (confirmedBuys.quantity === next.boughtQuantity) { next.buyCost = confirmedBuys.total; next.source = 'steam-csv'; }
    if (confirmedSales.quantity === next.soldQuantity) next.soldTotal = confirmedSales.total;
    return { ...item, accounting: next, trades, historyIncomplete: confirmedBuys.quantity < next.boughtQuantity || confirmedSales.quantity < next.soldQuantity };
  });
  if (groups.size) throw new Error(`Позиции из CSV отсутствуют в сверенном портфеле: ${[...groups.keys()].join(', ')}`);
  const confirmed = items.flatMap(item => item.trades).filter(trade => trade.source === 'steam-csv');
  const buys = totals(confirmed, 'buy'), sales = totals(confirmed, 'sell');
  const historyImport = { importedAt, filename: basename(filename), appId: 590830, totalRows: parsed.totalRows, ignoredRows: parsed.ignoredRows, duplicateRows: parsed.duplicateRows, transactionCount: confirmed.length, buyCount: confirmed.filter(t => t.type === 'buy').length, sellCount: confirmed.filter(t => t.type === 'sell').length, boughtQuantity: buys.quantity, soldQuantity: sales.quantity, buyTotal: buys.total, sellTotal: sales.total, unknownYearCount: confirmed.filter(t => !t.date).length, years: [...new Set(confirmed.filter(t => t.date).map(t => t.date.slice(0, 4)))].sort() };
  return buildSandboxPortfolio({ inventory: null, previous: { ...previous, items, historyImport } });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const filename = process.argv[2];
  const yearIndex = process.argv.indexOf('--year');
  if (!filename) throw new Error('Укажите путь к market_history.csv; при необходимости --year 2025');
  const year = yearIndex < 0 ? null : Number(process.argv[yearIndex + 1]);
  const parsed = parseSandboxHistory(readFileSync(filename, 'utf8'), { year });
  const target = resolve('data/sandbox.json');
  const previous = JSON.parse(readFileSync(target, 'utf8'));
  const result = importSandboxHistory(previous, parsed, { filename });
  writeFileSync(`${target}.tmp`, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  renameSync(`${target}.tmp`, target);
  console.log(JSON.stringify(result.historyImport));
}
