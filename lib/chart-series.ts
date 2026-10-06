import { comparableSnapshots, filterHistory } from './calculations.ts';
import type { Snapshot } from './types';

export function chartSegments(snapshots: Snapshot[], key: 'value' | 'cost' = 'value'): Snapshot[][] {
  const segments: Snapshot[][] = [];
  let previous: Snapshot | undefined;
  for (const snapshot of snapshots) {
    const value = snapshot[key];
    if (value === null || !Number.isFinite(value)) { previous = undefined; continue; }
    const connected = previous && Date.parse(snapshot.at) - Date.parse(previous.at) <= 3 * 86400000
      && (key === 'value' ? comparableSnapshots(previous, snapshot) : previous.costCoverageKey === snapshot.costCoverageKey);
    if (!connected) segments.push([]);
    segments.at(-1)!.push(snapshot);
    previous = snapshot;
  }
  return segments;
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
