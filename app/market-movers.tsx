'use client';

import { useId, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight } from 'lucide-react';
import { marketMovers, type MarketPeriod } from '@/lib/market-movers';
import type { Asset, Snapshot } from '@/lib/types';
import { AssetImage, color, pct, price } from './portfolio-ui';
import './market.css';

const periods = [
  { value: 'latest', label: 'Последний замер' },
  { value: 1, label: '24 ч' },
  { value: 7, label: '7 д' },
  { value: 30, label: '30 д' },
] as const;
const directions = [
  { id: 'up', label: 'Рост', empty: 'Рост не зафиксирован', Icon: ArrowUpRight },
  { id: 'down', label: 'Падение', empty: 'Падение не зафиксировано', Icon: ArrowDownRight },
] as const;
const collapsed = { up: false, down: false };
const PREVIEW_LIMIT = 2;

export default function MarketMovers({ assets, histories, onSelect }: {
  assets: Asset[];
  histories: Map<string, Snapshot[]>;
  onSelect: (id: string, period: MarketPeriod) => void;
}) {
  const id = useId();
  const [period, setPeriod] = useState<MarketPeriod>('latest');
  const [expanded, setExpanded] = useState(collapsed);
  const moves = useMemo(() => marketMovers(assets, histories, period), [assets, histories, period]);
  const groups = {
    up: moves.filter(move => move.absolute > 0).reverse(),
    down: moves.filter(move => move.absolute < 0),
  };
  const hasMoves = groups.up.length > 0 || groups.down.length > 0;

  function selectPeriod(value: MarketPeriod) {
    if (period === value) return;
    setPeriod(value);
    setExpanded(collapsed);
  }

  return <section className="panel market-panel" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Движения рынка</h2>
    <div className="market-periods" role="group" aria-label="Период сравнения цен">
      {periods.map(({ value, label }) => <button key={value} type="button" aria-pressed={period === value} onClick={() => selectPeriod(value)}>{label}</button>)}
    </div>

    {hasMoves ? <div className="movement-groups">
      {directions.map(({ id: direction, label, empty, Icon }) => {
        const rows = groups[direction];
        const isExpanded = expanded[direction];
        const listId = `${id}-${direction}`;

        return <section className="movement-group" key={direction} data-direction={direction} aria-labelledby={`${listId}-title`}>
          <div className="movement-heading">
            <h3 id={`${listId}-title`}><Icon size={17} aria-hidden="true"/>{label}</h3>
            {rows.length > PREVIEW_LIMIT && <button type="button" aria-expanded={isExpanded} aria-controls={listId} aria-label={isExpanded ? `Свернуть список: ${label}` : `Все ${rows.length} · ${label}`} onClick={() => setExpanded(current => ({ ...current, [direction]: !current[direction] }))}>
              {isExpanded ? 'Свернуть' : `Все ${rows.length}`}<ChevronDown size={14} aria-hidden="true"/>
            </button>}
          </div>
          {rows.length > 0 ? <ul className="movement-list" id={listId}>
            {rows.slice(0, isExpanded ? rows.length : PREVIEW_LIMIT).map(({ asset, after, absolute, percent }) => <li key={asset.id}>
              <button className="movement-row" type="button" onClick={() => onSelect(asset.id, period)} title={asset.name}>
                <span className="sr-only">Открыть динамику </span>
                <span aria-hidden="true"><AssetImage asset={asset}/></span>
                <span className="movement-asset"><strong>{asset.name}</strong><small>{price(after.value, asset.currency)}</small></span>
                <strong className={`movement-delta ${color(absolute)}`}>{pct(percent)}</strong>
                <ChevronRight className="movement-chevron" size={15} aria-hidden="true"/>
              </button>
            </li>)}
          </ul> : <p className="movement-empty-direction">{empty}</p>}
        </section>;
      })}
    </div> : <p className="movement-empty" role="status">{moves.length ? 'Сопоставимые цены не изменились.' : assets.length ? 'Недостаточно сопоставимых котировок за этот период.' : 'В портфеле пока нет активов.'}</p>}

    {assets.length > 0 && <details className="movement-coverage">
      <summary>Сопоставимы {moves.length} из {assets.length} активов<ChevronDown size={15} aria-hidden="true"/></summary>
      <p>{period === 'latest' ? 'Сравниваются две последовательные котировки. Последняя котировка и интервал между замерами ограничены тремя днями.' : 'Сравнение с котировкой в начале периода. Пропуски, устаревшие и несопоставимые цены исключены.'}</p>
    </details>}
  </section>;
}
