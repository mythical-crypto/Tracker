'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Boxes, ChevronDown, Clock3, ExternalLink, Filter, LayoutGrid, List, Menu, Pin, Search, Settings2, SlidersHorizontal, Sparkles, Target, TrendingUp, X } from 'lucide-react';

type Trade = { name: string; category: string; type: string; quantity: number; unitKopecks: number; totalKopecks: number; feeKopecks: number; date: string };
type Item = { name: string; category: string; quantity: number; costKopecks: number; averageKopecks: number; realizedKopecks: number; soldCount: number; trades: Trade[] };
type Price = { priceKopecks?: number; updatedAt?: string; icon?: string; error?: string };
type Portfolio = { currency: string; costMethod: string; items: Item[]; closedItems?: Item[] };
type Prices = { source: string; lastAttemptAt: string | null; lastSuccessAt: string | null; freshCount: number; totalCount: number; items: Record<string, Price> };
type History = { snapshots: { at: string; valueKopecks: number; costKopecks: number; freshCount: number; totalCount: number }[] };
type ItemOptions = { pinned?: boolean; target?: number; note?: string };
type Preferences = { theme: 'dark' | 'light'; view: 'table' | 'grid'; showImages: boolean; dense: boolean };
type Position = Item & { price?: Price; value?: number; profit?: number; roi?: number; options: ItemOptions };

const defaultPreferences: Preferences = { theme: 'dark', view: 'table', showImages: true, dense: false };
const rub = (kopecks: number | undefined, digits = 0) => kopecks === undefined ? '—' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(kopecks / 100);
const num = (value: number) => new Intl.NumberFormat('ru-RU').format(value);
const percent = (value: number | undefined) => value === undefined ? '—' : `${value > 0 ? '+' : ''}${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)}%`;
const signedRub = (value: number | undefined) => value === undefined ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${rub(Math.abs(value))}`;
const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'ожидается';
const marketUrl = (name: string) => `https://steamcommunity.com/market/listings/730/${encodeURIComponent(name)}`;
const titleForCategory = (category: string) => category.startsWith('Наклейки') ? 'Наклейки' : category;

function colorOf(value: number | undefined) { return value === undefined ? '' : value >= 0 ? 'positive' : 'negative'; }
function ItemImage({ item, visible = true }: { item: Position; visible?: boolean }) {
  return <div className={`item-image ${!visible ? 'item-image-off' : ''}`}>{visible && item.price?.icon ? <img src={item.price.icon} alt="" loading="lazy" /> : <Boxes size={24} strokeWidth={1.5} />}</div>;
}

