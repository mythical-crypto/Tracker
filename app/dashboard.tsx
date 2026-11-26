'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Bookmark, Boxes, ChartNoAxesCombined, ChevronDown, Clock3, Coins, Gamepad2, History, LogOut, Moon, Plus, RefreshCw, Sun } from 'lucide-react';
import { currentBasketHistory } from '@/lib/basket-history';
import { assetPriceHistory, convert, mergePortfolio, periodChange, summarize } from '@/lib/calculations';
import type { MarketPeriod } from '@/lib/market-movers';
import type { Asset, AssetClass, Currency, PortfolioData } from '@/lib/types';
import AssetDetails from './asset-details';
import HistoryChart from './history-chart';
import MarketMovers from './market-movers';
import { AssetList, TradeList, type AssetView } from './portfolio-lists';
import { AssetImage, classNames, color, countLabel, money, pct, signed, stale, time, type AssetOptions } from './portfolio-ui';
import TrackedItems from './tracked-items';

const portfolios = [
  { id: 'cs2', href: '/cs2', Icon: Gamepad2 },
  { id: 'sandbox', href: '/sandbox', Icon: Boxes },
  { id: 'crypto', href: '/crypto', Icon: Coins },
] as const;
const tabs = [
  { id: 'overview', label: 'Динамика', Icon: ChartNoAxesCombined },
  { id: 'assets', label: 'Активы', Icon: Boxes },
  { id: 'trades', label: 'Операции', Icon: History },
  { id: 'watch', label: 'Наблюдение', Icon: Bookmark },
] as const;

type Section = 'overview' | AssetClass;
type Tab = (typeof tabs)[number]['id'];
type Selection = { id: string; marketPeriod?: MarketPeriod };

function MarketSourceInfo({ data, section, assets, allAssets, usdRub, currency }: {
  data: PortfolioData; section: Section; assets: Asset[]; allAssets: Asset[]; usdRub: number | null; currency: Currency;
}) {
  const totals = summarize(assets, usdRub, currency === 'USD');
  const sales = summarize(allAssets, usdRub, currency === 'USD');
  const relevant = portfolios.filter(({ id }) => section === 'overview' || section === id);
  return <details className="panel portfolio-data">
    <summary>Данные и расчёты <ChevronDown size={18} aria-hidden="true" /></summary>
    <div className="portfolio-data-body">
      <dl className="portfolio-accounting">
        <div><dt>Вложено</dt><dd>{money(totals.cost, currency)}{totals.knownCost < totals.total && <small className="accounting-coverage">{totals.knownCost} из {totals.total} позиций</small>}</dd></div>
        <div><dt>Нереализованный результат</dt><dd><span className={color(totals.pnl)}>{signed(totals.pnl, currency)}{totals.roi !== null && <small> {pct(totals.roi)}</small>}</span>{totals.comparableCount < totals.total && <small className="accounting-coverage">{totals.comparableCount} из {totals.total} позиций</small>}</dd></div>
        <div><dt>Результат продаж</dt><dd><span className={color(sales.realized)}>{signed(sales.realized, currency)}</span>{sales.realizedKnownCount < allAssets.length && <small className="accounting-coverage">По известным операциям · частично</small>}</dd></div>
      </dl>
      <div className="portfolio-source-list">
        {relevant.map(({ id }) => {
          const source = data.sources[id];
          return <div key={id}>
            <div className="portfolio-source-title"><strong>{classNames[id]}</strong><a href={source.url} target="_blank" rel="noreferrer">{id === 'crypto' ? 'DropsTab · USD' : 'Steam Community Market · RUB'} <ArrowUpRight size={14} aria-hidden="true" /></a></div>
            <p>Последнее наблюдение · {time(source.at, true)}</p>
            {source.attemptedAt && (source.error || source.deliveryError) && <p>Попытка обновления · {time(source.attemptedAt, true)}</p>}
            {source.error && <p>{source.error}</p>}
            {source.deliveryError && <p>{source.deliveryError}</p>}
          </div>;
        })}
        {section === 'overview' || section === 'crypto' ? <div><strong>Курс оценки</strong><p>{usdRub === null ? 'Нет датированного курса USD/RUB' : `1 USD = ${money(usdRub, 'RUB', 2)} · ${time(data.fxUpdatedAt, true)}`}</p>{usdRub !== null && <p>{data.fxSource}</p>}</div> : null}
        {section === 'sandbox' && data.verifiedAt && <div><strong>Сверка инвентаря · {time(data.verifiedAt, true)}</strong>
          {data.sandboxNotes.map(note => <p key={note}>{note}</p>)}
          {data.verifiedInventoryUrl && <a href={data.verifiedInventoryUrl} target="_blank" rel="noreferrer">Инвентарь в Steam <ArrowUpRight size={14} aria-hidden="true" /></a>}
        </div>}
      </div>
    </div>
  </details>;
}

