'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Activity, Boxes, ChevronDown, ExternalLink, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { mergeSnapshots } from '@/lib/calculations';
import type { Asset, AssetClass, Snapshot } from '@/lib/types';
import { mergeObservation, parseTrackedItems, positionInputs, steamGames, steamListing, steamReference, trackedId, validObservation, type SteamGame, type SteamObservation, type SteamReference, type TrackedItem } from '@/lib/tracked-items';
import HistoryChart from './history-chart';
import { AssetImage, color, money, number, signed, stale, time } from './portfolio-ui';
import './tracked-items.css';

const storageKey = 'tracker.steam-watch.v1';
const refreshInterval = 15 * 60_000;
type Props = { section: 'overview' | AssetClass; assets: Asset[]; initialAdding?: boolean; priceHistories?: ReadonlyMap<string, Snapshot[]> };
type Result = { name: string | null; quote: SteamObservation | null; error: string | null };

async function getQuote(ref: SteamReference): Promise<Result> {
  const query = new URLSearchParams({ game: ref.game, item: ref.groupId ? steamListing(ref) : ref.name });
  try {
    const response = await fetch('/api/steam-quote?' + query, { cache: 'no-store' });
    if (response.status === 401) throw new Error('Сессия истекла. Для обновления котировок войдите снова.');
    const body = await response.json();
    const name = body.game === ref.game && typeof body.name === 'string' && body.name.length <= 240 ? body.name : ref.groupId ? null : ref.name;
    if (response.ok && name && body.currency === 'RUB' && validObservation(body.quote)) return { name, quote: body.quote, error: null };
    return { name, quote: null, error: typeof body.error === 'string' ? body.error : 'Steam не подтвердил цену.' };
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith('Сессия') ? error.message : 'Не удалось загрузить котировку. Проверьте соединение.';
    return { name: ref.groupId ? null : ref.name, quote: null, error: message };
  }
}

function publishedQuote(asset?: Asset) {
  const quote = { at: asset?.updatedAt, value: asset?.price };
  return asset?.currency === 'RUB' && validObservation(quote) ? quote : null;
}

export default function TrackedItems(props: Props) {
  return props.section === 'crypto' ? null : <SteamWatch {...props}/>;
}

