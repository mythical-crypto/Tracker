'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronRight, LayoutGrid, List, Pin, Search } from 'lucide-react';
import { compareAssets, type AssetSort, type SortDirection } from '@/lib/asset-sort';
import { convert, periodChange, type PeriodChange } from '@/lib/calculations';
import { newestTradeFirst, tradeDate, tradeKind, tradeLabel, tradeSource } from '@/lib/trades';
import type { Asset, AssetClass, Currency, Snapshot, Trade } from '@/lib/types';
import { AssetImage, classNames, color, countLabel, feeText, money, number, pct, price, time, type AssetOptions } from './portfolio-ui';

const portfolioIds = ['cs2', 'sandbox', 'crypto'] as const;
const pricePeriods = [1, 7, 30] as const;
const sortOptions: [AssetSort, string][] = [
  ['value', 'Стоимость позиции'], ['price', 'Цена за единицу'],
  ['change0', 'Цена за 24 ч'], ['change1', 'Цена за 7 д'], ['change2', 'Цена за 30 д'],
  ['pnl', 'Результат'], ['roi', 'Доходность'], ['quantity', 'Количество'],
  ['cost', 'Вложенная сумма'], ['average', 'Средняя покупка'], ['name', 'Название'],
];

type AssetListProps = {
  assets: Asset[];
  histories: Map<string, Snapshot[]>;
  options: Record<string, AssetOptions>;
  section: 'overview' | AssetClass;
  usdRub: number | null;
  currency: Currency;
  view: AssetView;
  onViewChange: (view: AssetView) => void;
  onSelect: (id: string) => void;
};

export type AssetView = 'table' | 'grid';

function SearchField({ query, onChange, label }: { query: string; onChange: (value: string) => void; label: string }) {
  return <label className="search-box">
    <Search size={18} aria-hidden="true" />
    <input aria-label={label} placeholder={label} value={query} onChange={event => onChange(event.target.value)} />
  </label>;
}

function PortfolioFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <select aria-label="Портфель" value={value} onChange={event => onChange(event.target.value)}>
    <option value="all">Все портфели</option>
    {portfolioIds.map(id => <option key={id} value={id}>{classNames[id]}</option>)}
  </select>;
}

function ChangeLabel({ change }: { change: PeriodChange }) {
  if (change.status === 'ready') {
    return <span className={color(change.absolute)} title={`${time(change.from, true)} → ${time(change.to, true)}`}>
      {pct(change.percent)}
    </span>;
  }
  const reason = change.status === 'stale' ? 'Котировка устарела' : change.status === 'incomparable' ? 'Данные несопоставимы' : 'Недостаточно наблюдений';
  return <span className="value-unknown" title={reason}>—<span className="sr-only">{reason}</span></span>;
}

