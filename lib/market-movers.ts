import { comparableSnapshots, periodChange } from './calculations.ts';
import type { Asset, Snapshot } from './types';

export type MarketPeriod = 'latest' | 1 | 7 | 30;
export type MarketMove = { asset: Asset; before: Snapshot; after: Snapshot; absolute: number; percent: number };

export function marketMovers(assets: Asset[], histories: Map<string, Snapshot[]>, period: MarketPeriod, now = Date.now()) {
  const moves: MarketMove[] = [];
  for (const asset of assets) {
    const points = (histories.get(asset.id) ?? []).filter(point => point.coverageKey === asset.id);
    const after = points.at(-1);
    // A sale median or an old archive point is never the current listing price.
    if (!after || after.coverageKey !== asset.id || after.at !== asset.updatedAt || after.value !== asset.price) continue;
    let before: Snapshot | undefined;
    if (period === 'latest') {
      before = points.at(-2);
      const end = Date.parse(after.at);
      if (!before || end > now || now - end > 3 * 86_400_000 || end - Date.parse(before.at) > 3 * 86_400_000 || !comparableSnapshots(before, after)) continue;
    } else {
      const change = periodChange(points, period, now);
      if (change.status !== 'ready') continue;
      before = points.find(point => point.at === change.from);
    }
    if (!before || before.value <= 0) continue;
    const absolute = after.value - before.value;
    moves.push({ asset, before, after, absolute, percent: absolute / before.value * 100 });
  }
  return moves.sort((a, b) => a.percent - b.percent || a.asset.name.localeCompare(b.asset.name, 'ru'));
}
