import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const SOURCES = [
  ['stikery-arma.csv', 'Наклейки · Arma'],
  ['breloki-6.csv', 'Брелоки'],
  ['case-486.csv', 'Кейсы'],
  ['kapsuly-23.csv', 'Капсулы'],
  ['kopen-2.csv', 'Наклейки · Copenhagen'],
  ['parizh-3.csv', 'Наклейки · Paris'],
  ['shankhay-4.csv', 'Наклейки · Shanghai'],
];

export function parseCsv(source) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error('Незакрытые кавычки в CSV');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((key, i) => [key.replace(/^\uFEFF/, ''), values[i] ?? ''])));
}

export function aggregate(transactions) {
  const byName = new Map();
  for (const tx of transactions) {
    if (!byName.has(tx.name)) byName.set(tx.name, { name: tx.name, category: tx.category, trades: [], lots: [], realizedKopecks: 0, soldCount: 0 });
    const item = byName.get(tx.name);
    if (item.category !== tx.category) throw new Error(`Предмет в нескольких категориях: ${tx.name}`);
    item.trades.push(tx);
    if (tx.type === 'buy') item.lots.push({ qty: tx.quantity, unitKopecks: tx.unitKopecks });
    else if (tx.type === 'sell') {
      let remaining = tx.quantity, cost = 0;
      for (const lot of item.lots) {
        const taken = Math.min(remaining, lot.qty);
        cost += taken * lot.unitKopecks;
        lot.qty -= taken;
        remaining -= taken;
        if (!remaining) break;
      }
      if (remaining) throw new Error(`Продано больше купленного: ${tx.name}`);
      item.soldCount += tx.quantity;
      item.realizedKopecks += tx.totalKopecks - tx.feeKopecks - cost;
    } else throw new Error(`Неизвестный тип операции: ${tx.type}`);
  }
  return [...byName.values()].map(({ lots, ...item }) => {
    const quantity = lots.reduce((sum, lot) => sum + lot.qty, 0);
    const costKopecks = lots.reduce((sum, lot) => sum + lot.qty * lot.unitKopecks, 0);
    return { ...item, quantity, costKopecks, averageKopecks: quantity ? Math.round(costKopecks / quantity) : 0 };
  }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

export function importFiles(directory) {
  const transactions = [];
  for (const [filename, category] of SOURCES) {
    const rows = parseCsv(readFileSync(join(directory, filename), 'utf8'));
    for (const row of rows) {
      if (row.Currency !== 'RUB') throw new Error(`Ожидалась валюта RUB: ${filename}`);
      const quantity = Number(row.Quantity), unitKopecks = Number(row['Unit Price']);
      const totalKopecks = Number(row['Total Price']), feeKopecks = Number(row['Fee Amount']);
      if (![quantity, unitKopecks, totalKopecks, feeKopecks].every(Number.isFinite) || quantity <= 0 || !['buy', 'sell'].includes(row.Type)) throw new Error(`Некорректная операция: ${filename}`);
      if (Math.abs(unitKopecks * quantity - totalKopecks) > 1) throw new Error(`Сумма операции не совпадает: ${filename}, ${row.Name}`);
      transactions.push({ name: row.Name, category, type: row.Type, quantity, unitKopecks, totalKopecks, feeKopecks, date: row.Date });
    }
  }
  transactions.sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'buy' ? -1 : 1));
  const allItems = aggregate(transactions);
  return { currency: 'RUB', costMethod: 'FIFO', importedAt: new Date().toISOString(), sourceFiles: SOURCES.map(([name]) => name), items: allItems.filter((item) => item.quantity > 0), closedItems: allItems.filter((item) => item.quantity === 0) };
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href) {
  const directory = process.argv[2];
  if (!directory) throw new Error('Укажите каталог с семью CSV');
  const result = importFiles(directory);
  mkdirSync('data', { recursive: true });
  writeFileSync('data/portfolio.json', JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(`Импортировано ${result.items.length} открытых позиций, ${result.closedItems.length} закрытых, ${result.items.concat(result.closedItems).reduce((n, x) => n + x.trades.length, 0)} операций\n`);
}
