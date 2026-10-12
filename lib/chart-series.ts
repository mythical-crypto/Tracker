import { comparableSnapshots, filterHistory, historyChange } from './calculations.ts';
import type { Snapshot } from './types';

function comparableCosts(first: Snapshot, second: Snapshot): boolean {
  if (first.costCoverageKey || second.costCoverageKey) return !!first.costCoverageKey && first.costCoverageKey === second.costCoverageKey;
  // Legacy full-cost snapshots can still prove continuity with recorded holdings.
  return first.costComplete === true && second.costComplete === true
    && comparableSnapshots({ ...first, complete: true, coverageKey: 'full-cost' }, { ...second, complete: true, coverageKey: 'full-cost' });
}

export function chartSegments(snapshots: Snapshot[], key: 'value' | 'cost' = 'value'): Snapshot[][] {
  const segments: Snapshot[][] = [];
  let previous: Snapshot | undefined;
  for (const snapshot of snapshots) {
    const value = snapshot[key];
    if (value === null || !Number.isFinite(value)) { previous = undefined; continue; }
    const connected = previous && Date.parse(snapshot.at) - Date.parse(previous.at) <= 3 * 86400000
      && (key === 'value' ? comparableSnapshots(previous, snapshot) : comparableCosts(previous, snapshot));
    if (!connected) segments.push([]);
    segments.at(-1)!.push(snapshot);
    previous = snapshot;
  }
  return segments;
}

export function chartBoundaryPoints(snapshots: Snapshot[]): Set<Snapshot> {
  return new Set(chartSegments(snapshots).flatMap(segment => [segment[0], segment.at(-1)!]));
}

export function chartDomain(values: number[]) {
  const valid = values.filter(Number.isFinite);
  const low = valid.length ? Math.min(...valid) : 0, high = valid.length ? Math.max(...valid) : 1;
  const padding = Math.max((high - low) * .15, Math.abs(high) * .003, high === 0 ? 1 : Number.MIN_VALUE);
  return { min: low >= 0 ? Math.max(0, low - padding) : low - padding, max: high + padding };
}

export function sparklineHistory(snapshots: Snapshot[], now = Date.now()) {
  return filterHistory(snapshots, 'year', now);
}

export function sparklineTrend(snapshots: Snapshot[]): 'falling' | 'rising' | '' {
  const change = historyChange(snapshots);
  return change !== null && change < 0 ? 'falling' : change !== null && change > 0 ? 'rising' : '';
}