export function AssetList({ assets, histories, options, section, usdRub, currency, view, onViewChange, onSelect }: AssetListProps) {
  const [query, setQuery] = useState('');
  const [portfolio, setPortfolio] = useState('all');
  const [category, setCategory] = useState('all');
  const [pinned, setPinned] = useState(false);
  const [sort, setSort] = useState<AssetSort>('value');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [limit, setLimit] = useState(16);
  const native = currency === 'USD';
  const categories = [...new Set(assets.map(asset => asset.category))];
  const term = query.trim().toLocaleLowerCase('ru-RU');
  const changes = useMemo(() => new Map(assets.map(asset => [
    asset.id, pricePeriods.map(days => periodChange(histories.get(asset.id) ?? [], days)),
  ])), [assets, histories]);
  const sortChanges = useMemo(() => new Map([...changes].map(([id, values]) => [
    id, values.map(change => change.status === 'ready' ? change.percent : null),
  ])), [changes]);

  const filtered = assets.filter(asset =>
    (!pinned || options[asset.id]?.pinned) &&
    (portfolio === 'all' || asset.class === portfolio) &&
    (category === 'all' || asset.category === category) &&
    `${asset.name} ${asset.symbol ?? ''}`.toLocaleLowerCase('ru-RU').includes(term),
  ).sort((a, b) => Number(Boolean(options[b.id]?.pinned)) - Number(Boolean(options[a.id]?.pinned)) ||
    compareAssets(a, b, sort, direction, usdRub, native, sortChanges));

  const visible = filtered.slice(0, limit);
  const positionPrice = (asset: Asset) => {
    const value = asset.price === null ? null : asset.price * asset.quantity;
    return money(native ? value : convert(value, asset.currency, usdRub), currency, 2);
  };
  const subtitle = (asset: Asset) => asset.symbol || (section === 'overview' ? classNames[asset.class] : asset.category);
  const changeSort = (key: AssetSort) => {
    setSort(key);
    setDirection(key === sort ? direction === 'desc' ? 'asc' : 'desc' : key === 'name' ? 'asc' : 'desc');
    setLimit(16);
  };
  const sortHeading = (key: AssetSort, label: string) => <th scope="col" aria-sort={sort === key ? direction === 'asc' ? 'ascending' : 'descending' : undefined}>
    <button className="column-sort" onClick={() => changeSort(key)}>
      {label}{sort === key && (direction === 'asc' ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />)}
    </button>
  </th>;

  return <section className="panel list-panel" aria-labelledby="asset-list-title">
    <header className="list-heading">
      <div><h2 id="asset-list-title">Активы портфеля</h2><p>{countLabel(assets.length, ['позиция', 'позиции', 'позиций'])}</p></div>
      <button type="button" className="quiet-button" aria-pressed={pinned} onClick={() => { setPinned(!pinned); setLimit(16); }}>
        <Pin size={16} aria-hidden="true" />Закреплённые
      </button>
    </header>
    <div className="asset-toolbar">
      <SearchField label="Поиск активов" query={query} onChange={value => { setQuery(value); setLimit(16); }} />
      {section === 'overview'
        ? <PortfolioFilter value={portfolio} onChange={value => { setPortfolio(value); setLimit(16); }} />
        : categories.length > 1 && <select aria-label="Категория активов" value={category} onChange={event => { setCategory(event.target.value); setLimit(16); }}>
          <option value="all">Все категории</option>
          {categories.map(value => <option key={value} value={value}>{value}</option>)}
        </select>}
      <select aria-label="Сортировка активов" value={sort} onChange={event => changeSort(event.target.value as AssetSort)}>
        {sortOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <button className="quiet-button sort-direction" type="button" aria-label={direction === 'desc' ? 'Сортировать по возрастанию' : 'Сортировать по убыванию'} onClick={() => changeSort(sort)}>
        {direction === 'desc' ? <ArrowDown size={18} aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
      </button>
      <div className="view-switch" role="group" aria-label="Вид списка">
        <button type="button" aria-label="Табличный вид" aria-pressed={view === 'table'} onClick={() => onViewChange('table')}><List size={18} /></button>
        <button type="button" aria-label="Плиточный вид" aria-pressed={view === 'grid'} onClick={() => onViewChange('grid')}><LayoutGrid size={17} /></button>
      </div>
    </div>
    {!visible.length ? <div className="empty-list">
      <Search size={24} aria-hidden="true" />
      <strong>{pinned ? 'Закреплённых активов по этим условиям нет' : 'Активы не найдены'}</strong>
      <button className="quiet-button" type="button" onClick={() => { setQuery(''); setCategory('all'); setPortfolio('all'); setPinned(false); }}>Сбросить фильтры</button>
    </div> : view === 'table' ? <div className="table-scroll" tabIndex={0} aria-label="Таблица активов">
      <table className="asset-table">
        <thead><tr>{sortHeading('name', 'Актив')}{sortHeading('price', 'Цена за единицу')}{sortHeading('change1', 'За 7 д')}{sortHeading('value', 'Стоимость позиции')}</tr></thead>
        <tbody>{visible.map(asset => <tr key={asset.id}>
          <td><button className="asset-name" type="button" onClick={() => onSelect(asset.id)}>
            <AssetImage asset={asset} /><span><strong>{asset.name}{options[asset.id]?.pinned && <Pin size={13} aria-label="Закреплено" />}</strong><small>{subtitle(asset)}</small></span>
          </button></td>
          <td>{price(asset.price, asset.currency)}</td>
          <td><ChangeLabel change={changes.get(asset.id)![1]} /></td>
          <td className="position-amount">{positionPrice(asset)}</td>
        </tr>)}</tbody>
      </table>
    </div> : <div className="asset-cards">
      {visible.map(asset => <button className="asset-card" type="button" key={asset.id} onClick={() => onSelect(asset.id)}>
        <span className="asset-card-heading">
          <AssetImage asset={asset} /><span><strong>{asset.name}</strong><small>{subtitle(asset)}</small></span>
          {options[asset.id]?.pinned && <Pin size={14} aria-label="Закреплено" />}
          <ArrowUpRight size={17} aria-hidden="true" />
        </span>
        <span className="asset-card-price"><strong>{price(asset.price, asset.currency)}</strong><span><ChangeLabel change={changes.get(asset.id)![1]} /> <small>за 7 д</small></span></span>
        <span className="asset-card-value"><span>Стоимость позиции</span><strong>{positionPrice(asset)}</strong></span>
      </button>)}
    </div>}
    {filtered.length > limit && <div className="list-footer">
      <span>{limit} из {filtered.length}</span>
      <button type="button" className="quiet-button" onClick={() => setLimit(value => value + 24)}>Показать ещё {Math.min(24, filtered.length - limit)}<ChevronRight size={16} aria-hidden="true" /></button>
    </div>}
  </section>;
}

const monthFormatter = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', timeZone: 'Europe/Astrakhan' });
const monthLabel = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'Europe/Astrakhan' });
const tradeMonth = (trade: Trade) => trade.date ? monthFormatter.format(new Date(trade.date)) : 'unknown';

