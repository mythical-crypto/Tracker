import 'server-only';
import cs2 from '@/data/portfolio.json';
import cs2Prices from '@/data/prices.json';
import cs2History from '@/data/history.json';
import sandbox from '@/data/sandbox.json';
import crypto from '@/data/crypto.json';
import combinedHistory from '@/data/combined-history.json';
import { requireSession } from './auth.mjs';
import { mergeAssetQuotes, mergeSnapshots, newer, newerLedger } from './calculations';
import { createGithubReader, normalizeSteamSnapshot, validCombinedHistory, validExtraPortfolio, validSteamLive } from './portfolio-source';
import type { Asset, ExtraPortfolio, PortfolioData, Snapshot } from './types';

const githubFile = createGithubReader();
const VERIFIED_INVENTORY_URL = 'https://steamcommunity.com/profiles/76561199654246992/inventory/#590830';
type CsSnapshot = (typeof cs2History.snapshots)[number] & {
  itemQuantities?: Record<string, number>;
  itemUpdatedAt?: Record<string, string>;
  quoteDates?: Record<string, string>;
};

export async function loadPortfolio(): Promise<PortfolioData> {
  await requireSession();
  const [liveResult, sandboxResult, cryptoResult, combinedResult] = await Promise.all([
    githubFile('live.json', validSteamLive),
    githubFile('sandbox.json', (value): value is ExtraPortfolio => validExtraPortfolio(value, 'sandbox')),
    githubFile('crypto.json', (value): value is ExtraPortfolio => validExtraPortfolio(value, 'crypto')),
    githubFile('combined-history.json', validCombinedHistory),
  ]);
  const live = liveResult.data as { prices: typeof cs2Prices; history: { snapshots: CsSnapshot[] } } | null;
  const remotePrices = live?.prices ?? null;
  const latestPrices = newer(cs2Prices, remotePrices, p => p.lastSuccessAt);
  const prices = { ...latestPrices, items: Object.fromEntries(Object.entries(latestPrices.items).map(([name, quote]) => [name, newer(quote, (latestPrices === remotePrices ? cs2Prices : remotePrices)?.items[name as keyof typeof cs2Prices.items], q => q.updatedAt)])) as typeof cs2Prices.items };
  const history = { snapshots: mergeSnapshots(cs2History.snapshots, Array.isArray(live?.history?.snapshots) ? live.history.snapshots : []) };
  const validSandbox = sandboxResult.data;
  const validCrypto = cryptoResult.data;
  const localSandbox = sandbox as ExtraPortfolio, localCrypto = crypto as ExtraPortfolio;
  const sb = newerLedger(localSandbox, validSandbox, p => p.historyImport?.importedAt, p => p.fetchedAt);
  const sbQuotes = newer(localSandbox, validSandbox, p => p.fetchedAt);
  const cr = newer(localCrypto, validCrypto, p => p.fetchedAt);
  const sbStatus = newer(localSandbox, validSandbox, p => p.attemptedAt ?? p.fetchedAt);
  const crStatus = newer(localCrypto, validCrypto, p => p.attemptedAt ?? p.fetchedAt);
  const csStatus = newer(cs2Prices, remotePrices, p => p.lastAttemptAt);
  const assets: Asset[] = [...cs2.items, ...cs2.closedItems].map(item => {
    const quote = prices.items[item.name as keyof typeof prices.items];
    return { id: `cs2:${item.name}`, class: 'cs2', name: item.name, category: item.category, quantity: item.quantity, cost: item.costKopecks / 100, averageBuyPrice: item.averageKopecks / 100, realized: item.realizedKopecks / 100, price: quote?.priceKopecks === undefined ? null : quote.priceKopecks / 100, currency: 'RUB', updatedAt: quote?.updatedAt ?? null, icon: quote?.icon, marketUrl: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(item.name)}`, source: 'Steam Community Market', trades: item.trades.map(t => ({ type: t.type, date: t.date, quantity: t.quantity, unitPrice: t.unitKopecks / 100, total: t.totalKopecks / 100, fee: t.feeKopecks / 100, currency: 'RUB' })) };
  });
  const csSnapshots: Snapshot[] = (history.snapshots as CsSnapshot[]).map(normalizeSteamSnapshot);
  return {
    assets: [...assets, ...mergeAssetQuotes(sb.items, (sb === validSandbox ? localSandbox : validSandbox)?.items ?? []), ...mergeAssetQuotes(cr.items, (cr === validCrypto ? localCrypto : validCrypto)?.items ?? [])],
    history: {
      cs2: csSnapshots,
      sandbox: mergeSnapshots(sb.snapshots, (sb === validSandbox ? localSandbox : validSandbox)?.snapshots ?? []),
      crypto: mergeSnapshots(cr.snapshots, (cr === validCrypto ? localCrypto : validCrypto)?.snapshots ?? []),
    },
    combinedHistory: mergeSnapshots(combinedHistory.snapshots as Snapshot[], combinedResult.data?.snapshots ?? []),
    sources: {
      cs2: {
        name: 'Steam Community Market', url: 'https://steamcommunity.com/market/', at: prices.lastSuccessAt,
        attemptedAt: csStatus.lastAttemptAt,
        error: csStatus.freshCount < csStatus.totalCount ? 'Часть котировок не обновлена; сохранены предыдущие цены.' : undefined,
        readAt: liveResult.readAt > combinedResult.readAt ? liveResult.readAt : combinedResult.readAt,
        deliveryError: liveResult.error ?? (combinedResult.error ? `Общая история: ${combinedResult.error}` : undefined),
      },
      sandbox: { name: sb.source, url: sb.sourceUrl, at: sbQuotes.fetchedAt, ledgerAt: sb.historyImport?.importedAt, attemptedAt: sbStatus.attemptedAt, error: sbStatus.error, readAt: sandboxResult.readAt, deliveryError: sandboxResult.error },
      crypto: { name: cr.source, url: cr.sourceUrl, at: cr.fetchedAt, attemptedAt: crStatus.attemptedAt, error: crStatus.error, readAt: cryptoResult.readAt, deliveryError: cryptoResult.error },
    },
    usdRub: cr.usdRub ?? null, fxUpdatedAt: cr.fxUpdatedAt ?? cr.fetchedAt,
    fxSource: cr.fxSource ?? 'Курс оценки DropsTab', sandboxNotes: sb.notes, verifiedAt: sb.verifiedAt ?? null,
    verifiedInventoryUrl: VERIFIED_INVENTORY_URL,
  };
}
