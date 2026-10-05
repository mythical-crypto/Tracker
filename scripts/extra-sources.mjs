import { setTimeout as delay } from 'node:timers/promises';
import { retainSnapshots } from './history.mjs';
import { summarizeCosts, annotateCostCoverage } from './cost-coverage.mjs';

export const DROPSTAB_PUBLIC_URL = 'https://dropstab.com/p/na-piccu-x62hsarup5';

export const SOURCE_URLS = {
  sandbox: 'https://steamcommunity.com/market/priceoverview/',
  crypto: 'https://dropstab.com/_gateway/api/portfolio/api/portfolioGroup/individualShare/na-piccu-x62hsarup5',
  cryptoTransactions: 'https://dropstab.com/_gateway/api/portfolio/api/portfolioGroup/transactions?groupIds=1169512&size=100&page=0',
};

export const SANDBOX_BUYS = [
  ['Punk Helmet', 121, 25, 3025],
  ['Crossbody Bag Shirt', 192, 35, 6720],
  ['OG Pants - Red', 150.36, 50, 7518],
  ['Brainy BRN-101', 365, 10, 3650],
  ['Sports Bandage', 76, 26, 1976],
  ['Navy Check Raincoat with Cap', 229, 16, 3664],
  ['Aviator Helmet', 296.51, 32, 9488.32],
  ['Surgical Face Mask', 114, 20, 2280],
  ['Gumball Machine', 343, 5, 1715],
  ['Mob Boss Shoes', 191, 10, 1910],
  ['Mob Boss Waistcoat & Shirt', 227.46, 30, 6823.8],
  ['Mob Boss Pinstripe Trousers', 219.51, 15, 3292.65],
  ['Bag', 267, 20, 5340],
  ['Lucky Bastard Helmet', 493, 15, 7395],
  ['OG Pants - Red', 215, 10, 2150],
  ['Crossbody Bag Shirt', 210, 2, 420],
  ['Vacation Shirt', 114, 20, 2280],
  ['Balaclava Yellow Black', 267, 15, 4005],
  ['Construction Glasses', 76, 19, 1444],
];

export const SANDBOX_ASSUMED_SALE = {
  name: 'Navy Check Raincoat with Cap',
  quantity: 15,
  unitPrice: 674.12,
  total: 10111.8,
};

