'use client';

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ChevronDown, Clock3 } from 'lucide-react';
import { filterHistory, historyChange, periodChange, type PeriodChange } from '@/lib/calculations';
import { chartBoundaryPoints, chartDomain, chartSegments } from '@/lib/chart-series';
import { isSaleMedian, priceMovements, type MovementOrder } from '@/lib/price-movements';
import type { Currency, Snapshot } from '@/lib/types';
import { countLabel, pct, time } from './portfolio-ui';
import './chart.css';

type ChartProps = { snapshots: Snapshot[]; currency: Currency; title: string; unitPrice?: boolean; initialPeriod?: string; compact?: boolean };
const periods = [['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц'], ['year', 'Год'], ['all', 'Всё']] as const;
const horizons = [{ days: 1, label: '24 ч' }, { days: 7, label: '7 д' }, { days: 30, label: '30 д' }] as const;
const symbol = (currency: Currency) => currency === 'RUB' ? '₽' : '$';
const date = (at: string | null | undefined, exact = false) => at && Number.isFinite(Date.parse(at))
  ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', ...(exact ? { hour: '2-digit' as const, minute: '2-digit' as const, second: '2-digit' as const } : {}), timeZone: 'Europe/Astrakhan' }).format(new Date(at))
  : 'Дата неизвестна';
const precision = (value: number, unitPrice = false) => {
  const absolute = Math.abs(value);
  const tinyDigits = absolute > 0 && absolute < .01 ? Math.min(16, Math.ceil(-Math.log10(absolute)) + 3) : 2;
  return unitPrice ? Math.min(16, Math.max(2, 3 - Math.floor(Math.log10(absolute || 1)))) : tinyDigits;
};
const amount = (value: number | null | undefined, currency: Currency, unitPrice = false) => value == null || !Number.isFinite(value) ? '—'
  : new Intl.NumberFormat('ru-RU', { style: 'currency', currency, minimumFractionDigits: unitPrice ? 2 : 0, maximumFractionDigits: unitPrice && currency === 'RUB' ? 2 : precision(value, unitPrice) }).format(value);
