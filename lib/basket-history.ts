import { filterHistory } from './calculations.ts';
import type { Asset, Snapshot } from './types';

// A market comparison of TODAY'S holdings, explicitly separate from portfolio history.
// Only days with a real observation for every asset are used; gaps aren't filled.
export function currentBasketHistory(assets: Asset[], now = Date.now()): Snapshot[] {
  const active = assets.filter(a => a.quantity > 0);
  if (!active.length || new Set(active.map(a => a.currency)).size !== 1) return [];
  const days = active.map(asset => new Map(filterHistory(asset.priceHistory ?? [], 'year', now).map(snapshot => [snapshot.at.slice(0, 10), snapshot])));
  const quantityKey = active.map(a => `${a.id}:${a.quantity}`).sort().join('|');
  const coverageKey = active.map(a => a.id).sort().join('|');
  return [...days[0].keys()].sort().flatMap(day => {
    const observations = days.map(map => map.get(day));
    if (observations.some(s => !s)) return [];
    const known = observations as Snapshot[];
    return [{ at: known.map(s => s.at).sort().at(-1)!, value: known.reduce((sum, s, i) => sum + s.value * active[i].quantity, 0), cost: null, complete: true, pricedCount: active.length, totalCount: active.length, coverageKey, quantityKey, source: 'Цены источника × текущие остатки' } satisfies Snapshot];
  });
}