const number = (value) => {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const iconUrl = (icon) => icon
  ? `https://community.fastly.steamstatic.com/economy/image/${icon}/180fx180f`
  : undefined;

function idFor(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function inventoryMap(inventory) {
  const descriptions = new Map((inventory?.descriptions ?? []).map((item) => [`${item.classid}:${item.instanceid}`, item]));
  const counts = new Map();
  for (const asset of inventory?.assets ?? []) {
    const description = descriptions.get(`${asset.classid}:${asset.instanceid}`);
    const name = description?.market_hash_name;
    if (name) counts.set(name, (counts.get(name) ?? 0) + Number(asset.amount || 0));
  }
  return { descriptions, counts };
}

export function buildSandboxPortfolio({ inventory, previous, fetchedAt = null, prices = {} }) {
  const { descriptions, counts } = inventoryMap(inventory);
  const oldById = new Map((previous?.items ?? []).map((item) => [item.id, item]));
  const names = [...new Set([...SANDBOX_BUYS.map(([name]) => name), ...counts.keys(), ...(previous?.items ?? []).map((item) => item.name)])];
  const items = names.map((name) => {
    const id = idFor(name);
    const old = oldById.get(id);
    const trades = previous?.historyImport && old ? old.trades : SANDBOX_BUYS.flatMap(([tradeName, unitPrice, quantity, total], index) => tradeName === name
      ? [{ id: `sandbox-buy-${index + 1}`, type: 'buy', date: null, quantity, unitPrice, total, fee: 0, feeUnknown: true, currency: 'RUB', source: 'user-table' }]
      : []);
    if (!previous?.historyImport && name === SANDBOX_ASSUMED_SALE.name) {
      trades.push({ id: 'sandbox-sale-assumed-1', type: 'sell', date: null, quantity: SANDBOX_ASSUMED_SALE.quantity, unitPrice: SANDBOX_ASSUMED_SALE.unitPrice, total: SANDBOX_ASSUMED_SALE.total, fee: 0, feeUnknown: true, currency: 'RUB', source: 'inferred' });
    }
    const boughtQuantity = old?.accounting?.boughtQuantity ?? trades.filter((trade) => trade.type === 'buy').reduce((sum, trade) => sum + trade.quantity, 0);
    const buyCost = old?.accounting?.buyCost ?? trades.filter((trade) => trade.type === 'buy').reduce((sum, trade) => sum + trade.total, 0);
    const sold = old?.accounting?.soldQuantity ?? trades.filter((trade) => trade.type === 'sell').reduce((sum, trade) => sum + trade.quantity, 0);
    const soldTotal = old?.accounting?.soldTotal ?? trades.filter((trade) => trade.type === 'sell').reduce((sum, trade) => sum + trade.total, 0);
    const quantity = Math.max(0, boughtQuantity - sold);
    const averageBuyPrice = boughtQuantity ? buyCost / boughtQuantity : null;
    const cost = boughtQuantity ? Math.max(0, buyCost - sold * averageBuyPrice) : null;
    const verifiedQuantity = counts.has(name) ? counts.get(name) : (inventory ? 0 : old?.verifiedQuantity ?? null);
    const description = [...descriptions.values()].find((item) => item.market_hash_name === name);
    const live = Number.isFinite(prices[name]?.price) && prices[name].price > 0 ? prices[name] : null;
    const retainedPrice = live?.price ?? old?.price ?? null;
    const retainedUpdatedAt = live?.updatedAt ?? old?.updatedAt ?? null;
    const extras = !boughtQuantity;
    return {
      id,
      class: 'sandbox',
      name,
      category: 'Предметы инвентаря',
      quantity: extras ? (verifiedQuantity ?? 0) : quantity,
      cost: extras ? null : cost,
      averageBuyPrice: extras ? null : averageBuyPrice,
      realized: sold ? soldTotal - sold * averageBuyPrice : null,
      price: retainedPrice,
      currency: 'RUB',
      updatedAt: retainedUpdatedAt,
      ...((iconUrl(description?.icon_url) ?? old?.icon) ? { icon: iconUrl(description?.icon_url) ?? old.icon } : {}),
      marketUrl: `https://steamcommunity.com/market/listings/590830/${encodeURIComponent(name)}`,
      source: 'Steam Community Market',
      ...(verifiedQuantity !== null ? { verifiedQuantity, quantityStatus: extras ? 'extra' : (verifiedQuantity === quantity ? 'match' : 'mismatch') } : {}),
      ...(old?.accounting ? { accounting: old.accounting } : {}),
      ...(old?.historyIncomplete !== undefined ? { historyIncomplete: old.historyIncomplete } : {}),
      trades,
    };
  });

  const held = items.filter((item) => item.quantity > 0);
  const notes = [
    'Инвентарь сверен по сохранённому публичному Steam inventory; ежедневное обновление приватного инвентаря не выполняется.',
    ...(items.some(item => item.trades.some(trade => trade.id === 'sandbox-sale-assumed-1')) ? ['Для Navy Check Raincoat with Cap продажа 15 шт. по 674,12 ₽ выведена из разницы покупки (16) и остатка в инвентаре (1); дата и комиссия неизвестны, запись предварительная.'] : []),
    ...(previous?.historyImport ? [
      `Из ${previous.historyImport.filename} импортировано ${previous.historyImport.transactionCount} операций s&box: ${previous.historyImport.buyCount} покупок (${previous.historyImport.boughtQuantity} шт.) и ${previous.historyImport.sellCount} продаж (${previous.historyImport.soldQuantity} шт.). Остальные игры отсеяны по App Id 590830.`,
      'CSV содержит часть истории: остатки и себестоимость неполных позиций сохранены по исходной таблице, подтверждённые операции к ним повторно не прибавляются. Даты таблицы неизвестны.',
      ...(previous.historyImport.duplicateRows ? [`В экспорте ${previous.historyImport.duplicateRows} повторяющихся строк. Они сохранены как отдельные операции: Steam может повторять идентификатор сгруппированного предмета.`] : []),
      ...(previous.historyImport.unknownYearCount ? ['В CSV год не указан; такие даты показаны без предполагаемого года.'] : [`Год дат CSV — ${previous.historyImport.years.join(', ')}; время суток в файле отсутствует.`]),
    ] : []),
    'В исходных данных Sandbox комиссии не указаны; нулевое fee в записях не подтверждает отсутствие комиссии.',
    ...items.filter((item) => item.quantityStatus === 'mismatch').map((item) => `Количество не совпало с сохранённым инвентарём: ${item.name} (${item.quantity} учтено, ${item.verifiedQuantity} в инвентаре).`),
    ...items.filter((item) => item.quantityStatus === 'extra').map((item) => `В инвентаре есть позиция без истории покупок и себестоимости: ${item.name}.`),
    ...held.filter((item) => item.price === null).map((item) => `Нет проверенной текущей цены для позиции: ${item.name}.`),
  ];
  const freshCount = held.filter((item) => Number.isFinite(prices[item.name]?.price) && prices[item.name].price > 0).length;
  const effectiveFetchedAt = freshCount > 0 ? fetchedAt : (previous?.fetchedAt ?? null);
  let snapshots = (previous?.snapshots ?? []).map((snapshot) => ({
    ...annotateCostCoverage(snapshot, held),
    ...(snapshot.source?.startsWith('Steam Community Market') ? { source: 'Steam Community Market' } : {}),
  }));
  const priced = held.filter((item) => Number.isFinite(item.price) && item.price >= 0);
  if (freshCount > 0 && effectiveFetchedAt && priced.length > 0) {
    const value = priced.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const snapshot = {
      at: effectiveFetchedAt,
      value,
      ...summarizeCosts(held),
      complete: priced.length === held.length,
      pricedCount: priced.length,
      totalCount: held.length,
      coverageKey: priced.map((item) => item.id).sort().join('|'),
      itemPrices: Object.fromEntries(priced.map((item) => [item.id, item.price])),
      itemQuantities: Object.fromEntries(held.map((item) => [item.id, item.quantity])),
      itemUpdatedAt: Object.fromEntries(priced.filter((item) => item.updatedAt).map((item) => [item.id, item.updatedAt])),
      quoteDates: Object.fromEntries(priced.filter((item) => item.updatedAt).map((item) => [item.id, item.updatedAt])),
      quantityKey: held.map((item) => `${item.id}:${item.quantity}`).sort().join('|'),
      freshCount,
      source: 'Steam Community Market',
    };
    const existingIndex = snapshots.findIndex((entry) => entry.at === effectiveFetchedAt);
    if (existingIndex >= 0) snapshots[existingIndex] = snapshot;
    else snapshots.push(snapshot);
  }
  if (effectiveFetchedAt) snapshots = retainSnapshots(snapshots, Date.parse(effectiveFetchedAt));
  return {
    source: 'Steam Community Market',
    fetchedAt: effectiveFetchedAt,
    freshCount,
    totalCount: held.length,
    sourceUrl: SOURCE_URLS.sandbox,
    items,
    snapshots,
    notes,
    ...(previous?.verifiedAt ? { verifiedAt: previous.verifiedAt } : {}),
    ...(previous?.historyImport ? { historyImport: previous.historyImport } : {}),
    ...(previous?.attemptedAt ? { attemptedAt: previous.attemptedAt } : {}),
    error: freshCount ? undefined : previous?.error,
  };
}

function unwrapPortfolio(payload) {
  let current = payload;
  for (let i = 0; i < 3; i++) {
    if (current?.data && !current.portfolios) current = current.data;
    else if (current?.portfolioGroup && !current.portfolios) current = current.portfolioGroup;
  }
  if (!Array.isArray(current?.portfolios)) throw new Error('DropsTab portfolio response did not contain portfolios[]');
  return current;
}

export function cryptoTransactionsFromGroup(group) {
  return (group.portfolios ?? []).flatMap((portfolio) => (portfolio.transactions ?? []).map((trade) => ({
    ...trade,
    currencyId: portfolio.currencyId,
    transactionType: trade.transactionType,
  })));
}

export function buildCryptoPortfolio({ payload, transactions = null, previous, fetchedAt = new Date().toISOString() }) {
  const group = unwrapPortfolio(payload);
  const rawTransactions = transactions ?? cryptoTransactionsFromGroup(group);
  const assetTrades = new Map(group.portfolios.map((portfolio) => [Number(portfolio.currencyId), []]));
  for (const trade of rawTransactions) {
    if (Number(trade.groupId) !== 1169512 && trade.groupId !== undefined) continue;
    const list = assetTrades.get(Number(trade.currencyId));
    if (!list) continue;
    const quantity = number(trade.quantity) ?? 0;
    const unitPrice = number(trade.priceUsd) ?? number(trade.priceInQuote);
    if (unitPrice === null) continue;
    const fee = number(trade.fee);
    const feeType = typeof trade.feeType === 'string' ? trade.feeType : undefined;
    const feeQuantity = number(trade.feeQuantity);
    const feePortfolio = group.portfolios.find((portfolio) => Number(portfolio.currencyId) === Number(trade.feeCurrencyDto?.id));
    const feeCurrency = typeof trade.feeCurrencyDto?.symbol === 'string'
      ? trade.feeCurrencyDto.symbol
      : feePortfolio?.symbol ?? trade.feeCurrencyDto?.name;
    list.push({
      ...(trade.id !== undefined ? { id: String(trade.id) } : {}),
      type: String(trade.transactionType ?? trade.type ?? '').toLowerCase(),
      date: transactionDate(trade.txDate ?? trade.createdAt),
      quantity,
      unitPrice,
      total: quantity * unitPrice,
      fee: fee ?? 0,
      ...(feeCurrency ? { feeCurrency } : {}),
      ...(feeQuantity !== null ? { feeQuantity } : {}),
      ...(feeType ? { feeType } : {}),
      ...(fee === null ? { feeUnknown: true } : {}),
      currency: 'USD',
    });
  }
  const oldById = new Map((previous?.items ?? []).map((item) => [item.id, item]));
  const freshIds = new Set();
  const items = group.portfolios.map((portfolio) => {
    const id = `crypto-${idFor(portfolio.symbol || portfolio.name)}`;
    const quantity = number(portfolio.quantity) ?? number(portfolio.accurateQuantity);
    if (quantity === null || quantity < 0) throw new Error(`DropsTab did not provide a valid quantity for ${portfolio.symbol ?? portfolio.name}`);
    const held = quantity > 0;
    const sourcePrice = number(portfolio.price?.USD);
    const price = sourcePrice !== null && sourcePrice >= 0 ? sourcePrice : null;
    if (held && price !== null) freshIds.add(id);
    const cost = held ? number(portfolio.initialCap?.USD) : null;
    const trades = assetTrades.get(Number(portfolio.currencyId)) ?? [];
    return {
      id,
      class: 'crypto',
      name: portfolio.name,
      symbol: portfolio.symbol,
      category: 'Криптовалюта',
      quantity,
      cost,
      averageBuyPrice: held ? number(portfolio.averageBuyPrice?.USD) : null,
      realized: number(portfolio.realizedProfit?.USD),
      price: price ?? oldById.get(id)?.price ?? null,
      currency: 'USD',
      updatedAt: price !== null ? fetchedAt : (oldById.get(id)?.updatedAt ?? null),
      ...(portfolio.image ? { icon: portfolio.image } : {}),
      marketUrl: `https://dropstab.com/coins/${portfolio.slug}`,
      source: 'DropsTab',
      trades,
    };
  });
  const previousSnapshots = previous?.snapshots ?? [];
  const totalValue = number(group.portfolioTotal?.totalCap?.USD);
  const totalCost = number(group.portfolioTotal?.initialCap?.USD);
  const held = items.filter((item) => item.quantity > 0);
  const priced = held.filter((item) => Number.isFinite(item.price) && item.price >= 0);
  const costSummary = summarizeCosts(held);
  const complete = priced.length === held.length;
  const freshCount = freshIds.size;
  let snapshots = previousSnapshots.map((snapshot) => {
    snapshot = annotateCostCoverage(snapshot, held);
    if (snapshot.coverageKey !== undefined && snapshot.pricedCount !== undefined && snapshot.totalCount !== undefined) {
      const covered = new Set(snapshot.coverageKey.split('|'));
      const itemPrices = Object.fromEntries(Object.entries(snapshot.itemPrices ?? {}).filter(([id]) => covered.has(id)));
      return { ...snapshot, itemPrices, ...(snapshot.source?.startsWith('DropsTab') ? { source: 'DropsTab' } : {}) };
    }
    const itemPrices = snapshot.itemPrices ?? {};
    const coveredIds = held.filter((item) => typeof itemPrices[item.id] === 'number').map((item) => item.id).sort();
    return { ...snapshot, pricedCount: coveredIds.length, totalCount: held.length, coverageKey: coveredIds.join('|'), complete: snapshot.complete && coveredIds.length === held.length, ...(snapshot.source?.startsWith('DropsTab') ? { source: 'DropsTab' } : {}) };
  });
  if (freshCount > 0 && priced.length > 0 && !snapshots.some((snapshot) => snapshot.at === fetchedAt)) {
    const observedValue = priced.reduce((sum, item) => sum + item.price * item.quantity, 0);
    snapshots.push({
      at: fetchedAt,
      value: observedValue,
      ...(totalValue !== null && Math.abs(totalValue - observedValue) > 1e-8 ? { sourceValue: totalValue } : {}),
      ...costSummary,
      ...(totalCost !== null && totalCost !== costSummary.cost ? { sourceCost: totalCost } : {}),
      complete,
      pricedCount: priced.length,
      totalCount: held.length,
      coverageKey: priced.map((item) => item.id).sort().join('|'),
      itemPrices: Object.fromEntries(priced.map((item) => [item.id, item.price])),
      itemQuantities: Object.fromEntries(held.map((item) => [item.id, item.quantity])),
      itemUpdatedAt: Object.fromEntries(priced.filter((item) => item.updatedAt).map((item) => [item.id, item.updatedAt])),
      quoteDates: Object.fromEntries(priced.map((item) => [item.id, item.updatedAt])),
      quantityKey: held.map((item) => `${item.id}:${item.quantity}`).sort().join('|'),
      freshCount,
      source: 'DropsTab',
    });
  }
  snapshots = retainSnapshots(snapshots, Date.parse(fetchedAt));
  const totalRub = number(group.portfolioTotal?.totalCap?.RUB);
  const sourceFx = totalValue > 0 && totalRub > 0 ? totalRub / totalValue : null;
  const usdRub = Number.isFinite(sourceFx) && sourceFx > 0 ? sourceFx : null;
  return {
    source: 'DropsTab',
    fetchedAt: freshCount ? fetchedAt : (previous?.fetchedAt ?? null),
    freshCount,
    totalCount: held.length,
    sourceUrl: DROPSTAB_PUBLIC_URL,
    items,
    snapshots,
    notes: [
      'Рыночная история доступного источника не получена; график может использовать только снимки, зафиксированные самим трекером после этого обновления.',
      'Данные USD/RUB — отношение оценок портфеля DropsTab в RUB и USD, не отдельный курс валютного провайдера.',
    ],
    ...(usdRub ? { usdRub, fxUpdatedAt: fetchedAt, fxSource: 'DropsTab portfolio valuation ratio (RUB/USD)' } : (previous?.usdRub ? { usdRub: previous.usdRub, fxUpdatedAt: previous.fxUpdatedAt, fxSource: previous.fxSource } : {})),
    ...(freshCount < held.length ? { error: `DropsTab: обновлены котировки ${freshCount}/${held.length}; сохранённые цены сохраняют исходные даты.` } : {}),
  };
}

function transactionDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const time = typeof value === 'string' && !/^\d+$/.test(value) ? Date.parse(value) : Number(value);
  return Number.isFinite(time) && time > 0 && time <= 8640000000000000 ? new Date(time).toISOString() : null;
}

export function transientSourceFailure(error) {
  return /(?:HTTP (?:429|5\d\d)|fetch failed|timed? ?out|network|ECONN|EAI_AGAIN)/i.test(String(error?.message)) || error?.name === 'TimeoutError' || error?.name === 'AbortError';
}

export function rublesToKopecks(text) {
  const amount = String(text).replace(/руб\.?|₽/gi, '').replace(/\s/g, '');
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(amount)) throw new Error(`Некорректная цена Steam: ${text}`);
  const parsed = Number(amount.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Некорректная цена Steam: ${text}`);
  return Math.round(parsed * 100);
}

export async function fetchJson(url, { timeoutMs = 20000, headers = {} } = {}) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Tracker/1.0 (personal portfolio)', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
  return response.json();
}

export async function fetchCryptoSource({ fetchSource = fetchJson } = {}) {
  const group = await fetchSource(SOURCE_URLS.crypto);
  const result = unwrapPortfolio(group);
  const rows = [];
  let total = null;
  let completed = false;
  for (let page = 0; page < 20; page++) {
    const url = new URL(SOURCE_URLS.cryptoTransactions);
    url.searchParams.set('page', String(page));
    const body = await fetchSource(url);
    if (!Array.isArray(body.content)) throw new Error('DropsTab transactions response did not contain content[]');
    rows.push(...body.content);
    total = number(body.totalElements);
    if (body.last === true || body.content.length === 0 || (total !== null && rows.length >= total)) { completed = true; break; }
  }
  if (!completed) throw new Error('DropsTab transaction pagination exceeded 20 pages; previous transactions must be preserved');
  if (total !== null && rows.length < total) throw new Error(`DropsTab returned ${rows.length}/${total} transactions`);
  if (rows.length === 0) return { group: result, transactions: cryptoTransactionsFromGroup(result) };
  return { group: result, transactions: rows };
}

export async function fetchSteamPrice(name, { appid = '590830', fetchSource = fetchJson } = {}) {
  const url = new URL(SOURCE_URLS.sandbox);
  url.searchParams.set('appid', appid);
  url.searchParams.set('currency', '5');
  url.searchParams.set('market_hash_name', name);
  const body = await fetchSource(url);
  if (!body.success || typeof body.lowest_price !== 'string' || !/(?:руб|₽)/i.test(body.lowest_price)) {
    throw new Error(`Steam не подтвердил рублёвую цену для ${name}`);
  }
  return rublesToKopecks(body.lowest_price) / 100;
}

export { delay };
