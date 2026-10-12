import { filterHistory } from './calculations.ts';
import type { Asset, Snapshot } from './types';

// A market comparison of TODAY'S holdings, explicitly separate from portfolio history.
// Shared times are preserved; asynchronous quotes also get a daily observation.
// Every value uses a real observation for every asset; gaps aren't filled.
export function currentBasketHistory(assets: Asset[], now = Date.now()): Snapshot[] {
  const active = assets.filter(a => a.quantity > 0);
  if (!active.length || new Set(active.map(a => a.currency)).size !== 1) return [];
  const histories = active.map(asset => filterHistory(asset.priceHistory ?? [], 'year', now));
  const times = histories.map(history => new Map(history.map(snapshot => [Date.parse(snapshot.at), snapshot])));
  const days = histories.map(history => new Map(history.map(snapshot => [new Date(snapshot.at).toISOString().slice(0, 10), snapshot])));
  const quantityKey = active.map(a => `${a.id}:${a.quantity}`).sort().join('|');
  const sharedObservations = [
    ...[...times[0].keys()].map(at => times.map(map => map.get(at))),
    ...[...days[0].keys()].map(day => days.map(map => map.get(day))),
  ];
  const snapshots = sharedObservations.flatMap(observations => {
    if (observations.some(s => !s)) return [];
    const known = observations as Snapshot[];
    const coverageKey = known.every(s => s.coverageKey) ? known.map((s, i) => `${active[i].id}:${s.coverageKey}`).sort().join('|') : undefined;
    const quoteDates = Object.fromEntries(known.map((s, i) => [active[i].id, s.at]));
    return [{ at: new Date(Math.max(...known.map(s => Date.parse(s.at)))).toISOString(), value: known.reduce((sum, s, i) => sum + s.value * active[i].quantity, 0), cost: null, complete: true, pricedCount: active.length, totalCount: active.length, coverageKey, quantityKey, quoteDates, source: 'Цены источника × текущие остатки' } satisfies Snapshot];
  });
  return [...new Map(snapshots.map(snapshot => [snapshot.at, snapshot])).values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
