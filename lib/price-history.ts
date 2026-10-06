import { newer } from './calculations.ts';
import type { Asset, Snapshot } from './types';

export type PriceArchive = { currency?: string; source?: string; basis?: string; error?: string; points?: { at: string; value: number }[] };

export function attachPriceHistory(asset: Asset, archive?: PriceArchive, now = Date.now()): Asset {
  if (!archive || archive.currency !== asset.currency || archive.source !== asset.source) return { ...asset, priceHistory: [], priceHistoryStatus: archive?.error };
  const priceHistory: Snapshot[] = (archive.points ?? []).filter(p => Number.isFinite(p.value) && p.value >= 0 && Number.isFinite(Date.parse(p.at)) && Date.parse(p.at) <= now).sort((a,b) => Date.parse(a.at) - Date.parse(b.at)).map(p => ({ ...p, cost: null, complete: true, coverageKey: `${asset.id}${archive.basis === 'sale-median' ? ':sale-median' : ''}`, quantityKey: `${asset.id}:1`, source: archive.source, pricedCount: 1, totalCount: 1 }));
  const latest = priceHistory.at(-1);
  // A historical median sale price is not an active Steam listing quote.
  const quote = latest && archive.basis === 'spot' ? newer(asset, { ...asset, price: latest.value, updatedAt: latest.at }, a => a.updatedAt) : asset;
  return { ...quote, priceHistory, priceHistoryStatus: archive.error };
}
