'use client';

import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from 'lucide-react';
import { marketMovers, type MarketPeriod } from '@/lib/market-movers';
import type { Asset, Snapshot } from '@/lib/types';
import { AssetImage, classNames, color, pct, price, time } from './portfolio-ui';
import './market.css';

const bands = [
  { id: 'down', label: 'Снижение', Icon: ArrowDownRight },
  { id: 'up', label: 'Рост', Icon: ArrowUpRight },
  { id: 'flat', label: 'Без изменений', Icon: Minus },
] as const;
type Band = typeof bands[number]['id'];

export default function MarketMovers({ assets, histories, onSelect }: {
  assets: Asset[]; histories: Map<string, Snapshot[]>; onSelect: (id: string, period: MarketPeriod) => void;
}) {
  const [period, setPeriod] = useState<MarketPeriod>('latest');
  const [band, setBand] = useState<Band>('down');
  const [expanded, setExpanded] = useState(false);
  const moves = useMemo(() => marketMovers(assets, histories, period), [assets, histories, period]);
  const groups = {
    down: moves.filter(move => move.absolute < 0),
    up: moves.filter(move => move.absolute > 0).reverse(),
    flat: moves.filter(move => move.absolute === 0),
  };
  const rows = groups[band];
  const shown = expanded ? rows : rows.slice(0, 4);
  return <section className="panel market-panel" aria-labelledby="market-title">
    <header className="market-head">
      <div><h2 id="market-title">Движение цен</h2><p>Изменение цены за одну единицу</p></div>
      <div className="market-periods" role="group" aria-label="Период сравнения цен">
        {(['latest', 1, 7, 30] as const).map(value => <button key={value} aria-pressed={period === value} onClick={() => { setPeriod(value); setExpanded(false); }}>
          {value === 'latest' ? 'Последний замер' : value === 1 ? '24 ч' : value + ' д'}
        </button>)}
      </div>
    </header>
    <div className="market-subhead">
      <div className="movement-tabs" role="group" aria-label="Направление изменения">
        {bands.map(({ id, label, Icon }) => <button key={id} data-band={id} aria-pressed={band === id} onClick={() => { setBand(id); setExpanded(false); }}>
          <Icon size={15} aria-hidden="true"/>{label}<b>{groups[id].length}</b>
        </button>)}
      </div>
      <span>Сравнимы {moves.length} из {assets.length}</span>
    </div>
    {shown.length ? <div className="movement-list">
      <div className="movement-labels" aria-hidden="true"><span>Актив</span><span>Было</span><span>Стало</span><span>Изменение</span></div>
      {shown.map(({asset, before, after, absolute, percent}) => <button className="movement-row" key={asset.id} onClick={() => onSelect(asset.id, period)} aria-label={'Открыть динамику ' + asset.name}>
        <span className="movement-asset"><AssetImage asset={asset}/><span><strong>{asset.name}</strong><small>{classNames[asset.class]} · {asset.category}</small></span></span>
        <span className="movement-quote"><b>{price(before.value, asset.currency)}</b><small>{time(before.at)}</small></span>
        <span className="movement-quote"><b>{price(after.value, asset.currency)}</b><small>{time(after.at)}</small></span>
        <span className={'movement-delta ' + color(absolute)}><strong>{pct(percent)}</strong><small>{absolute > 0 ? '+' : absolute < 0 ? '−' : ''}{price(Math.abs(absolute), asset.currency)}</small></span>
        <ChevronRight className="movement-chevron" size={15} aria-hidden="true"/>
      </button>)}
    </div> : <p className="movement-empty">{moves.length ? 'Среди сопоставимых позиций таких изменений нет.' : 'Недостаточно сопоставимых котировок за этот период.'}</p>}
    <footer className="movement-foot"><span>{period === 'latest' ? 'Два последовательных наблюдения. Последнее — за три дня, интервал — до трёх дней.' : 'Сравнение с наблюдением у начала периода. Пропуски и устаревшие цены исключены.'}</span>
      {rows.length > 4 && <button onClick={() => setExpanded(!expanded)}>{expanded ? 'Свернуть' : 'Показать все (' + rows.length + ')'}</button>}
    </footer>
  </section>;
}
