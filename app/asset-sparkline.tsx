'use client';

import { chartDomain, chartSegments, sparklineHistory } from '@/lib/chart-series';
import type { Snapshot } from '@/lib/types';

export default function AssetSparkline({ snapshots, name }: { snapshots: Snapshot[]; name: string }) {
  const data = sparklineHistory(snapshots);
  if (!data.length) return <span className="sparkline-empty">История недоступна</span>;
  const { min, max } = chartDomain(data.map(s => s.value));
  const start = Date.parse(data[0].at), end = Date.parse(data.at(-1)!.at);
  const x = (s: Snapshot) => data.length === 1 ? 70 : 4 + (Date.parse(s.at) - start) / Math.max(1, end - start) * 132;
  const y = (s: Snapshot) => 42 - (s.value - min) / (max - min) * 36;
  const change = data.at(-1)!.value - data[0].value;
  return <span className={`asset-sparkline ${change < 0 ? 'falling' : change > 0 ? 'rising' : ''}`}>
    <svg viewBox="0 0 140 48" role="img" aria-label={`${name}: история цены, ${data.length} наблюдений`}>
      <title>{`${data.length} реальных наблюдений · ${data[0].at.slice(0, 10)} — ${data.at(-1)!.at.slice(0, 10)}`}</title>
      {chartSegments(data).map((segment, i) => segment.length > 1 ? <path key={i} d={segment.map((s, j) => `${j ? 'L' : 'M'}${x(s)},${y(s)}`).join(' ')}/> : <circle key={i} cx={x(segment[0])} cy={y(segment[0])} r="2.5"/>)}
      <circle cx={x(data.at(-1)!)} cy={y(data.at(-1)!)} r="3"/>
    </svg>
    <small>{data.length === 1 ? 'Одно наблюдение' : `${Math.max(1, Math.ceil((end - start) / 86400000))} д. истории`}</small>
  </span>;
}
