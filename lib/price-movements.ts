import { chartSegments } from './chart-series.ts';
import type { Snapshot } from './types';

export type MovementOrder = 'recent' | 'drops' | 'gains';

export function isSaleMedian(point: Snapshot) {
  return point.coverageKey?.endsWith(':sale-median') === true;
}

export function priceMovements(points: Snapshot[], order: MovementOrder) {
  const moves = chartSegments(points).flatMap(segment => segment.slice(1).flatMap((to, index) => {
    const from = segment[index];
    const delta = to.value - from.value;
    if (!delta || Date.parse(to.at) <= Date.parse(from.at)) return [];
    if ((order === 'drops' && delta > 0) || (order === 'gains' && delta < 0)) return [];
    return [{ from, to, delta, percent: from.value > 0 ? delta / from.value * 100 : null }];
  }));
  // The input is the time-ordered series displayed on the chart. Prefer the
  // latest occurrence when several moves have the same magnitude.
  moves.reverse();
  if (order !== 'recent') moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return moves;
}