export function TradeList({ assets, overview, onSelect }: { assets: Asset[]; overview: boolean; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [portfolio, setPortfolio] = useState('all');
  const [type, setType] = useState('all');
  const [month, setMonth] = useState('all');
  const transactions = useMemo(() => assets.flatMap(asset => asset.trades.map((trade, index) => ({ ...trade, asset, index }))).sort(newestTradeFirst), [assets]);
  const months = [...new Set(transactions.map(tradeMonth).filter(value => value !== 'unknown'))].sort().reverse();
  const types = [...new Set(transactions.map(tradeKind))].filter(value => value !== 'buy' && value !== 'sell');
  const term = query.trim().toLocaleLowerCase('ru-RU');
  const visible = transactions.filter(trade =>
    (portfolio === 'all' || trade.asset.class === portfolio) &&
    (type === 'all' || tradeKind(trade) === type) &&
    (month === 'all' || tradeMonth(trade) === month) &&
    `${trade.asset.name} ${trade.asset.symbol ?? ''}`.toLocaleLowerCase('ru-RU').includes(term),
  );

  return <section className="panel list-panel" aria-labelledby="trade-list-title">
    <header className="list-heading"><div>
      <h2 id="trade-list-title">История операций</h2>
      <p>{countLabel(transactions.length, ['операция', 'операции', 'операций'])}{assets.some(asset => asset.historyIncomplete) && ' · История s&box частичная'}</p>
    </div></header>
    <div className="asset-toolbar">
      <SearchField label="Поиск по активу" query={query} onChange={setQuery} />
      {overview && <PortfolioFilter value={portfolio} onChange={setPortfolio} />}
      <select aria-label="Тип операции" value={type} onChange={event => setType(event.target.value)}>
        <option value="all">Все операции</option><option value="buy">Покупки</option><option value="sell">Продажи</option>
        {types.map(value => <option key={value} value={value}>{value === 'airdrop' ? 'Airdrop' : value}</option>)}
      </select>
      <select aria-label="Период операций" value={month} onChange={event => setMonth(event.target.value)}>
        <option value="all">Все даты</option>
        {months.map(value => <option key={value} value={value}>{monthLabel.format(new Date(`${value}-15T12:00:00Z`))}</option>)}
        {transactions.some(trade => !trade.date) && <option value="unknown">Дата не определена</option>}
      </select>
    </div>
    {visible.length ? <div className="table-scroll" tabIndex={0} aria-label="Таблица операций">
      <table className="trades-table">
        <thead><tr><th>Актив / операция</th><th aria-sort="descending">Дата</th><th>Количество</th><th>Цена за единицу</th><th>Сумма</th><th>Комиссия</th></tr></thead>
        <tbody>{visible.map(trade => <tr key={`${trade.asset.id}-${trade.index}`}>
          <td><button className="trade-name" type="button" onClick={() => onSelect(trade.asset.id)}>
            <AssetImage asset={trade.asset} />
            <span><strong>{trade.asset.name}</strong><small><span className={`trade-badge ${trade.type}`}>{tradeLabel(trade)}</span>{overview && ` · ${classNames[trade.asset.class]}`}{tradeSource(trade) && ` · ${tradeSource(trade)}`}</small></span>
          </button></td>
          <td>{tradeDate(trade)}</td><td>{number(trade.quantity, 10)}</td>
          <td>{price(trade.unitPrice, trade.currency)}{trade.purpose === 'AIRDROP' && <small>Оценка источника</small>}</td>
          <td>{money(trade.total, trade.currency, 2)}</td><td>{feeText(trade)}{trade.feeUnknown && <small>Нет данных</small>}</td>
        </tr>)}</tbody>
      </table>
    </div> : <div className="empty-list">Операций по выбранным фильтрам нет.</div>}
  </section>;
}