function MiniLine({ points, color = '#c8f46a' }: { points: number[]; color?: string }) {
  if (points.length < 2) return <div className="mini-placeholder" />;
  const min = Math.min(...points), max = Math.max(...points), spread = Math.max(1, max - min);
  const coords = points.map((value, i) => `${i * 100 / (points.length - 1)},${34 - ((value - min) / spread) * 28}`).join(' ');
  return <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><polyline points={coords} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ValueChart({ history, cost }: { history: History; cost: number }) {
  const complete = history.snapshots.filter((s) => s.freshCount === s.totalCount);
  const data = complete.slice(-120);
  if (data.length < 2) return <div className="chart-empty"><div className="chart-empty-art"><span /><span /><span /><span /><span /><span /><span /></div><div className="chart-empty-title">История только начинается</div><p>Первый срез цен сохранён. График стоимости появится после следующего полного обновления Steam.</p><div className="chart-first-value">Текущие вложения <strong>{rub(cost)}</strong></div></div>;
  const values = data.map((s) => s.valueKopecks);
  const min = Math.min(...values, ...data.map((s) => s.costKopecks)) * 0.92;
  const max = Math.max(...values, ...data.map((s) => s.costKopecks)) * 1.08;
  const range = Math.max(1, max - min);
  const xy = (s: typeof data[number], i: number, key: 'valueKopecks' | 'costKopecks') => `${38 + i * 642 / (data.length - 1)},${202 - (s[key] - min) / range * 165}`;
  const line = data.map((s, i) => xy(s, i, 'valueKopecks')).join(' ');
  const costLine = data.map((s, i) => xy(s, i, 'costKopecks')).join(' ');
  const area = `38,202 ${line} 680,202`;
  return <div className="value-chart"><div className="chart-axis"><span>{rub(max)}</span><span>{rub((max + min) / 2)}</span><span>{rub(min)}</span></div><svg viewBox="0 0 720 230" preserveAspectRatio="none" role="img" aria-label="История стоимости портфеля по ценам Steam"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#c8f46a" stopOpacity=".28"/><stop offset="1" stopColor="#c8f46a" stopOpacity="0"/></linearGradient></defs><line x1="38" y1="37" x2="680" y2="37" stroke="var(--line)" strokeDasharray="4 6"/><line x1="38" y1="119" x2="680" y2="119" stroke="var(--line)" strokeDasharray="4 6"/><line x1="38" y1="202" x2="680" y2="202" stroke="var(--line)" strokeDasharray="4 6"/><polygon points={area} fill="url(#chart-fill)"/><polyline points={costLine} fill="none" stroke="#79819a" strokeWidth="2" strokeDasharray="5 6" vectorEffect="non-scaling-stroke"/><polyline points={line} fill="none" stroke="#c8f46a" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/></svg><div className="chart-dates"><span>{dateTime(data[0].at)}</span><span>{dateTime(data[data.length - 1].at)}</span></div></div>;
}

export default function Dashboard({ portfolio, prices: initialPrices, history: initialHistory }: { portfolio: Portfolio; prices: Prices; history: History }) {
  const [prices, setPrices] = useState(initialPrices);
  const [history, setHistory] = useState(initialHistory);
  const [prefs, setPrefs] = useState<Preferences>(defaultPreferences);
  const [itemOptions, setItemOptions] = useState<Record<string, ItemOptions>>({});
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Все');
  const [sort, setSort] = useState('value');
  const [selected, setSelected] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [page, setPage] = useState(1);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const savedPrefs = localStorage.getItem('tracker.preferences.v1');
      const savedOptions = localStorage.getItem('tracker.item-options.v1');
      if (savedPrefs) setPrefs({ ...defaultPreferences, ...JSON.parse(savedPrefs) });
      if (savedOptions) setItemOptions(JSON.parse(savedOptions));
    } catch { /* local storage may be unavailable */ }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem('tracker.preferences.v1', JSON.stringify(prefs)); }, [prefs, ready]);
  useEffect(() => { if (ready) localStorage.setItem('tracker.item-options.v1', JSON.stringify(itemOptions)); }, [itemOptions, ready]);
  useEffect(() => { setPage(1); }, [query, category, sort]);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch('https://api.github.com/repos/mythical-crypto/Tracker/contents/data/live.json?ref=main', { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
        if (!response.ok) return;
        const file = await response.json();
        if (file.encoding !== 'base64' || !file.content) return;
        const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), (char) => char.charCodeAt(0));
        const current = JSON.parse(new TextDecoder().decode(bytes));
        if (!active || current.prices?.source !== 'Steam Community Market' || current.prices?.currency !== 'RUB' || !Array.isArray(current.history?.snapshots)) return;
        setPrices(current.prices);
        setHistory(current.history);
      } catch { /* Встроенный снимок остаётся доступен при сбое GitHub */ }
    };
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 300000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const positions = useMemo<Position[]>(() => portfolio.items.map((item) => {
    const price = prices.items[item.name];
    const value = price?.priceKopecks === undefined ? undefined : price.priceKopecks * item.quantity;
    const profit = value === undefined ? undefined : value - item.costKopecks;
    return { ...item, price, value, profit, roi: profit === undefined || !item.costKopecks ? undefined : profit / item.costKopecks * 100, options: itemOptions[item.name] || {} };
  }), [portfolio.items, prices.items, itemOptions]);
  const cost = positions.reduce((sum, item) => sum + item.costKopecks, 0);
  const value = positions.reduce((sum, item) => sum + (item.value || 0), 0);
  const pricedCost = positions.reduce((sum, item) => sum + (item.value === undefined ? 0 : item.costKopecks), 0);
  const profit = value - pricedCost;
  const roi = pricedCost ? profit / pricedCost * 100 : 0;
  const quantity = positions.reduce((sum, item) => sum + item.quantity, 0);
  const pricedCount = positions.filter((item) => item.value !== undefined).length;
  const completePrices = pricedCount === positions.length;
  const refreshIncomplete = prices.totalCount > 0 && prices.freshCount < prices.totalCount;
  const categories = ['Все', ...new Set(positions.map((item) => item.category))];
  const breakdown = [...new Set(positions.map((item) => titleForCategory(item.category)))].map((name) => ({ name, value: positions.filter((item) => titleForCategory(item.category) === name).reduce((sum, item) => sum + (item.value || 0), 0), count: positions.filter((item) => titleForCategory(item.category) === name).length })).sort((a, b) => b.value - a.value);
  const colors = ['#c8f46a', '#9776ef', '#5fd2c8', '#f6b66e'];
  let progress = 0;
  const pie = breakdown.map((entry, index) => { const start = progress; progress += value ? entry.value / value * 100 : 0; return `${colors[index % colors.length]} ${start}% ${progress}%`; }).join(', ');
  const filtered = positions.filter((item) => (category === 'Все' || item.category === category) && item.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => {
    if (Boolean(a.options.pinned) !== Boolean(b.options.pinned)) return a.options.pinned ? -1 : 1;
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'roi') return (b.roi ?? -Infinity) - (a.roi ?? -Infinity);
    if (sort === 'profit') return (b.profit ?? -Infinity) - (a.profit ?? -Infinity);
    if (sort === 'quantity') return b.quantity - a.quantity;
    return (b.value ?? -Infinity) - (a.value ?? -Infinity);
  });
  const perPage = prefs.view === 'grid' ? 12 : 14;
  const visible = filtered.slice(0, page * perPage);
  const chosen = positions.find((item) => item.name === selected);
  const winners = [...positions].filter((item) => item.roi !== undefined).sort((a, b) => (b.roi || 0) - (a.roi || 0)).slice(0, 3);
  const losers = [...positions].filter((item) => item.roi !== undefined).sort((a, b) => (a.roi || 0) - (b.roi || 0)).slice(0, 3);
  const setOption = (name: string, update: ItemOptions) => setItemOptions((current) => ({ ...current, [name]: { ...current[name], ...update } }));

  return <main className={`site theme-${prefs.theme} ${prefs.dense ? 'dense' : ''}`}>
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="topbar"><div className="shell topbar-inner"><div className="brand"><div className="brand-mark"><span /></div><span>TRACKER<span className="brand-dot">.</span></span><small>CS2 PORTFOLIO</small></div><nav className={mobileMenu ? 'nav open' : 'nav'}><a href="#overview" onClick={() => setMobileMenu(false)} className="active">Обзор</a><a href="#analytics" onClick={() => setMobileMenu(false)}>Аналитика</a><a href="#inventory" onClick={() => setMobileMenu(false)}>Инвентарь</a></nav><div className="top-actions"><span className="live-pill"><i /> STEAM MARKET</span><button className="icon-button" aria-label="Настройки" onClick={() => setSettingsOpen(true)}><Settings2 size={19}/></button><button className="icon-button mobile-menu" aria-label="Меню" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={20}/></button></div></div></header>
    <div className="shell content">
      <section id="overview" className="hero"><div className="eyebrow"><span className="eyebrow-line"/> ТВОЯ ИНВЕСТИЦИОННАЯ ПАНЕЛЬ <span className="eyebrow-dot">✦</span></div><div className="hero-main"><div><h1>Инвентарь под <em>контролем.</em></h1><p>Все предметы, покупки и рыночная оценка Steam — в одном понятном месте.</p></div><div className="updated-box"><Clock3 size={16}/><div><span>Последняя проверка цен</span><strong>{dateTime(prices.lastAttemptAt)}</strong></div></div></div>{!completePrices ? <div className="coverage-warning">Доступны цены для {pricedCount} из {positions.length} позиций. Общая оценка и прибыль сейчас неполные; отсутствующие цены не заменяются данными других площадок.</div> : refreshIncomplete ? <div className="coverage-warning">В последнем обновлении Steam ответил для {prices.freshCount} из {prices.totalCount} позиций. Для остальных показана последняя доступная цена; точное время указано в карточке предмета.</div> : null}</section>

      <section className="metrics" aria-label="Показатели портфеля"><div className="metric metric-main"><div className="metric-label">ТЕКУЩАЯ СТОИМОСТЬ <TrendingUp size={17}/></div><div className="metric-value">{rub(value)}</div><div className="metric-foot"><span className={`metric-badge ${colorOf(profit)}`}>{percent(roi)}</span><span>к стоимости покупки</span></div><div className="metric-glow"/></div><div className="metric"><div className="metric-label">ПРИБЫЛЬ / УБЫТОК <ArrowUpRight size={17}/></div><div className={`metric-value ${colorOf(profit)}`}>{signedRub(profit)}</div><div className="metric-foot"><span>По текущим позициям, до комиссии Steam</span></div></div><div className="metric"><div className="metric-label">ВЛОЖЕНО <BarChart3 size={17}/></div><div className="metric-value">{rub(cost)}</div><div className="metric-foot"><span>Остаточная себестоимость · FIFO</span></div></div><div className="metric"><div className="metric-label">В ИНВЕНТАРЕ <Boxes size={17}/></div><div className="metric-value">{num(quantity)} <span className="metric-unit">шт.</span></div><div className="metric-foot"><span>{positions.length} позиций в портфеле</span></div></div></section>

      <section id="analytics" className="analysis-grid"><div className="panel history-panel"><div className="section-heading"><div><div className="kicker">АНАЛИТИКА</div><h2>Стоимость портфеля</h2></div><span className="subtle-chip"><i/> Steam, ₽</span></div><ValueChart history={history} cost={cost}/><div className="chart-legend"><span><i className="legend-market"/> Оценка Steam</span><span><i className="legend-cost"/> Вложено</span></div></div><div className="panel distribution-panel"><div className="section-heading"><div><div className="kicker">СТРУКТУРА</div><h2>По категориям</h2></div><SlidersHorizontal size={18} className="muted-icon"/></div><div className="donut-wrap"><div className="donut" style={{ background: `conic-gradient(${pie || '#263146 0% 100%'})` }}><div className="donut-hole"><span>ПОЗИЦИЙ</span><strong>{positions.length}</strong></div></div></div><div className="breakdown">{breakdown.map((entry, i) => <div className="breakdown-row" key={entry.name}><span className="breakdown-name"><i style={{ background: colors[i % colors.length] }}/>{entry.name}</span><strong>{value ? Math.round(entry.value / value * 100) : 0}%</strong></div>)}</div></div></section>

      <section className="movers-grid"><div className="panel mover-panel"><div className="section-heading"><div><div className="kicker">ЛИДЕРЫ</div><h2>Лучший рост</h2></div><ArrowUpRight size={20} className="positive"/></div>{winners.map((item) => <button className="mover-row" key={item.name} onClick={() => setSelected(item.name)}><ItemImage item={item} visible={prefs.showImages}/><span className="mover-name">{item.name}<small>{item.quantity} шт. · {rub(item.value)}</small></span><strong className={colorOf(item.roi)}>{percent(item.roi)}</strong></button>)}</div><div className="panel mover-panel"><div className="section-heading"><div><div className="kicker">ПОД НАБЛЮДЕНИЕМ</div><h2>Сильнее просели</h2></div><ArrowDownRight size={20} className="negative"/></div>{losers.map((item) => <button className="mover-row" key={item.name} onClick={() => setSelected(item.name)}><ItemImage item={item} visible={prefs.showImages}/><span className="mover-name">{item.name}<small>{item.quantity} шт. · {rub(item.value)}</small></span><strong className={colorOf(item.roi)}>{percent(item.roi)}</strong></button>)}</div></section>

      <section id="inventory" className="inventory-section"><div className="inventory-heading"><div><div className="kicker">ВСЕ АКТИВЫ</div><h2>Ваш инвентарь <span>{positions.length}</span></h2><p>Цены из Steam Community Market. Нажмите на предмет, чтобы увидеть покупки и настройки.</p></div><div className="view-toggle"><button aria-label="Таблица" title="Таблица" className={prefs.view === 'table' ? 'active' : ''} onClick={() => setPrefs({ ...prefs, view: 'table' })}><List size={18}/></button><button aria-label="Плитки" title="Плитки" className={prefs.view === 'grid' ? 'active' : ''} onClick={() => setPrefs({ ...prefs, view: 'grid' })}><LayoutGrid size={18}/></button></div></div><div className="inventory-controls"><div className="search-box"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти предмет..." aria-label="Найти предмет"/>{query && <button onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={16}/></button>}</div><div className="select-wrap"><Filter size={16}/><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Категория">{categories.map((name) => <option key={name}>{name}</option>)}</select><ChevronDown size={15}/></div><div className="select-wrap"><span>Сортировка:</span><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Сортировка"><option value="value">По стоимости</option><option value="roi">По доходности</option><option value="profit">По прибыли</option><option value="quantity">По количеству</option><option value="name">По названию</option></select><ChevronDown size={15}/></div></div>
      {prefs.view === 'table' ? <div className="table-wrap"><table><thead><tr><th>ПРЕДМЕТ</th><th>КОЛ-ВО</th><th>ПОКУПКА / ШТ.</th><th>STEAM / ШТ.</th><th>СТОИМОСТЬ</th><th>РЕЗУЛЬТАТ</th><th/></tr></thead><tbody>{visible.map((item) => <tr key={item.name} onClick={() => setSelected(item.name)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') setSelected(item.name); }}><td><div className="table-item"><ItemImage item={item} visible={prefs.showImages}/><div><div className="item-name">{item.options.pinned && <Pin size={13} fill="currentColor"/>}{item.name}</div><div className="item-category">{item.category}</div></div></div></td><td>{num(item.quantity)}</td><td>{rub(item.averageKopecks, 2)}</td><td>{rub(item.price?.priceKopecks, 2)}</td><td className="strong-cell">{rub(item.value)}</td><td><div className={`result-cell ${colorOf(item.profit)}`}><strong>{signedRub(item.profit)}</strong><span>{percent(item.roi)}</span></div></td><td><ArrowRight size={17} className="row-arrow"/></td></tr>)}</tbody></table></div> : <div className="item-grid">{visible.map((item) => <button key={item.name} className="item-card" onClick={() => setSelected(item.name)}><div className="item-card-top"><ItemImage item={item} visible={prefs.showImages}/><span className={`roi-chip ${colorOf(item.roi)}`}>{percent(item.roi)}</span></div><h3>{item.name}</h3><p>{item.category} · {item.quantity} шт.</p><div className="item-card-bottom"><div><small>СТОИМОСТЬ</small><strong>{rub(item.value)}</strong></div><ArrowRight size={18}/></div></button>)}</div>}
      {!visible.length && <div className="no-results">Предметы не найдены. Попробуйте другой запрос или категорию.</div>}{visible.length < filtered.length && <button className="load-more" onClick={() => setPage(page + 1)}>Показать ещё {Math.min(perPage, filtered.length - visible.length)} <ArrowRight size={16}/></button>}<div className="inventory-footer">Показано {visible.length} из {filtered.length} · источник цен: Steam Community Market</div></section>

      <footer className="footer"><div className="brand"><div className="brand-mark"><span /></div><span>TRACKER<span className="brand-dot">.</span></span></div><p>Личный трекер предметов CS2. Рыночная оценка по минимальной цене продажи Steam, до комиссии и без гарантии исполнения по этой цене.</p><a href="https://steamcommunity.com/market/" target="_blank" rel="noreferrer">Steam Community Market <ExternalLink size={14}/></a></footer>
    </div>

    {chosen && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><aside className="drawer" role="dialog" aria-modal="true" aria-label={chosen.name}><div className="drawer-header"><button className="back-button" onClick={() => setSelected(null)}><ArrowLeft size={18}/> Назад</button><button className="icon-button" aria-label="Закрыть" onClick={() => setSelected(null)}><X size={20}/></button></div><div className="drawer-scroll"><div className="detail-hero"><ItemImage item={chosen} visible={prefs.showImages}/><div className="kicker">{chosen.category}</div><h2>{chosen.name}</h2><span className="detail-count">{chosen.quantity} шт. в портфеле</span></div><div className="detail-value"><span>ТЕКУЩАЯ СТОИМОСТЬ</span><strong>{rub(chosen.value)}</strong><div className={`detail-profit ${colorOf(chosen.profit)}`}>{signedRub(chosen.profit)} <b>{percent(chosen.roi)}</b></div></div><div className="detail-stats"><div><span>Цена покупки / шт.</span><strong>{rub(chosen.averageKopecks, 2)}</strong></div><div><span>Цена Steam / шт.</span><strong>{rub(chosen.price?.priceKopecks, 2)}</strong></div><div><span>Вложено</span><strong>{rub(chosen.costKopecks)}</strong></div><div><span>Обновлено</span><strong>{dateTime(chosen.price?.updatedAt)}</strong></div></div><a className="steam-link" href={marketUrl(chosen.name)} target="_blank" rel="noreferrer">Открыть на Steam <ExternalLink size={16}/></a><div className="drawer-divider"/><div className="drawer-section-heading"><Target size={18}/><h3>Личные настройки</h3></div><label className="field-label" htmlFor="target">Целевая цена за штуку, ₽</label><input className="detail-input" id="target" type="number" min="0" step="0.01" placeholder="Например, 150" value={chosen.options.target === undefined ? '' : chosen.options.target / 100} onChange={(event) => setOption(chosen.name, { target: event.target.value === '' ? undefined : Math.round(Number(event.target.value) * 100) })}/>{chosen.options.target !== undefined && chosen.price?.priceKopecks !== undefined && <p className="target-note">До цели: {signedRub(chosen.options.target - chosen.price.priceKopecks)} за штуку</p>}<label className="field-label" htmlFor="note">Заметка</label><textarea className="detail-input detail-textarea" id="note" placeholder="Ваша заметка по предмету..." value={chosen.options.note || ''} onChange={(event) => setOption(chosen.name, { note: event.target.value })}/><button className={`pin-button ${chosen.options.pinned ? 'is-pinned' : ''}`} onClick={() => setOption(chosen.name, { pinned: !chosen.options.pinned })}><Pin size={16} fill={chosen.options.pinned ? 'currentColor' : 'none'}/>{chosen.options.pinned ? 'Закреплено в начале списка' : 'Закрепить в начале списка'}</button><p className="local-hint">Настройки сохраняются только в этом браузере.</p><div className="drawer-divider"/><div className="drawer-section-heading"><BarChart3 size={18}/><h3>История операций</h3></div><div className="trade-list">{[...chosen.trades].reverse().map((trade, index) => <div className="trade-row" key={`${trade.date}-${index}`}><div className={`trade-icon ${trade.type}`}>{trade.type === 'buy' ? <ArrowDownRight size={17}/> : <ArrowUpRight size={17}/>}</div><div><strong>{trade.type === 'buy' ? 'Покупка' : 'Продажа'} · {trade.quantity} шт.</strong><span>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(trade.date))}</span></div><strong>{rub(trade.totalKopecks)}</strong></div>)}</div></div></aside></div>}

    {settingsOpen && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><aside className="drawer settings-drawer" role="dialog" aria-modal="true" aria-label="Настройки"><div className="drawer-header"><span className="settings-title"><Settings2 size={19}/> Настройки</span><button className="icon-button" aria-label="Закрыть" onClick={() => setSettingsOpen(false)}><X size={20}/></button></div><div className="drawer-scroll"><div className="settings-intro"><Sparkles size={24}/><h2>Под себя.</h2><p>Настройте отображение портфеля на этом устройстве.</p></div><div className="setting-group"><h3>Тема оформления</h3><div className="segmented"><button className={prefs.theme === 'dark' ? 'active' : ''} onClick={() => setPrefs({ ...prefs, theme: 'dark' })}>Тёмная</button><button className={prefs.theme === 'light' ? 'active' : ''} onClick={() => setPrefs({ ...prefs, theme: 'light' })}>Светлая</button></div></div><div className="setting-group"><h3>Вид инвентаря</h3><div className="segmented"><button className={prefs.view === 'table' ? 'active' : ''} onClick={() => setPrefs({ ...prefs, view: 'table' })}><List size={16}/> Таблица</button><button className={prefs.view === 'grid' ? 'active' : ''} onClick={() => setPrefs({ ...prefs, view: 'grid' })}><LayoutGrid size={16}/> Плитки</button></div></div><label className="setting-switch"><span><strong>Картинки предметов</strong><small>Из Steam Community</small></span><input type="checkbox" checked={prefs.showImages} onChange={(event) => setPrefs({ ...prefs, showImages: event.target.checked })}/></label><label className="setting-switch"><span><strong>Компактная таблица</strong><small>Больше строк на экране</small></span><input type="checkbox" checked={prefs.dense} onChange={(event) => setPrefs({ ...prefs, dense: event.target.checked })}/></label><div className="settings-note">Цена — минимальная активная продажа Steam в RUB. Обновление запускается каждые 30 минут через GitHub Actions; возможны задержки расписания или ограничения Steam. При сбое показывается последняя доступная цена и время её получения.</div></div></aside></div>}
  </main>;
}
