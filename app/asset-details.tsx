'use client';

import { useState, type RefObject } from 'react';
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Pin, X, StickyNote, Target, CircleCheck, Info } from 'lucide-react';
import type { Asset, Snapshot } from '@/lib/types';
import { assetStatistics } from '@/lib/asset-statistics';
import { newestTradeFirst, tradeDate, tradeSource } from '@/lib/trades';
import HistoryChart, { PeriodSummary } from './history-chart';
import { AssetImage, type AssetOptions, classNames, money, number, countLabel, price, pct, signed, color, time, stale, feeText } from './portfolio-ui';

type Props = { asset: Asset; snapshots: Snapshot[]; options: AssetOptions; share: number | null; closeRef: RefObject<HTMLButtonElement | null>; dialogRef: RefObject<HTMLElement | null>; onClose: () => void; onChange: (options: AssetOptions) => void };

export default function AssetDetails({ asset, snapshots, options, share, closeRef, dialogRef, onClose, onChange }: Props) {
  const [tab, setTab] = useState('overview');
  const stats = assetStatistics(asset);
  const closed = asset.quantity === 0;
  const datedTrades = asset.trades.filter(trade => trade.date && Number.isFinite(Date.parse(trade.date))).sort(newestTradeFirst);
  const firstBuy = datedTrades.filter(trade => trade.type === 'buy').at(-1);
  const latestTrade = datedTrades[0];
  const target = options.target && Number.isFinite(options.target) && options.target > 0 ? options.target : null;
  const targetDistance = target !== null && asset.price !== null && asset.price > 0 ? (target / asset.price - 1) * 100 : null;
  const noPnl = asset.cost === null ? 'Нет себестоимости' : 'Нет котировки';
  return <div className="dialog-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside ref={dialogRef} className="asset-drawer" role="dialog" aria-modal="true" aria-labelledby="asset-detail-title">
      <header className="drawer-top">
        <AssetImage asset={asset}/>
        <div className="drawer-identity"><div className="eyebrow">{classNames[asset.class]} <span> / </span> {asset.symbol || asset.category}</div><h2 id="asset-detail-title">{asset.name}</h2><p>{asset.quantity > 0 ? 'Открытая позиция' : 'Закрытая позиция'}<span className={`quote-status ${stale(asset.updatedAt) ? 'is-stale' : ''}`}>{asset.price === null ? 'Нет котировки' : `${stale(asset.updatedAt) ? 'Сохранённая цена' : 'Актуальная цена'} · ${time(asset.updatedAt)}`}</span></p></div>
        <button className={`icon-button detail-pin ${options.pinned ? 'pinned' : ''}`} aria-label={options.pinned ? 'Открепить актив' : 'Закрепить актив'} aria-pressed={Boolean(options.pinned)} onClick={() => onChange({ pinned: !options.pinned })}><Pin size={18}/></button>
        <button ref={closeRef} className="icon-button" aria-label="Закрыть детали" onClick={onClose}><X size={20}/></button>
      </header>
      <div className="drawer-tabs" role="group" aria-label="Разделы статистики актива">
        {[['overview', 'Статистика'], ['trades', `Операции · ${asset.trades.length}`], ['notes', 'Заметка и цель']].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}{id === 'notes' && options.note && <i className="note-dot"/>}</button>)}
      </div>
      <div className="drawer-body">
        <section className="position-hero" aria-label="Оценка позиции">
          <div className="position-value"><span>Стоимость позиции</span><strong>{money(stats.value, asset.currency, 2)}</strong><small>{number(asset.quantity, asset.class === 'crypto' ? 10 : 2)} {asset.symbol || 'шт.'} × {price(asset.price, asset.currency)}</small></div>
          <div><span>{closed ? 'Результат продаж' : 'Вложено в остаток'}</span><strong className={closed ? color(asset.realized) : ''}>{closed ? signed(asset.realized, asset.currency, 2) : money(asset.cost, asset.currency, 2)}</strong><small>{closed ? 'По исходному учёту операций' : `Средняя покупка ${price(asset.averageBuyPrice, asset.currency)}`}</small></div>
          <div><span>{closed ? 'Продано по истории' : 'Нереализованный результат'}</span><strong className={closed ? '' : color(stats.pnl)}>{closed ? stats.soldQuantity === null ? '—' : `${number(stats.soldQuantity, 10)} ${asset.symbol || 'шт.'}` : signed(stats.pnl, asset.currency, 2)}</strong><small className={closed ? '' : color(stats.pnl)}>{closed ? `Сумма продаж ${money(stats.sellTotal, asset.currency, 2)}` : stats.pnl === null ? noPnl : stats.roi === null ? 'Без затрат на покупку' : pct(stats.roi)}</small></div>
        </section>
        {tab === 'overview' && <>
          <div className="detail-overview-grid">
            <section className="panel detail-chart"><HistoryChart key={asset.id} snapshots={snapshots} currency={asset.currency} title="Цена единицы" unitPrice/><PeriodSummary snapshots={snapshots} currency={asset.currency} unitPrice/></section>
            <section className="panel position-ledger"><div className="panel-heading"><h3>Паспорт позиции</h3><Info size={16}/></div>
              <dl>
                <div><dt>Количество</dt><dd>{number(asset.quantity, asset.class === 'crypto' ? 10 : 2)} <small>{asset.symbol || 'шт.'}</small></dd></div>
                <div><dt>Доля в оценённом портфеле</dt><dd>{share === null ? '—' : `${number(share)}%`}</dd></div>
                <div><dt>Цена сейчас</dt><dd>{price(asset.price, asset.currency)}</dd></div>
                <div><dt>Средняя покупка</dt><dd>{price(asset.averageBuyPrice, asset.currency)}</dd></div>
                <div><dt>Себестоимость / шт.</dt><dd>{price(stats.basis, asset.currency)}</dd></div>
                <div><dt>Результат продаж</dt><dd className={color(asset.realized)}>{signed(asset.realized, asset.currency, 2)}</dd></div>
                <div className="ledger-total"><dt>Общий результат</dt><dd className={color(stats.totalResult)}>{signed(stats.totalResult, asset.currency, 2)}</dd></div>
              </dl>
              <p className="source-footnote">Общий результат = прибыль по остатку + результат продаж. {asset.class === 'crypto' ? 'Все суммы в USD.' : 'Рыночная оценка до комиссии Steam.'}</p>
              {target !== null && <div className="target-summary"><Target size={17}/><div><span>Цель {price(target, asset.currency)}</span><strong>{targetDistance === null ? 'Нет текущей цены' : targetDistance <= 0 ? 'Цель достигнута' : `${number(targetDistance)}% до цели`}</strong></div>{targetDistance !== null && targetDistance <= 0 && <CircleCheck size={18}/>}</div>}
            </section>
          </div>
          <section className="panel flow-panel"><div className="panel-heading"><h3>Движение актива</h3><span>{asset.accounting ? 'По исходному учёту' : asset.historyIncomplete ? 'По доступным операциям' : 'По истории операций'}</span></div>
            <div className="flow-metrics"><div><ArrowDownLeft size={18}/><span>Куплено</span><strong>{stats.boughtQuantity === null ? '—' : number(stats.boughtQuantity, 10)} <small>{asset.symbol || 'шт.'}</small></strong><small>Сумма {money(stats.buyTotal, asset.currency, 2)}</small></div><div><ArrowUpRight size={18}/><span>Продано</span><strong>{stats.soldQuantity === null ? '—' : number(stats.soldQuantity, 10)} <small>{asset.symbol || 'шт.'}</small></strong><small>Сумма {money(stats.sellTotal, asset.currency, 2)}</small></div><div><span>Операций в истории</span><strong>{asset.trades.length}</strong><small>{countLabel(stats.buyCount, ['покупка', 'покупки', 'покупок'])} · {countLabel(stats.sellCount, ['продажа', 'продажи', 'продаж'])}</small></div><div><span>Качество учёта</span><strong>{!stats.hasHistory ? 'Нет истории' : asset.historyIncomplete ? 'Частичный' : 'Полный'}</strong><small>{!asset.trades.length ? 'Нет операций для проверки комиссий' : stats.unknownFees ? `${countLabel(stats.unknownFees, ['операция', 'операции', 'операций'])} без данных комиссии` : 'Комиссии указаны в операциях'}{stats.unknownDates > 0 && ` · ${stats.unknownDates} без даты`}</small></div></div>
            <div className="flow-dates"><span>Первая покупка в истории<strong>{firstBuy ? tradeDate(firstBuy) : 'Дата неизвестна'}</strong></span><span>Последняя датированная операция<strong>{latestTrade ? tradeDate(latestTrade) : 'Дата неизвестна'}</strong></span></div>
          </section>
          {asset.priceHistoryStatus && <details className="data-disclosure"><summary>Доступность ценовой истории</summary><p>{asset.priceHistoryStatus} Показаны реальные наблюдения трекера. Пропуски не восстанавливаются.</p></details>}
          {asset.historyIncomplete && <p className="detail-notice"><Info size={16}/>История операций неполная. Остаток и себестоимость сохранены по исходному учёту.</p>}
        </>}
        {tab === 'trades' && <section className="panel detail-trades"><div className="panel-heading"><h3>История операций</h3><span>{countLabel(asset.trades.length, ['запись', 'записи', 'записей'])}</span></div>{asset.historyIncomplete && <p className="detail-notice">История неполная. Операции не заменяют подтверждённый остаток.</p>}{asset.trades.length ? <div className="table-scroll" tabIndex={0} aria-label="Операции актива"><table><thead><tr><th>Операция / дата</th><th>Количество</th><th>Цена / шт.</th><th>Сумма</th><th>Комиссия</th></tr></thead><tbody>{[...asset.trades].sort(newestTradeFirst).map((trade, index) => <tr key={trade.id || index}><td><span className={`trade-badge ${trade.type}`}>{trade.type === 'buy' ? 'Покупка' : trade.type === 'sell' ? 'Продажа' : trade.type}</span><small>{tradeDate(trade)}{tradeSource(trade) && ` · ${tradeSource(trade)}`}</small></td><td>{number(trade.quantity, 10)}</td><td>{price(trade.unitPrice, trade.currency)}</td><td>{money(trade.total, trade.currency, 2)}</td><td>{feeText(trade)}{trade.feeUnknown && <small>Нет данных</small>}</td></tr>)}</tbody></table></div> : <div className="empty-list">Операций пока нет.</div>}<p className="table-footnote">Даты, суммы и комиссии — из исходных записей. «—» означает отсутствие данных.</p></section>}
        {tab === 'notes' && <div className="detail-notes-grid"><section className="panel note-editor"><div className="panel-heading"><h3><StickyNote size={18}/> Заметка об активе</h3><span>Сохраняется автоматически</span></div><label htmlFor="asset-note" className="sr-only">Заметка</label><textarea id="asset-note" rows={8} value={options.note || ''} onChange={event => onChange({ note: event.target.value })} placeholder="Тезис, наблюдения, план по позиции…"/></section><section className="panel target-editor"><h3><Target size={18}/> Целевая цена</h3><label htmlFor="asset-target">Цена одной единицы, {asset.currency === 'USD' ? '$' : '₽'}</label><input id="asset-target" type="number" min="0" step="any" placeholder="Не задана" value={options.target ?? ''} onChange={event => { const value = event.target.value === '' ? undefined : Number(event.target.value); onChange({ target: value !== undefined && Number.isFinite(value) ? Math.max(0, value) : undefined }); }}/>{target !== null && <dl><div><dt>До цели</dt><dd>{targetDistance === null ? '—' : targetDistance <= 0 ? 'Достигнута' : `${number(targetDistance)}%`}</dd></div><div><dt>Оценка при целевой цене</dt><dd>{money(target * asset.quantity, asset.currency, 2)}</dd></div><div><dt>Результат по остатку при цели</dt><dd className={color(asset.cost === null ? null : target * asset.quantity - asset.cost)}>{signed(asset.cost === null ? null : target * asset.quantity - asset.cost, asset.currency, 2)}</dd></div></dl>}<p className="source-footnote">Личный ориентир. Текущая котировка от этого не меняется.</p></section><p className="local-note">Заметки, цели и закрепления хранятся только в этом браузере.</p></div>}
      </div>
      <footer className="detail-source"><span><i className={`status-dot ${stale(asset.updatedAt) ? 'is-stale' : ''}`}/>{asset.source} · {time(asset.updatedAt, true)}</span><a href={asset.marketUrl} target="_blank" rel="noreferrer">{asset.class === 'crypto' ? 'DropsTab' : 'Steam Market'}<ExternalLink size={14}/></a></footer>
    </aside>
  </div>;
}
