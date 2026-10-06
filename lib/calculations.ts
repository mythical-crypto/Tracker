import type { Asset, AssetClass, Currency, PortfolioData, Snapshot } from './types';

export function convert(value: number | null, currency: Currency, usdRub: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return currency === 'RUB' ? value : usdRub && Number.isFinite(usdRub) && usdRub > 0 ? value * usdRub : null;
}
export function summarize(assets: Asset[], usdRub: number | null, native = false) {
  let value = 0, cost = 0, pnl = 0, realized = 0, priced = 0, knownCost = 0, comparable = 0, comparableCount = 0, realizedKnownCount = 0;
  for (const item of assets) {
    const amount = item.price === null ? null : item.price * item.quantity;
    const v = native ? amount : convert(amount, item.currency, usdRub);
    const c = native ? item.cost : convert(item.cost, item.currency, usdRub);
    if (v !== null && Number.isFinite(v)) { value += v; priced++; }
    if (c !== null && Number.isFinite(c)) { cost += c; knownCost++; }
    if (v !== null && c !== null && Number.isFinite(v) && Number.isFinite(c)) { pnl += v - c; comparable += c; comparableCount++; }
    const result = native ? item.realized : convert(item.realized, item.currency, usdRub);
    if (result !== null && Number.isFinite(result)) { realized += result; realizedKnownCount++; }
  }
  return { value: priced || !assets.length ? value : null, cost: knownCost || !assets.length ? cost : null, pnl: comparableCount || !assets.length ? pnl : null, roi: comparable ? pnl / comparable * 100 : null, realized: realizedKnownCount || !assets.length ? realized : null, priced, knownCost, total: assets.length, complete: priced === assets.length, comparable, comparableCount, realizedKnownCount };
}
export function filterHistory(snapshots: Snapshot[], period: string, now = Date.now()) {
  const days = period === 'day' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : period === 'year' ? 365 : Infinity;
  return snapshots.filter((s) => Number.isFinite(s.value) && Number.isFinite(Date.parse(s.at)) && Date.parse(s.at) >= now - days * 86400000 && Date.parse(s.at) <= now).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function newer<T>(local: T, incoming: T | null | undefined, date: (value: T) => string | null | undefined): T {
  if (!incoming) return local;
  const incomingTime = Date.parse(date(incoming) ?? '');
  const localTime = Date.parse(date(local) ?? '');
  return Number.isFinite(incomingTime) && (!Number.isFinite(localTime) || incomingTime > localTime) ? incoming : local;
}

export function newerLedger<T>(local: T, incoming: T | null | undefined, ledgerDate: (value: T) => string | null | undefined, quoteDate: (value: T) => string | null | undefined): T {
  if (!incoming) return local;
  if (ledgerDate(local) && !ledgerDate(incoming)) return local;
  if (ledgerDate(incoming) && !ledgerDate(local)) return incoming;
  return newer(local, incoming, value => ledgerDate(value) ?? quoteDate(value));
}

export function mergeSnapshots<T extends { at: string }>(local: T[], incoming: T[]): T[] {
  return [...new Map([...incoming, ...local].filter(s => Number.isFinite(Date.parse(s.at))).map(s => [s.at, s])).values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function quantitiesKey(snapshot: Snapshot): string | null {
  if (snapshot.quantityKey) return snapshot.quantityKey;
  if (!snapshot.itemQuantities || !Object.keys(snapshot.itemQuantities).length) return null;
  return Object.entries(snapshot.itemQuantities).map(([id, quantity]) => `${id}:${quantity}`).sort().join('|');
}

export function comparableSnapshots(first: Snapshot, second: Snapshot): boolean {
  const quantityKey = quantitiesKey(first);
  return !!first.coverageKey && first.coverageKey === second.coverageKey && first.complete === second.complete && quantityKey !== null && quantityKey === quantitiesKey(second);
}

export function historyChange(snapshots: Snapshot[]): number | null {
  const data = snapshots.filter(s => Number.isFinite(s.value) && Number.isFinite(Date.parse(s.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (data.length < 2 || data.some(s => !comparableSnapshots(data[0], s))) return null;
  return data.at(-1)!.value - data[0].value;
}

export type PeriodChange = { status: 'ready' | 'insufficient' | 'incomparable' | 'stale'; absolute: number | null; percent: number | null; from: string | null; to: string | null };

export function periodChange(snapshots: Snapshot[], days: 1 | 7 | 30, now = Date.now()): PeriodChange {
  const data = filterHistory(snapshots, 'all', now);
  const latest = data.at(-1);
  const empty: PeriodChange = { status: 'insufficient', absolute: null, percent: null, from: null, to: latest?.at ?? null };
  if (!latest) return empty;
  // Keep the reference tied to the requested calendar interval, not the start of a short history.
  if (now - Date.parse(latest.at) > 3600000) return { ...empty, status: 'stale' };
  const target = now - days * 86400000;
  const baseline = data.findLast(s => Date.parse(s.at) <= target);
  const tolerance = (days === 1 ? 1 : days === 7 ? 2 : 24) * 3600000;
  if (!baseline || target - Date.parse(baseline.at) > tolerance) return empty;
  const interval = data.filter(s => Date.parse(s.at) >= Date.parse(baseline.at));
  if (interval.some(s => !comparableSnapshots(baseline, s))) return { ...empty, status: 'incomparable', from: baseline.at };
  // A partial update must not rejuvenate a retained old quote inside a total valuation.
  if ([baseline, latest].some(s => Object.values(s.itemUpdatedAt ?? s.quoteDates ?? {}).some(at => !Number.isFinite(Date.parse(at)) || Date.parse(s.at) - Date.parse(at) > 3600000 || Date.parse(at) > Date.parse(s.at)))) return { ...empty, status: 'stale', from: baseline.at };
  const absolute = latest.value - baseline.value;
  return { status: 'ready', absolute, percent: baseline.value > 0 ? absolute / baseline.value * 100 : null, from: baseline.at, to: latest.at };
}

export function assetPriceHistory(asset: Asset, snapshots: Snapshot[], now = Date.now()): Snapshot[] {
  const observations = snapshots.flatMap(snapshot => {
    const key = snapshot.itemPrices?.[asset.id] !== undefined ? asset.id : asset.symbol || asset.name;
    const price = snapshot.itemPrices?.[key];
    if (price === undefined || !Number.isFinite(price) || price < 0) return [];
    const quoteAt = snapshot.itemUpdatedAt?.[key] ?? snapshot.quoteDates?.[key];
    // Legacy partial snapshots cannot identify which individual quotes were refreshed.
    if (!quoteAt && snapshot.freshCount !== undefined && snapshot.freshCount !== snapshot.pricedCount) return [];
    return [{ at: quoteAt ?? snapshot.at, value: price, cost: null, complete: true, coverageKey: asset.id, quantityKey: `${asset.id}:1`, pricedCount: 1, totalCount: 1 } satisfies Snapshot];
  });
  if (asset.price !== null && Number.isFinite(asset.price) && asset.price >= 0 && asset.updatedAt) observations.push({ at: asset.updatedAt, value: asset.price, cost: null, complete: true, coverageKey: asset.id, quantityKey: `${asset.id}:1`, pricedCount: 1, totalCount: 1 });
  // Source archives contain unit prices, never past holdings or invented valuations.
  return mergeSnapshots(filterHistory(observations, 'all', now), filterHistory(asset.priceHistory ?? [], 'all', now));
}

export function assetPnl(asset: Asset, usdRub: number | null, native = false): number | null {
  const value = asset.price === null || asset.cost === null ? null : asset.price * asset.quantity - asset.cost;
  return value === null || !Number.isFinite(value) ? null : native ? value : convert(value, asset.currency, usdRub);
}

export function mergeAssetQuotes(preferred: Asset[], other: Asset[]): Asset[] {
  const alternatives = new Map(other.map(a => [a.id, a]));
  return preferred.map(asset => {
    const alternate = alternatives.get(asset.id);
    if (!alternate || alternate.currency !== asset.currency || alternate.class !== asset.class) return asset;
    const quote = newer(asset, alternate, a => a.updatedAt);
    return { ...asset, price: quote.price, updatedAt: quote.updatedAt, icon: quote.icon ?? asset.icon };
  });
}

export function mergePortfolio(current: PortfolioData, incoming: PortfolioData): PortfolioData {
  const selected = Object.fromEntries((['cs2', 'sandbox', 'crypto'] as AssetClass[]).map(id => [id, id === 'sandbox' ? newerLedger(current, incoming, p => p.sources.sandbox.ledgerAt, p => p.sources.sandbox.at) : newer(current, incoming, p => p.sources[id].at)])) as Record<AssetClass, PortfolioData>;
  return {
    ...selected.crypto,
    assets: mergeAssetQuotes((['cs2', 'sandbox', 'crypto'] as AssetClass[]).flatMap(id => selected[id].assets.filter(a => a.class === id)), mergeAssetQuotes(current.assets, incoming.assets)),
    sources: Object.fromEntries((['cs2', 'sandbox', 'crypto'] as AssetClass[]).map(id => {
      const status = newer(current.sources[id], incoming.sources[id], s => s.attemptedAt ?? s.at);
      const quoteStatus = newer(current.sources[id], incoming.sources[id], s => s.at);
      const delivery = newer(current.sources[id], incoming.sources[id], s => s.readAt);
      return [id, { ...selected[id].sources[id], at: quoteStatus.at, error: status.error, attemptedAt: status.attemptedAt, readAt: delivery.readAt, deliveryError: delivery.deliveryError }];
    })) as PortfolioData['sources'],
    history: { cs2: mergeSnapshots(current.history.cs2, incoming.history.cs2), sandbox: mergeSnapshots(current.history.sandbox, incoming.history.sandbox), crypto: mergeSnapshots(current.history.crypto, incoming.history.crypto) },
    combinedHistory: mergeSnapshots(current.combinedHistory, incoming.combinedHistory),
    sandboxNotes: selected.sandbox.sandboxNotes, verifiedAt: selected.sandbox.verifiedAt, verifiedInventoryUrl: selected.sandbox.verifiedInventoryUrl,
  };
}