const signed = (value: number | null, currency: Currency, unitPrice = false) => value === null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${amount(Math.abs(value), currency, unitPrice)}`;
const tone = (value: number | null) => value === null || value === 0 ? '' : value > 0 ? 'hc-positive' : 'hc-negative';
const statusText = (change: PeriodChange) => change.status === 'stale' ? 'Котировка устарела' : change.status === 'incomparable' ? 'Состав изменился' : 'Недостаточно данных';
const description = (change: PeriodChange) => change.status === 'ready' ? `${date(change.from, true)} → ${date(change.to, true)}`
  : change.status === 'stale' ? 'Для сравнения нужна свежая котировка. Сохранённые значения показаны с фактическими датами.'
    : change.status === 'incomparable' ? 'Изменились остатки или покрытие оценки; изменение цены нельзя выделить.'
      : 'Нужны реальные наблюдения в начале и конце полного периода.';

function PeriodSummary({ snapshots, currency, unitPrice = false }: Pick<ChartProps, 'snapshots' | 'currency' | 'unitPrice'>) {
  const changes = horizons.map(horizon => ({ ...horizon, change: periodChange(snapshots, horizon.days) }));
  return <section className="ps-summary" aria-label={unitPrice ? 'Динамика цены единицы' : 'Динамика рыночной оценки'}>
    <h3>{unitPrice ? 'Динамика цены' : 'Динамика оценки'}</h3>
    <div className="ps-metrics">{changes.map(({ days, label, change }) => <div key={days} className="ps-metric" title={description(change)}>
      <span>{label}</span>
      <strong className={tone(change.absolute)}>{change.status === 'ready' && change.percent !== null ? `${change.percent > 0 ? '+' : ''}${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(change.percent)}%` : '—'}</strong>
      <small>{change.status === 'ready' ? signed(change.absolute, currency, unitPrice) : statusText(change)}</small>
    </div>)}</div>
    <details className="ps-explanation"><summary>Как рассчитана динамика</summary>
      <p>{unitPrice ? 'Сравниваются цены одной единицы; количество в портфеле не влияет на расчёт.' : 'Сравниваются снимки с одинаковыми остатками и покрытием оценки во всём интервале.'} База — последнее наблюдение до начала периода: не старше 1 часа для суток, 2 часов для недели и 24 часов для месяца.</p>
      {changes.map(({ days, label, change }) => <div key={days}><strong>{label}</strong><span>{description(change)}</span></div>)}
    </details>
  </section>;
}

function PriceJournal({ points, currency }: { points: Snapshot[]; currency: Currency }) {
  const [order, setOrder] = useState<MovementOrder>('recent');
  const [limit, setLimit] = useState(3);
  const moves = useMemo(() => priceMovements(points, order), [points, order]);
  return <section className="hc-journal" aria-label="Журнал изменений цены">
    <div className="hc-journal-heading">
      <h3>Изменения цены</h3>
      <select aria-label="Порядок изменений цены" value={order} onChange={event => { setOrder(event.target.value as MovementOrder); setLimit(3); }}>
        <option value="recent">По времени</option><option value="drops">Крупнейшие падения</option><option value="gains">Крупнейший рост</option>
      </select>
    </div>
    {moves.length ? <>
      <p className="hc-journal-hint">За единицу между соседними наблюдениями · время Астрахани</p>
      <ol className="hc-moves">{moves.slice(0, limit).map(move => <li key={move.to.at}>
        <div><strong>{amount(move.from.value, currency, true)} <span aria-label="до">→</span> {amount(move.to.value, currency, true)}</strong>
          <small>{time(move.from.at, true)} → {time(move.to.at, true)}</small></div>
        <div className={tone(move.delta)}><strong>{signed(move.delta, currency, true)}</strong>{move.percent !== null && <small>{pct(move.percent)}</small>}</div>
      </li>)}</ol>
      {moves.length > limit && <button className="hc-journal-more" type="button" onClick={() => setLimit(value => value + 10)}>Показать ещё · осталось {moves.length - limit}</button>}
    </> : <p className="hc-journal-empty">{order === 'drops' ? 'Снижений' : order === 'gains' ? 'Повышений' : 'Изменений'} между сопоставимыми наблюдениями за этот период нет.</p>}
  </section>;
}

export default function HistoryChart({ snapshots, currency, title, unitPrice = false, initialPeriod, compact = false }: ChartProps) {
  const [period, setPeriod] = useState(() => initialPeriod ?? (unitPrice ? filterHistory(snapshots, 'week').length > 1 ? 'week' : 'all' : 'month'));
  const [selected, setSelected] = useState<number | null>(null);
  const [showCost, setShowCost] = useState(false);
  const [basis, setBasis] = useState<'spot' | 'median'>(() => snapshots.length && snapshots.every(isSaleMedian) ? 'median' : 'spot');
  const [tableOpen, setTableOpen] = useState(false);
  const [width, setWidth] = useState(900);
  const plotRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const hasMedian = unitPrice && snapshots.some(isSaleMedian);
  const hasSpot = unitPrice && snapshots.some(point => !isSaleMedian(point));
  const series = useMemo(() => unitPrice ? snapshots.filter(point => isSaleMedian(point) === (basis === 'median')) : snapshots, [snapshots, unitPrice, basis]);
  const data = useMemo(() => filterHistory(series, period), [series, period]);
  const extremes = useMemo(() => {
    if (!unitPrice || !data.length) return null;
    let low = data[0], high = data[0];
    for (const point of data) {
      if (point.value < low.value) low = point;
      if (point.value > high.value) high = point;
    }
    return { low, high };
  }, [unitPrice, data]);
  const boundaryPoints = useMemo(() => chartBoundaryPoints(data), [data]);
  const first = data[0], last = data.at(-1);
  const hasBreak = unitPrice && chartSegments(data).length > 1;
  const change = hasBreak ? null : historyChange(data);
  const hasCost = data.some(snapshot => snapshot.cost !== null && Number.isFinite(snapshot.cost));
  const visibleCost = hasCost && showCost;
  const active = selected !== null && selected < data.length ? selected : data.length - 1;
  const highlighted = data[active];
  const height = width < 510 ? 213 : unitPrice ? 223 : 225;

  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    const update = () => setWidth(Math.max(260, Math.round(node.getBoundingClientRect().width)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [data.length > 0]);

  const values = data.flatMap(snapshot => visibleCost && snapshot.cost !== null && Number.isFinite(snapshot.cost) ? [snapshot.value, snapshot.cost] : [snapshot.value]);
  const { min, max } = chartDomain(values);
  const ticks = [0, 1, 2, 3, 4].map(index => max - index * (max - min) / 4);
  const tickDigits = Math.min(16, Math.max(0, 1 - Math.floor(Math.log10((max - min) / 4))));
  const axisNumber = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: tickDigits }).format(value);
  const axisLabels = ticks.map(value => `${axisNumber(value)} ${symbol(currency)}`);
  const left = Math.min(Math.max(60, Math.max(...axisLabels.map(label => label.length)) * 7 + 12), width * .42);
  const right = width - 12, top = 16, bottom = height - 29;
  const start = first ? Date.parse(first.at) : 0, end = last ? Date.parse(last.at) : 1;
  const x = (snapshot: Snapshot) => data.length === 1 ? (left + right) / 2 : left + (Date.parse(snapshot.at) - start) / Math.max(end - start, 1) * (right - left);
  const y = (value: number) => bottom - (value - min) / (max - min) * (bottom - top);
  const line = (key: 'value' | 'cost') => chartSegments(data, key).map(segment => segment.map((snapshot, i) => `${i ? 'L' : 'M'}${x(snapshot)},${y(snapshot[key]!)}`).join(' ')).join(' ');
  const area = chartSegments(data).filter(segment => segment.length > 1).map(segment => `M${x(segment[0])},${bottom} ${segment.map(snapshot => `L${x(snapshot)},${y(snapshot.value)}`).join(' ')} L${x(segment.at(-1)!)},${bottom} Z`).join(' ');
  const dateTicks = data.length === 1 ? [{ x: x(first), at: first.at }] : [0, .25, .5, .75, 1].filter((_, index) => width >= 600 || index % 2 === 0).map(ratio => ({ x: left + ratio * (right - left), at: new Date(start + ratio * (end - start)).toISOString() }));
  const axisDate = (at: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', ...(end - start > 180 * 86400000 ? { year: '2-digit' as const } : {}), ...(end - start < 86400000 && data.length > 1 ? { hour: '2-digit' as const, minute: '2-digit' as const } : {}), timeZone: 'Europe/Astrakhan' }).format(new Date(at));
  const stale = last && Date.now() - Date.parse(last.at) > 3600000;

  function selectPoint(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const target = start + ((event.clientX - bounds.left) / bounds.width * width - left) / (right - left) * (end - start);
    let closest = 0;
    data.forEach((snapshot, index) => {
      if (Math.abs(Date.parse(snapshot.at) - target) < Math.abs(Date.parse(data[closest].at) - target)) closest = index;
    });
    setSelected(closest);
  }

  const legend = data.length > 0 && <div className="hc-legend">
    <span><i className="hc-value-swatch"/>{unitPrice ? 'Цена единицы' : 'Рыночная стоимость'}</span>
    {hasCost && <button type="button" aria-pressed={showCost} onClick={() => setShowCost(current => !current)}><i className="hc-cost-swatch"/>{unitPrice ? 'Средняя покупка' : 'Показать вложения'}</button>}
  </div>;
  const coverage = data.length > 0 && <p className="hc-coverage">Наблюдения: {date(first.at)}{data.length > 1 && ` — ${date(last!.at)}`}{stale && ' · Последний снимок устарел'}</p>;
  const partial = last && !last.complete && <p className="hc-note">В последнем снимке оценена часть портфеля{last.pricedCount != null && last.totalCount != null ? `: ${last.pricedCount} из ${last.totalCount} позиций` : ''}.</p>;
  const journal = unitPrice && data.length > 0 && <PriceJournal key={`${period}-${basis}`} points={data} currency={currency}/>;
  const supportingDetails = <>
    {extremes && <div className="hc-range" aria-label="Диапазон наблюдаемых цен">{([['Минимум', extremes.low], ['Максимум', extremes.high]] as const).map(([label, point]) => <span key={label}>{label} за период<strong>{amount(point.value, currency, true)}</strong><time dateTime={point.at}>{time(point.at, true)}</time></span>)}</div>}
    {data.length > 0 && <details className="hc-data" onToggle={event => setTableOpen(event.currentTarget.open)}>
      <summary>Значения графика</summary>
      {tableOpen && <div className="hc-table-scroll"><table>
        <caption className="hc-sr-only">{title}, {symbol(currency)}{unitPrice ? ' за единицу' : ''}</caption>
        <thead><tr><th>Дата снимка</th><th>{unitPrice ? 'Цена единицы' : 'Стоимость'}</th>{hasCost && <th>{unitPrice ? 'Средняя покупка' : 'Себестоимость'}</th>}</tr></thead>
        <tbody>{data.map((snapshot, index) => <tr key={`${snapshot.at}-${index}`}>
          <td>{date(snapshot.at, true)}</td><td>{amount(snapshot.value, currency, unitPrice)}{!snapshot.complete && <small>Частичная оценка{snapshot.pricedCount != null && snapshot.totalCount != null ? `: ${snapshot.pricedCount}/${snapshot.totalCount}` : ''}</small>}</td>
          {hasCost && <td>{amount(snapshot.cost, currency, unitPrice)}{snapshot.cost === null ? <small>Нет данных</small> : snapshot.costComplete === false && <small>Себестоимость известна частично</small>}</td>}
        </tr>)}</tbody>
      </table></div>}
    </details>}
  </>;

  return <div className={`hc-chart${unitPrice ? ' hc-unit' : ''}`}>
    <div className="hc-toolbar"><h2>{title}</h2><div className="hc-periods" role="group" aria-label="Период графика">{periods.map(([id, label]) => <button key={id} type="button" aria-pressed={period === id} onClick={() => { setPeriod(id); setSelected(null); }}>{label}</button>)}</div></div>
    {hasMedian && <div className="hc-basis">{hasSpot ? <label>Ряд цен <select value={basis} onChange={event => { setBasis(event.target.value as 'spot' | 'median'); setSelected(null); }}><option value="spot">Котировки</option><option value="median">Медиана продаж Steam</option></select></label> : 'Медиана продаж Steam'}</div>}
    {!compact && <>
      {coverage}
      <div className="hc-headline"><strong>{amount(last?.value, currency, unitPrice)}</strong>{change !== null ? <span className={tone(change)}>{signed(change, currency, unitPrice)}<small> за доступный период</small></span> : data.length > 1 && <span className="hc-muted">{hasBreak ? 'Есть разрыв в наблюдениях' : 'Состав или покрытие менялись'}</span>}</div>
      {legend}
    </>}
    {data.length ? <>
      <div ref={plotRef} className="hc-plot" style={{ height }} role="group" aria-label={title} aria-describedby={`${uid}-keyboard`} tabIndex={0} onKeyDown={event => {
        if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          setSelected(current => event.key === 'Home' ? 0 : event.key === 'End' ? data.length - 1 : Math.min(data.length - 1, Math.max(0, (current ?? data.length - 1) + (event.key === 'ArrowRight' ? 1 : -1))));
        }
      }}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${data.length} реальных снимков, ${symbol(currency)}${unitPrice ? ' за единицу' : ''}`} onPointerLeave={event => { if (event.pointerType !== 'touch') setSelected(null); }} onPointerMove={selectPoint} onPointerDown={selectPoint}>
          {ticks.map((value, index) => <g key={index}><line x1={left} x2={right} y1={y(value)} y2={y(value)} className="hc-grid"/><text x={left - 10} y={y(value) + 4} textAnchor="end" className="hc-axis">{axisLabels[index]}</text></g>)}
          {dateTicks.map((tick, index) => <g key={index}><line x1={tick.x} x2={tick.x} y1={top} y2={bottom} className="hc-grid hc-time-grid"/><text x={tick.x} y={height - 8} textAnchor={data.length === 1 ? 'middle' : index === 0 ? 'start' : index === dateTicks.length - 1 ? 'end' : 'middle'} className="hc-axis">{axisDate(tick.at)}</text></g>)}
          <line x1={left} x2={right} y1={bottom} y2={bottom} className="hc-baseline"/>
          <defs><linearGradient id={`${uid}-fill`} x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".20"/><stop offset="100%" stopColor="var(--accent)" stopOpacity=".015"/></linearGradient></defs>
          {data.length > 1 && <><path d={area} fill={`url(#${uid}-fill)`} className="hc-area"/><path d={line('value')} className="hc-value-line"/>{visibleCost && <path d={line('cost')} className="hc-cost-line"/>}</>}
          {highlighted && selected !== null && <line x1={x(highlighted)} x2={x(highlighted)} y1={top} y2={bottom} className="hc-guide"/>}
          {data.map((snapshot, index) => <g key={`${snapshot.at}-${index}`}>
            {visibleCost && snapshot.cost !== null && Number.isFinite(snapshot.cost) && <circle cx={x(snapshot)} cy={y(snapshot.cost)} r={index === active ? 4 : 2.5} className="hc-cost-point"><title>{`${date(snapshot.at, true)} · ${unitPrice ? 'Средняя покупка' : 'Себестоимость'}: ${amount(snapshot.cost, currency, unitPrice)}`}</title></circle>}
            {(index === active || boundaryPoints.has(snapshot)) && <circle cx={x(snapshot)} cy={y(snapshot.value)} r={index === active || data.length === 1 ? 5 : 2.3} className={`hc-value-point${index === active ? ' hc-active-point' : ''}`}><title>{`${date(snapshot.at, true)} · ${amount(snapshot.value, currency, unitPrice)}`}</title></circle>}
          </g>)}
        </svg>
        <div className={`hc-readout${selected === null ? ' hc-readout-idle' : ''}`} aria-live="polite"><span>{date(highlighted?.at, true)}</span><strong>{amount(highlighted?.value, currency, unitPrice)}</strong>{visibleCost && highlighted?.cost != null && <small>{unitPrice ? 'Средняя покупка' : 'Себестоимость'}: {amount(highlighted.cost, currency, unitPrice)}</small>}</div>
      </div>
      <p id={`${uid}-keyboard`} className="hc-sr-only">Выберите снимок стрелками влево и вправо. Home — первый снимок, End — последний. Все значения доступны в таблице ниже.</p>
      {(!compact || data.length === 1) && <div className="hc-caption">{data.length === 1 ? 'Пока доступен один снимок' : countLabel(data.length, ['реальный снимок', 'реальных снимка', 'реальных снимков'])}</div>}
      {!compact && partial}
      {visibleCost && last!.costComplete === false && <p className="hc-note">Себестоимость известна частично{last!.knownCostCount != null && last!.totalCount != null ? `: ${last!.knownCostCount} из ${last!.totalCount} позиций` : ''}.</p>}
      {!unitPrice && data.length > 1 && change === null && <p className="hc-note">Линия прерывается при смене состава или покрытия оценки.</p>}
    </> : <div className="hc-empty"><Clock3 size={25} aria-hidden="true"/><strong>За этот период нет снимков</strong><p>{snapshots.length ? 'Откройте «Всё», чтобы увидеть доступную историю.' : 'История появится после записи первой котировки.'}</p></div>}
    {compact ? (unitPrice || data.length > 0) && <details className="hc-more">
      <summary>{unitPrice ? 'Изменения и данные графика' : 'Данные графика'} <ChevronDown size={15} aria-hidden="true" /></summary>
      <div className="hc-more-body">{coverage}{partial}{legend}{journal}<PeriodSummary snapshots={series} currency={currency} unitPrice={unitPrice}/>{supportingDetails}</div>
    </details> : <>{supportingDetails}{journal}{unitPrice && <PeriodSummary snapshots={series} currency={currency} unitPrice/>}</>}
  </div>;
}