function SteamWatch({ section, assets, initialAdding = false, priceHistories }: Props) {
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [adding, setAdding] = useState(initialAdding);
  const [game, setGame] = useState<SteamGame>(section === 'sandbox' ? 'sandbox' : 'cs2');
  const [name, setName] = useState(''), [quantity, setQuantity] = useState(''), [buyPrice, setBuyPrice] = useState('');
  const [editing, setEditing] = useState<TrackedItem | null>(null), [removing, setRemoving] = useState<string | null>(null);
  const [formError, setFormError] = useState(''), [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState<string | null>(null), [expanded, setExpanded] = useState<string | null>(null);
  const busy = useRef(false), input = useRef<HTMLInputElement>(null), addButton = useRef<HTMLButtonElement>(null);
  const formId = useId(), selectId = useId();
  const catalog = assets.filter(asset => asset.class === 'cs2' || asset.class === 'sandbox');
  const candidates = catalog.filter(asset => asset.class === game).sort((a,b) => a.name.localeCompare(b.name, 'ru'));
  const visible = items.filter(item => section === 'overview' || item.game === section);

  const read = useCallback(() => {
    try { setItems(parseTrackedItems(localStorage.getItem(storageKey))); setStorageError(''); setReady(true); }
    catch { setStorageError('Список недоступен. Проверьте, разрешено ли сайту хранить данные браузера.'); setReady(false); }
  }, []);
  useEffect(() => {
    read();
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) read(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [read]);
  useEffect(() => { if (adding && ready) input.current?.focus(); }, [adding, ready, editing]);

  const change = useCallback(async (update: (rows: TrackedItem[]) => TrackedItem[]) => {
    const write = () => {
      const raw = parseTrackedItems(localStorage.getItem(storageKey));
      const next = update(raw);
      localStorage.setItem(storageKey, JSON.stringify(next));
      setItems(next); setStorageError('');
    };
    if (navigator.locks) await navigator.locks.request(storageKey, write); else write();
  }, []);

  const refresh = useCallback(async (row: TrackedItem) => {
    if (busy.current) return;
    busy.current = true; setLoading(row.revision);
    try {
      const result = await getQuote(row);
      const attemptedAt = new Date().toISOString();
      await change(rows => rows.map(item => item.revision !== row.revision ? item : {
        ...item, history: mergeObservation(item.history, result.quote), attemptedAt, error: result.error,
      }));
    } catch { setStorageError('Не удалось сохранить обновление. Проверьте доступное место в хранилище браузера.'); }
    finally { busy.current = false; setLoading(null); }
  }, [change]);
  useEffect(() => {
    if (!ready || !items.length || saving || storageError) return;
    const tick = () => {
      if (document.hidden || busy.current) return;
      const due = items.find(item => (section === 'overview' || item.game === section) &&
        Date.now() - Math.max(Date.parse(item.attemptedAt ?? '') || 0, Date.parse(item.history.at(-1)?.at ?? '') || 0) >= refreshInterval);
      if (due) void refresh(due);
    };
    const timer = window.setInterval(tick, 4000);
    return () => window.clearInterval(timer);
  }, [items, section, ready, saving, storageError, refresh]);

  function openForm(row: TrackedItem | null = null) {
    setEditing(row); setGame(row?.game ?? (section === 'sandbox' ? 'sandbox' : 'cs2'));
    setName(row?.name ?? ''); setQuantity(row?.quantity?.toString() ?? ''); setBuyPrice(row?.buyPrice?.toString() ?? '');
    setFormError(''); setAdding(true);
  }
  function closeForm() { setAdding(false); setEditing(null); setFormError(''); addButton.current?.focus(); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setFormError('');
    try {
      const fields = positionInputs(quantity, buyPrice);
      if (editing) {
        await change(rows => {
          if (!rows.some(row => row.revision === editing.revision)) throw new Error('Наблюдение уже удалено.');
          return rows.map(row => row.revision === editing.revision ? { ...row, ...fields } : row);
        });
      } else {
        let ref = steamReference(game, name);
        if (section !== 'overview' && ref.game !== section) throw new Error('Ссылка относится к другой игре. Добавьте предмет в обзоре или в разделе ' + steamGames[ref.game].label + '.');
        const match = catalog.find(asset => asset.class === ref.game && asset.name.toLowerCase() === ref.name.toLowerCase());
        if (match) ref = { game: ref.game, name: match.name };
        if (items.some(row => trackedId(row) === trackedId(ref))) throw new Error('Этот предмет уже в наблюдениях.');
        const published = publishedQuote(match);
        const result = !published ? await getQuote(ref) : null;
        if (ref.groupId && !result?.name) throw new Error(result?.error ?? 'Введите точное название из Steam.');
        const item: TrackedItem = {
          game: ref.game, name: result?.name ?? ref.name, revision: crypto.randomUUID(), ...fields,
          history: mergeObservation([], result?.quote ?? published), attemptedAt: result ? new Date().toISOString() : null, error: result?.error ?? null,
        };
        await change(rows => {
          if (rows.some(row => trackedId(row) === trackedId(item))) throw new Error('Этот предмет уже в наблюдениях.');
          return [item, ...rows];
        });
      }
      closeForm();
    } catch (error) {
      setFormError(error instanceof DOMException ? 'Сохранение недоступно. Проверьте хранилище браузера.' : error instanceof Error ? error.message : 'Не удалось добавить предмет.');
    } finally { setSaving(false); }
  }
  async function remove(row: TrackedItem) {
    try { await change(rows => rows.filter(item => item.revision !== row.revision)); setRemoving(null); addButton.current?.focus(); }
    catch { setStorageError('Не удалось сохранить изменения в этом браузере.'); }
  }

  return <section className="watch-panel panel" aria-label="Мои наблюдения">
    <header className="watch-heading"><div><h2>Мои наблюдения</h2><p>Личный список Steam в этом браузере. Его позиции учитываются отдельно от портфеля.</p></div>
      <button ref={addButton} className="watch-add" disabled={!ready || saving} aria-controls={formId} aria-expanded={adding} onClick={() => openForm()}><Plus size={16}/>Добавить предмет</button>
    </header>
    {storageError && <p className="watch-error" role="alert">{storageError}</p>}
    {adding && <form className="watch-form" id={formId} onSubmit={submit}>
      <div className="watch-form-heading"><h3>{editing ? 'Параметры позиции' : 'Новый предмет'}</h3><button type="button" disabled={saving} className="icon-button" aria-label="Закрыть форму" onClick={closeForm}><X size={17}/></button></div>
      <div className="watch-fields">
        <label>Игра<select value={game} disabled={Boolean(editing) || section !== 'overview' || saving} onChange={event => { setGame(event.target.value as SteamGame); setName(''); }}><option value="cs2">CS2</option><option value="sandbox">Sandbox</option></select></label>
        <label className="watch-name">Название или ссылка Steam<input ref={input} value={name} readOnly={Boolean(editing)} disabled={saving} required maxLength={1600} placeholder="Например, Fracture Case" onChange={event => setName(event.target.value)} list={selectId} autoComplete="off"/><datalist id={selectId}>{candidates.map(asset => <option key={asset.id} value={asset.name}/>)}</datalist></label>
        <label>Количество, шт.<input type="number" step="1" min="1" placeholder="Необязательно" value={quantity} disabled={saving} onChange={event => setQuantity(event.target.value)}/></label>
        <label>Покупка за шт., ₽<input inputMode="decimal" placeholder="Необязательно" value={buyPrice} disabled={saving} onChange={event => setBuyPrice(event.target.value)}/></label>
      </div>
      {!editing && candidates.length > 0 && <label className="watch-picker">Или выберите из портфеля<select aria-label="Выбрать предмет из портфеля" disabled={saving} value={candidates.some(asset => asset.name === name) ? name : ''} onChange={event => setName(event.target.value)}><option value="">Выбрать предмет…</option>{candidates.map(asset => <option key={asset.id} value={asset.name}>{asset.name}</option>)}</select></label>}
      {formError && <p className="watch-error" role="alert">{formError}</p>}
      <div className="watch-form-actions"><button type="submit" className="watch-add" disabled={!ready || saving}>{saving ? 'Сохранение…' : editing ? 'Сохранить' : 'Добавить в наблюдения'}</button><button type="button" className="watch-plain" onClick={closeForm} disabled={saving}>Отмена</button></div>
    </form>}
    {ready && !visible.length && !adding && <div className="watch-empty"><Activity size={22}/><span>Пока нет предметов для наблюдения</span></div>}
    {visible.length > 0 && <div className="watch-list">{visible.map(row => {
      const key = row.revision;
      const asset = catalog.find(a => a.class === row.game && a.name.toLowerCase() === row.name.toLowerCase());
      const observed = mergeObservation(row.history, publishedQuote(asset));
      const quote = observed.at(-1);
      const value = quote && row.quantity !== null ? quote.value * row.quantity : null;
      const pnl = value !== null && row.quantity !== null && row.buyPrice !== null ? value - row.quantity * row.buyPrice : null;
      const assetId = asset?.id ?? trackedId(row);
      return <article key={key} className="watch-item">
        <div className="watch-row"><div className="watch-identity">{asset ? <AssetImage asset={asset}/> : <span className="asset-image"><Boxes size={21}/></span>}<div><strong>{row.name}</strong><small>{steamGames[row.game].label}{asset?.category && ' · ' + asset.category}</small></div></div>
          <div className="watch-figure"><span>Цена за единицу</span><strong>{money(quote?.value, 'RUB', 2)}</strong><small>{quote ? (stale(quote.at) ? 'Сохранена · ' : '') + time(quote.at) : 'Нет котировки'}</small></div>
          <div className="watch-figure"><span>Стоимость позиции</span><strong>{money(value, 'RUB', 2)}</strong><small>{row.quantity === null ? 'Количество не задано' : number(row.quantity, 0) + ' шт.'}</small></div>
          <div className="watch-figure"><span>Результат по остатку</span><strong className={color(pnl)}>{signed(pnl, 'RUB', 2)}</strong><small>{row.buyPrice === null ? 'Покупка не указана' : 'Покупка ' + money(row.buyPrice, 'RUB', 2) + ' / шт.'}</small></div>
        </div>
        {row.error && <p className="watch-error" role="status">{row.error}{row.attemptedAt && ' Попытка ' + time(row.attemptedAt) + '.'}</p>}
        <div className="watch-actions"><button className="watch-history" aria-expanded={expanded === key} onClick={() => setExpanded(expanded === key ? null : key)}><ChevronDown size={14}/>История цены</button>
          <a className="watch-market" href={steamListing(row)} target="_blank" rel="noreferrer">Steam Market<ExternalLink size={12}/></a>
          <div className="watch-tools"><button className="icon-button" title="Обновить котировку" aria-label={'Обновить котировку ' + row.name} disabled={Boolean(loading) || saving} onClick={() => void refresh(row)}><RefreshCw size={15} className={loading === key ? 'spin' : ''}/></button>
            <button className="icon-button" title="Изменить позицию" aria-label={'Изменить позицию ' + row.name} disabled={saving} onClick={() => { openForm(row); input.current?.scrollIntoView({ block: 'center' }); }}><Pencil size={15}/></button>
            <button className="icon-button" title="Удалить из наблюдений" aria-label={'Удалить из наблюдений ' + row.name} disabled={saving} onClick={() => setRemoving(removing === key ? null : key)}><Trash2 size={15}/></button></div>
        </div>
        {removing === key && <div className="watch-remove"><span>Удалить предмет и его локальную историю?</span><button onClick={() => void remove(row)}>Удалить</button><button onClick={() => setRemoving(null)}>Отмена</button></div>}
        {expanded === key && <div className="watch-chart"><HistoryChart snapshots={mergeSnapshots(observed.map(point => ({...point, cost: null, complete: true, coverageKey: assetId, quantityKey: assetId + ':1'} as Snapshot)), priceHistories?.get(assetId) ?? [])} currency="RUB" title="Цена за единицу" unitPrice initialPeriod="all"/></div>}
      </article>;
    })}</div>}
    {visible.length > 0 && <p className="watch-footnote">Котировки запрашиваются по очереди каждые 15 минут, пока этот список открыт. Цена Steam указана до комиссии продажи.</p>}
  </section>;
}
