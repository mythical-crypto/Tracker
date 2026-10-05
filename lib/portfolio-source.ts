import type { Asset, ExtraPortfolio, Snapshot } from './types';

type RemoteResult<T> = { data: T | null; error?: string; readAt: string };
type CacheEntry = { result: RemoteResult<unknown>; expiresAt: number };
const DELIVERY_ERROR = 'Не удалось прочитать опубликованные данные. Сохранены последние доступные котировки с исходными датами.';

// Explicit expiry avoids Next's stale-while-revalidate cache hiding failed reads.
// Cache and pending reads are shared only within this server process.
export function createGithubReader(fetcher: typeof fetch = fetch, now = Date.now, getToken = () => process.env.GITHUB_DATA_TOKEN) {
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, Promise<RemoteResult<unknown>>>();
  return async function githubFile<T>(name: string, validate: (value: unknown) => value is T): Promise<RemoteResult<T>> {
    const previous = cache.get(name);
    if (previous && previous.expiresAt > now()) return previous.result as RemoteResult<T>;
    const running = pending.get(name);
    if (running) return running as Promise<RemoteResult<T>>;
    const read = (async (): Promise<RemoteResult<T>> => {
      try {
        const token = getToken();
        const path = encodeURIComponent(name);
        const url = token
          ? `https://api.github.com/repos/mythical-crypto/Tracker/contents/data/${path}?ref=main`
          : `https://raw.githubusercontent.com/mythical-crypto/Tracker/main/data/${path}`;
        const response = await fetcher(url, {
          headers: { Accept: 'application/vnd.github.raw+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          cache: 'no-store', signal: AbortSignal.timeout(6000),
        });
        if (!response.ok) throw new Error('Remote data is unavailable');
        const data: unknown = await response.json();
        if (!validate(data)) throw new Error('Invalid remote data');
        const result = { data, readAt: new Date(now()).toISOString() };
        cache.set(name, { result, expiresAt: now() + 300_000 });
        return result;
      } catch {
        const result = { data: (previous?.result.data ?? null) as T | null, error: DELIVERY_ERROR, readAt: new Date(now()).toISOString() };
        cache.set(name, { result, expiresAt: now() + 30_000 });
        return result;
      } finally {
        pending.delete(name);
      }
    })();
    pending.set(name, read);
    return read;
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function date(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function amount(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}
function nonNegativeAmount(value: unknown): boolean {
  return amount(value) && (value === null || (value as number) >= 0);
}
function numericMap(value: unknown): boolean {
  return value === undefined || (record(value) && Object.values(value).every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0));
}
function dateMap(value: unknown): boolean {
  return value === undefined || (record(value) && Object.values(value).every(date));
}
export function validSnapshots(value: unknown): value is Snapshot[] {
  return Array.isArray(value) && value.every(s => record(s) && date(s.at)
    && typeof s.value === 'number' && Number.isFinite(s.value) && s.value >= 0
    && nonNegativeAmount(s.cost) && typeof s.complete === 'boolean'
    && numericMap(s.itemPrices) && numericMap(s.itemQuantities)
    && dateMap(s.itemUpdatedAt) && dateMap(s.quoteDates));
}

export function validExtraPortfolio(value: unknown, kind: 'sandbox' | 'crypto'): value is ExtraPortfolio {
  const source = kind === 'sandbox' ? 'Steam Community Market' : 'DropsTab';
  const currency = kind === 'sandbox' ? 'RUB' : 'USD';
  if (!record(value) || value.source !== source || !(value.fetchedAt === null || date(value.fetchedAt))
    || typeof value.sourceUrl !== 'string' || !Array.isArray(value.items) || !validSnapshots(value.snapshots)
    || !Array.isArray(value.notes) || !value.notes.every(v => typeof v === 'string')) return false;
  if (value.usdRub !== undefined && (typeof value.usdRub !== 'number' || !Number.isFinite(value.usdRub) || value.usdRub <= 0)) return false;
  const ids = new Set<string>();
  return value.items.every((a: unknown): a is Asset => {
    if (!record(a) || a.class !== kind || a.currency !== currency || typeof a.id !== 'string' || ids.has(a.id)
      || typeof a.name !== 'string' || typeof a.category !== 'string' || typeof a.marketUrl !== 'string'
      || a.source !== source || typeof a.quantity !== 'number' || !Number.isFinite(a.quantity) || a.quantity < 0
      || !nonNegativeAmount(a.price) || !nonNegativeAmount(a.cost) || !nonNegativeAmount(a.averageBuyPrice) || !amount(a.realized)
      || !(a.updatedAt === null || date(a.updatedAt)) || !Array.isArray(a.trades)) return false;
    ids.add(a.id);
    return a.trades.every(t => record(t) && typeof t.type === 'string' && (t.date === null || date(t.date))
      && typeof t.quantity === 'number' && Number.isFinite(t.quantity) && typeof t.unitPrice === 'number' && Number.isFinite(t.unitPrice)
      && typeof t.total === 'number' && Number.isFinite(t.total) && typeof t.fee === 'number' && Number.isFinite(t.fee) && t.currency === currency);
  });
}

export function validSteamLive(value: unknown): value is { prices: Record<string, unknown>; history: { snapshots: Record<string, unknown>[] } } {
  if (!record(value) || !record(value.prices) || value.prices.source !== 'Steam Community Market' || value.prices.currency !== 'RUB'
    || !record(value.prices.items) || !record(value.history) || !Array.isArray(value.history.snapshots)) return false;
  return Object.values(value.prices.items).every(q => record(q)
    && (q.priceKopecks === undefined || (typeof q.priceKopecks === 'number' && Number.isSafeInteger(q.priceKopecks) && q.priceKopecks >= 0))
    && (q.updatedAt === undefined || date(q.updatedAt)))
    && value.history.snapshots.every(s => record(s) && date(s.at)
      && typeof s.valueKopecks === 'number' && Number.isFinite(s.valueKopecks) && s.valueKopecks >= 0
      && typeof s.costKopecks === 'number' && Number.isFinite(s.costKopecks)
      && typeof s.totalCount === 'number' && Number.isFinite(s.totalCount)
      && numericMap(s.itemPrices) && numericMap(s.itemQuantities) && dateMap(s.itemUpdatedAt) && dateMap(s.quoteDates));
}

export function validCombinedHistory(value: unknown): value is { snapshots: Snapshot[] } {
  return record(value) && validSnapshots(value.snapshots);
}

type SteamSnapshot = {
  at: string; valueKopecks: number; costKopecks: number; totalCount: number; freshCount?: number;
  itemPrices?: Record<string, number>; itemQuantities?: Record<string, number>;
  itemUpdatedAt?: Record<string, string>; quoteDates?: Record<string, string>;
};
export function normalizeSteamSnapshot(s: SteamSnapshot): Snapshot {
  const itemPrices = Object.fromEntries(Object.entries(s.itemPrices ?? {}).filter(([, price]) => Number.isFinite(price)).map(([name, price]) => [`cs2:${name}`, price / 100]));
  const pricedCount = Object.keys(itemPrices).length;
  const itemQuantities = s.itemQuantities && Object.fromEntries(Object.entries(s.itemQuantities).map(([name, quantity]) => [`cs2:${name}`, quantity]));
  const datedQuotes = s.itemUpdatedAt ?? s.quoteDates;
  const itemUpdatedAt = datedQuotes && Object.fromEntries(Object.entries(datedQuotes).map(([name, at]) => [`cs2:${name}`, at]));
  const quantityKey = itemQuantities && Object.entries(itemQuantities).map(([id, quantity]) => `${id}:${quantity}`).sort().join('|');
  return { at: s.at, value: s.valueKopecks / 100, cost: s.costKopecks / 100, complete: pricedCount === s.totalCount, pricedCount, totalCount: s.totalCount, freshCount: s.freshCount, costComplete: true, knownCostCount: s.totalCount, coverageKey: Object.keys(itemPrices).sort().join('|'), source: 'Steam Community Market', itemPrices, itemQuantities, itemUpdatedAt, quantityKey };
}