export default function Dashboard({ initialData, section, localAccess = false }: {
  initialData: PortfolioData; section: Section; localAccess?: boolean;
}) {
  const [data, setData] = useState(initialData);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [view, setView] = useState<AssetView>('table');
  const [options, setOptions] = useState<Record<string, AssetOptions>>({});
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [addRequest, setAddRequest] = useState(0);
  const [chartMode, setChartMode] = useState<'portfolio' | 'market'>('portfolio');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const assetsTabRef = useRef<HTMLButtonElement>(null);
  const watchTabRef = useRef<HTMLButtonElement>(null);
  const refreshInProgress = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('tracker.v3.preferences') || '{}');
      const legacy = JSON.parse(localStorage.getItem('tracker.v2.preferences') || '{}');
      setTheme(saved.theme === 'dark' ? 'dark' : 'light');
      const savedView = saved.view ?? legacy.view;
      setView(savedView === 'table' || savedView === 'grid' ? savedView : window.innerWidth < 700 ? 'grid' : 'table');
      const old = JSON.parse(localStorage.getItem('tracker.item-options.v1') || '{}');
      const migrated = Object.fromEntries(Object.entries(old).map(([name, value]) => {
        const option = value as AssetOptions;
        return [`cs2:${name}`, { ...option, target: option.target === undefined ? undefined : option.target / 100 }];
      }));
      setOptions({ ...migrated, ...JSON.parse(localStorage.getItem('tracker.v2.options') || '{}') });
    } catch { /* Optional browser preferences. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem('tracker.v3.preferences', JSON.stringify({ theme, view }));
      localStorage.setItem('tracker.v2.options', JSON.stringify(options));
    } catch { /* Storage can be unavailable. */ }
  }, [theme, view, options, ready]);

  useEffect(() => {
    if (!selection) return;
    const priorFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelection(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
      ) ?? []).filter(element => element.getClientRects().length > 0);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && first && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && last && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
      priorFocus?.focus({ preventScroll: true });
    };
  }, [selection]);

  async function refresh() {
    if (refreshInProgress.current) return;
    refreshInProgress.current = true;
    setRefreshing(true);
    setRefreshError('');
    try {
      const response = await fetch('/api/portfolio', { cache: 'no-store' });
      if (response.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (!response.ok) throw new Error();
      const next: PortfolioData = await response.json();
      if (!Array.isArray(next.assets)) throw new Error();
      setData(current => mergePortfolio(current, next));
    } catch {
      setRefreshError('Не удалось обновить портфель. Показаны сохранённые данные.');
    } finally {
      refreshInProgress.current = false;
      setRefreshing(false);
    }
  }
  useEffect(() => {
    const timer = setInterval(() => { void refresh(); }, 300000);
    return () => clearInterval(timer);
  }, []);

  async function logout() {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error();
      window.location.assign('/login');
    } catch {
      setRefreshError('Не удалось завершить сеанс. Повторите попытку.');
    }
  }

  const allAssets = useMemo(() => section === 'overview' ? data.assets : data.assets.filter(asset => asset.class === section), [data.assets, section]);
  const active = useMemo(() => allAssets.filter(asset => asset.quantity > 0), [allAssets]);
  const histories = useMemo(() => new Map(data.assets.map(asset => [asset.id, assetPriceHistory(asset, data.history[asset.class])])), [data.assets, data.history]);
  const usdRub = data.fxUpdatedAt && Number.isFinite(Date.parse(data.fxUpdatedAt)) && data.usdRub && data.usdRub > 0 ? data.usdRub : null;
  const currency: Currency = section === 'crypto' && usdRub === null ? 'USD' : 'RUB';
  const totals = summarize(active, usdRub, currency === 'USD');
  const positionValue = (asset: Asset) => {
    const native = asset.price === null ? null : asset.price * asset.quantity;
    return currency === 'USD' ? native : convert(native, asset.currency, usdRub);
  };
  const chosen = data.assets.find(asset => asset.id === selection?.id);
  const chosenValue = chosen ? positionValue(chosen) : null;
  const chosenShare = chosenValue !== null && totals.value ? chosenValue / totals.value * 100 : null;
  const snapshots = section === 'overview' ? data.combinedHistory : data.history[section];
  const basket = useMemo(() => section === 'crypto'
    ? currentBasketHistory(active.map(asset => ({ ...asset, priceHistory: histories.get(asset.id) })))
    : [], [section, active, histories]);
  const showBasket = chartMode === 'market' && basket.length > 1;
  const savedQuotes = active.some(asset => asset.price !== null && stale(asset.updatedAt));
  const sourceIssue = portfolios.some(({ id }) => (section === 'overview' || section === id) && (data.sources[id].error || data.sources[id].deliveryError));
  const week = tab === 'overview' ? periodChange(snapshots, 7) : null;
  const hasWeek = week?.status === 'ready' && week.percent !== null;
  const stamp = snapshots.at(-1)?.at;
  const period = selection?.marketPeriod;
  const detailPeriod = period === 1 ? 'day' : period === 7 || period === 'latest' ? 'week' : period === 30 ? 'month' : undefined;
  const portfolioName = section === 'overview' ? 'Обзор' : classNames[section];
  const title = section === 'overview' ? 'Обзор портфеля' : portfolioName;
  const leaders = tab === 'overview' && section !== 'overview'
    ? active.map(asset => ({ asset, value: positionValue(asset) })).sort((a, b) => (b.value ?? -1) - (a.value ?? -1)).slice(0, 4) : [];
  const openAsset = (id: string, marketPeriod?: MarketPeriod) => setSelection({ id, marketPeriod });

  return <div className={`tracker theme-${theme}`}>
    <header className="tracker-header" inert={Boolean(chosen)}>
      <div className="tracker-header-inner">
        <Link href="/" className="tracker-brand" aria-label="Tracker, главная">
          <span className="brand-mark"><ChartNoAxesCombined size={21} strokeWidth={2.5} aria-hidden="true" /></span>
          <span>Tracker<span className="brand-period">.</span></span>
        </Link>
        <nav className="tracker-nav" aria-label="Портфели">
          <Link href="/" aria-current={section === 'overview' ? 'page' : undefined}><ChartNoAxesCombined size={17} aria-hidden="true" />Обзор</Link>
          {portfolios.map(({ id, href, Icon }) => <Link key={id} href={href} aria-current={section === id ? 'page' : undefined}>
            <Icon size={17} aria-hidden="true" />{id === 'crypto' ? 'Крипто' : classNames[id]}
          </Link>)}
        </nav>
        <div className="tracker-header-actions">
          <button className="icon-button" type="button" title={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'} aria-label={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <Moon size={19} aria-hidden="true" /> : <Sun size={19} aria-hidden="true" />}
          </button>
          <button className="quiet-button refresh-button" type="button" onClick={refresh} disabled={refreshing} aria-label="Обновить портфель">
            <RefreshCw size={17} aria-hidden="true" className={refreshing ? 'spinning' : ''} /><span>{refreshing ? 'Обновление…' : 'Обновить'}</span>
          </button>
          {!localAccess && <button className="icon-button" type="button" title="Выйти" aria-label="Выйти из портфеля" onClick={logout}><LogOut size={18} aria-hidden="true" /></button>}
        </div>
      </div>
    </header>
    <main className="workspace" inert={Boolean(chosen)}>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <div className="page-status">
            {stamp && <span><Clock3 size={15} aria-hidden="true" />Снимок от {time(stamp)}</span>}
            {(savedQuotes || sourceIssue) && <span className="stale-label"><i aria-hidden="true" />Сохранённые котировки</span>}
          </div>
        </div>
        {section !== 'crypto' && tab !== 'watch' && <button type="button" className="primary-button" onClick={() => {
          setAddRequest(value => value + 1);
          setTab('watch');
          watchTabRef.current?.focus();
        }}><Plus size={18} aria-hidden="true" /><span>Добавить предмет</span></button>}
      </div>
      {refreshError && <p className="refresh-error" role="alert">{refreshError}</p>}
      <nav className="workspace-nav" aria-label="Представление портфеля">
        {tabs.filter(({ id }) => id !== 'watch' || section !== 'crypto').map(({ id, label, Icon }) => <button
          key={id} ref={id === 'assets' ? assetsTabRef : id === 'watch' ? watchTabRef : undefined} type="button" aria-pressed={tab === id}
          onClick={() => { setTab(id); if (id === 'watch' && tab !== 'watch') setAddRequest(0); }}>
          <Icon size={17} aria-hidden="true" />{label}
        </button>)}
      </nav>
      {tab === 'overview' && <>
        <div className="primary-grid">
          <section className="panel summary-chart" aria-label="Стоимость и история портфеля">
            <div className="valuation">
              <h2>{totals.complete ? 'Стоимость портфеля' : 'Оценённая часть портфеля'}</h2>
              <strong>{money(totals.value, currency)}</strong>
              <div className="valuation-meta">
                {hasWeek && <span className={`valuation-trend ${color(week.absolute)}`}>{pct(week.percent)} за 7 д</span>}
                <span>{totals.complete ? countLabel(totals.total, ['позиция', 'позиции', 'позиций']) : `Оценено ${totals.priced} из ${totals.total} позиций`}</span>
                {currency === 'USD' && <span>Нет курса USD/RUB</span>}
              </div>
            </div>
            <HistoryChart key={showBasket ? 'basket' : section} compact title={showBasket ? 'Текущий состав по прошлым ценам' : 'История стоимости'} snapshots={showBasket ? basket : snapshots} currency={section === 'crypto' ? 'USD' : 'RUB'} initialPeriod={showBasket ? 'year' : 'month'} />
            {section === 'crypto' && basket.length > 1 && <div className="chart-switch">
              <label>Тип графика <select value={showBasket ? 'market' : 'portfolio'} onChange={event => setChartMode(event.target.value === 'market' ? 'market' : 'portfolio')}>
                <option value="portfolio">Снимки портфеля</option><option value="market">Цены на текущий состав</option>
              </select></label>
              {showBasket && <p>Исторические цены DropsTab × нынешние остатки, в USD.</p>}
            </div>}
          </section>
          <MarketMovers assets={active} histories={histories} onSelect={openAsset} />
        </div>
        {section === 'overview' ? <section className="overview-section" aria-labelledby="portfolios-title">
          <div className="section-heading"><h2 id="portfolios-title">Портфели</h2></div>
          <div className="portfolio-cards">{portfolios.map(({ id, href, Icon }) => {
            const native = id === 'crypto' && usdRub === null;
            const summary = summarize(active.filter(asset => asset.class === id), usdRub, native);
            return <Link className={`panel portfolio-card ${id}`} href={href} key={id}>
              <div className="portfolio-card-top"><span className="class-icon"><Icon size={20} aria-hidden="true" /></span><h3>{classNames[id]}</h3><ArrowUpRight size={20} aria-hidden="true" /></div>
              <strong>{money(summary.value, native ? 'USD' : 'RUB')}</strong>
              <span className="portfolio-card-meta">{countLabel(summary.total, ['позиция', 'позиции', 'позиций'])}{!summary.complete && ' · Частичная оценка'}</span>
            </Link>;
          })}</div>
        </section> : <section className="overview-section" aria-labelledby="leaders-title">
          <div className="section-heading"><h2 id="leaders-title">Крупнейшие позиции</h2><button type="button" className="quiet-button" onClick={() => {
            setTab('assets');
            assetsTabRef.current?.focus();
          }}>Все активы <ArrowRight size={16} aria-hidden="true" /></button></div>
          <div className="panel asset-preview">
            {leaders.length ? leaders.map(({ asset, value }) => <button type="button" className="asset-preview-row" onClick={() => openAsset(asset.id)} key={asset.id}>
              <AssetImage asset={asset} /><span><strong>{asset.name}</strong><small>{asset.symbol || asset.category}</small></span>
              <strong>{money(value, currency, 2)}</strong><ArrowUpRight size={17} aria-hidden="true" />
            </button>) : <p>Пока нет открытых позиций.</p>}
          </div>
        </section>}
      </>}
      {tab === 'assets' && <AssetList assets={active} histories={histories} options={options} section={section} usdRub={usdRub} currency={currency} view={view} onViewChange={setView} onSelect={openAsset} />}
      {tab === 'trades' && <TradeList assets={allAssets} overview={section === 'overview'} onSelect={openAsset} />}
      {tab === 'watch' && section !== 'crypto' && <TrackedItems key={addRequest} section={section} assets={data.assets} priceHistories={histories} initialAdding={addRequest > 0} />}
      {tab === 'overview' && <MarketSourceInfo data={data} section={section} assets={active} allAssets={allAssets} usdRub={usdRub} currency={currency} />}
      <footer className="page-footer"><span>{section === 'crypto' ? 'DropsTab · USD' : section === 'overview' ? 'Steam Community Market · RUB / DropsTab · USD' : 'Steam Community Market · RUB'}</span><Link href="/welcome">О Tracker <ArrowUpRight size={14} aria-hidden="true" /></Link></footer>
    </main>
    {chosen && <AssetDetails
      key={chosen.id} asset={chosen} snapshots={histories.get(chosen.id) ?? []} options={options[chosen.id] ?? {}}
      share={chosenShare} initialPeriod={detailPeriod} marketPeriod={period} usdRub={usdRub} fxUpdatedAt={data.fxUpdatedAt}
      closeRef={closeRef} dialogRef={dialogRef} onClose={() => setSelection(null)}
      onChange={update => setOptions(current => ({ ...current, [chosen.id]: { ...current[chosen.id], ...update } }))}
    />}
  </div>;
}
