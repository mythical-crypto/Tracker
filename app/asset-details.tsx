'use client';

import { useMemo, useRef, useState, type RefObject } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, ExternalLink, Info, Minus, Pin, X } from 'lucide-react';
import type { Asset, Snapshot } from '@/lib/types';
import { assetStatistics } from '@/lib/asset-statistics';
import { convert } from '@/lib/calculations';
import { marketMovers, type MarketPeriod } from '@/lib/market-movers';
import { newestTradeFirst, tradeDate, tradeSource, tradeLabel } from '@/lib/trades';
import HistoryChart from './history-chart';
import { AssetImage, type AssetOptions, classNames, money, number, price, pct, signed, color, time, stale, feeText } from './portfolio-ui';
import './asset-details.css';

type Props = {
  asset: Asset;
  snapshots: Snapshot[];
  options: AssetOptions;
  share: number | null;
  initialPeriod?: string;
  marketPeriod?: MarketPeriod;
  usdRub: number | null;
  fxUpdatedAt: string | null;
  closeRef: RefObject<HTMLButtonElement | null>;
  dialogRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onChange: (options: AssetOptions) => void;
};

const tabs = [['price', 'Цена'], ['position', 'Позиция'], ['trades', 'Операции'], ['notes', 'Заметка и цель']] as const;
const movementLabels = {
  latest: 'К предыдущему замеру',
  1: 'Изменение за 24 часа',
  7: 'Изменение за 7 дней',
  30: 'Изменение за 30 дней',
};

export default function AssetDetails({ asset, snapshots, options, share, initialPeriod, marketPeriod = 'latest', usdRub, fxUpdatedAt, closeRef, dialogRef, onClose, onChange }: Props) {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('price');
  const bodyRef = useRef<HTMLDivElement>(null);
  const movement = useMemo(
    () => marketMovers([asset], new Map([[asset.id, snapshots]]), marketPeriod)[0],
    [asset, snapshots, marketPeriod],
  );
  const move = movement?.absolute;
  const MoveIcon = move === undefined || move === 0 ? Minus : move < 0 ? ArrowDownRight : ArrowUpRight;
  const quoteAt = asset.updatedAt && Number.isFinite(Date.parse(asset.updatedAt)) ? asset.updatedAt : null;
  const savedQuote = quoteAt !== null && stale(quoteAt);

  return (
    <div className="asset-sheet-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="asset-sheet" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="asset-detail-title">
        <header className="asset-sheet-header">
          <AssetImage asset={asset} />
          <div className="asset-sheet-identity">
            <span>{classNames[asset.class]} · {asset.symbol || asset.category}</span>
            <h2 id="asset-detail-title">{asset.name}</h2>
          </div>
          <div className="asset-sheet-actions">
            <button type="button" aria-label={options.pinned ? 'Открепить актив' : 'Закрепить актив'} aria-pressed={Boolean(options.pinned)} onClick={() => onChange({ pinned: !options.pinned })}><Pin size={19} aria-hidden="true" /></button>
            <button type="button" ref={closeRef} aria-label="Закрыть детали" onClick={onClose}><X size={22} aria-hidden="true" /></button>
          </div>
        </header>

        <div className="asset-sheet-tabs" role="group" aria-label="Разделы карточки">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={tab === id} onClick={() => {
              if (tab === id) return;
              setTab(id);
              bodyRef.current?.scrollTo({ top: 0 });
            }}>
              {label}{id === 'notes' && options.note && <span aria-hidden="true" />}
            </button>
          ))}
        </div>

        <div className="asset-sheet-body" ref={bodyRef}>
          <div className="asset-sheet-price-tab" hidden={tab !== 'price'}>
            <section className="asset-sheet-quote" aria-label="Последняя котировка">
              <div>
                <span className="asset-sheet-label">Цена за единицу · {asset.currency}</span>
                <strong className="asset-sheet-amount">{price(asset.price, asset.currency)}</strong>
                <p className="asset-sheet-subtle">
                  {asset.price === null ? 'Котировка недоступна' : quoteAt ? (
                    <>{savedQuote ? 'Сохранённая котировка от ' : 'Котировка от '}<time dateTime={quoteAt}>{time(quoteAt, true)}</time></>
                  ) : 'Дата котировки неизвестна'}
                </p>
              </div>
              <div className="asset-sheet-movement">
                <span className="asset-sheet-label">{movementLabels[marketPeriod]}</span>
                {movement ? (
                  <>
                    <p className={`asset-sheet-change ${color(movement.absolute)}`}>
                      <MoveIcon size={20} aria-hidden="true" />
                      <strong>{pct(movement.percent)}</strong>
                      {movement.absolute !== 0 && <span>{movement.absolute < 0 ? '−' : '+'}{price(Math.abs(movement.absolute), asset.currency)}</span>}
                    </p>
                    <p className="asset-sheet-subtle asset-sheet-dates">
                      <time dateTime={movement.before.at}>{time(movement.before.at)}</time> →
                      {' '}<time dateTime={movement.after.at}>{time(movement.after.at)}</time>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="asset-sheet-change"><strong>—</strong></p>
                    <p className="asset-sheet-subtle">Недостаточно сопоставимых котировок</p>
                  </>
                )}
              </div>
            </section>
            <section className="asset-sheet-card asset-sheet-chart">
              <HistoryChart snapshots={snapshots} currency={asset.currency} title="История цены" initialPeriod={initialPeriod} unitPrice compact />
              {asset.priceHistoryStatus && (
                <details className="asset-sheet-disclosure">
                  <summary>Доступность ценовой истории <ChevronDown size={17} aria-hidden="true" /></summary>
                  <p className="asset-sheet-hint">{asset.priceHistoryStatus}</p>
                </details>
              )}
            </section>
          </div>

          {tab === 'position' && <AssetPosition asset={asset} share={share} usdRub={usdRub} fxUpdatedAt={fxUpdatedAt} />}
          {tab === 'trades' && <AssetOperations asset={asset} />}
          {tab === 'notes' && <AssetNotes asset={asset} options={options} onChange={onChange} />}
        </div>

        <footer className="asset-sheet-source">
          <span>{asset.source}</span>
          {asset.marketUrl && <a href={asset.marketUrl} target="_blank" rel="noreferrer">К источнику <ExternalLink size={15} aria-hidden="true" /></a>}
        </footer>
      </aside>
    </div>
  );
}

function AssetPosition({ asset, share, usdRub, fxUpdatedAt }: Pick<Props, 'asset' | 'share' | 'usdRub' | 'fxUpdatedAt'>) {
  const stats = assetStatistics(asset);
  const closed = asset.quantity === 0;
  const rubValue = asset.currency === 'USD' && usdRub !== null && usdRub > 0 && Number.isFinite(usdRub) && fxUpdatedAt && Number.isFinite(Date.parse(fxUpdatedAt))
    ? convert(stats.value, asset.currency, usdRub) : null;
  const unit = asset.symbol || 'шт.';
  const sold = stats.soldQuantity === null ? '—' : `${number(stats.soldQuantity, 10)} ${unit}`;

  return (
    <section className="asset-sheet-card">
      <h3>Моя позиция</h3>
      <dl className="asset-sheet-position-summary">
        <div>
          <dt className="asset-sheet-label">{closed ? 'Результат продаж' : 'Стоимость позиции'}</dt>
          <dd>
            <strong className={closed ? color(asset.realized) : ''}>{closed ? signed(asset.realized, asset.currency, 2) : money(stats.value, asset.currency, 2)}</strong>
            {!closed && rubValue !== null && <span>≈ {money(rubValue, 'RUB', 2)}</span>}
          </dd>
        </div>
        <div>
          <dt className="asset-sheet-label">{closed ? 'Продано' : 'Нереализованный результат'}</dt>
          <dd>
            <strong className={closed ? '' : color(stats.pnl)}>{closed ? sold : signed(stats.pnl, asset.currency, 2)}</strong>
            {!closed && stats.roi !== null && <span className={color(stats.roi)}>{pct(stats.roi)}</span>}
            {!closed && stats.pnl === null && <span>{asset.cost === null ? 'Себестоимость неизвестна' : 'Котировка недоступна'}</span>}
          </dd>
        </div>
      </dl>
      <dl className="asset-sheet-ledger">
        {!closed && <div><dt>Количество</dt><dd>{number(asset.quantity, asset.class === 'crypto' ? 10 : 2)} {unit}</dd></div>}
        {closed && <div><dt>Сумма продаж</dt><dd>{money(stats.sellTotal, asset.currency, 2)}</dd></div>}
        {!closed && <div><dt>Вложено в остаток</dt><dd>{money(asset.cost, asset.currency, 2)}</dd></div>}
        {!closed && <div><dt>Средняя цена покупки</dt><dd>{price(asset.averageBuyPrice, asset.currency)}</dd></div>}
      </dl>
      {asset.historyIncomplete && <p className="asset-sheet-hint"><Info size={17} aria-hidden="true" />История операций частичная. Остаток и себестоимость взяты из исходного учёта.</p>}
      <details className="asset-sheet-disclosure">
        <summary>Расчёт позиции <ChevronDown size={17} aria-hidden="true" /></summary>
        <dl className="asset-sheet-ledger">
          <div><dt>Доля в оценённой части портфеля</dt><dd>{share === null ? '—' : `${number(share)}%`}</dd></div>
          <div><dt>Себестоимость за единицу</dt><dd>{price(stats.basis, asset.currency)}</dd></div>
          {!closed && <div><dt>Результат продаж</dt><dd className={color(asset.realized)}>{signed(asset.realized, asset.currency, 2)}</dd></div>}
          <div><dt>Общий результат</dt><dd className={color(stats.totalResult)}>{signed(stats.totalResult, asset.currency, 2)}</dd></div>
          {rubValue !== null && fxUpdatedAt && <div><dt>Курс DropsTab от <time dateTime={fxUpdatedAt}>{time(fxUpdatedAt, true)}</time></dt><dd>{money(usdRub, 'RUB', 2)} за $1</dd></div>}
        </dl>
        <p className="asset-sheet-hint">Общий результат складывается из результата по остатку и результата продаж. {asset.class === 'crypto' ? 'Расчёт в USD.' : 'Рыночная оценка до комиссии Steam.'}</p>
      </details>
    </section>
  );
}

function AssetOperations({ asset }: Pick<Props, 'asset'>) {
  const stats = assetStatistics(asset);
  const trades = [...asset.trades].sort(newestTradeFirst);
  const datedTrades = trades.filter(trade => trade.date && Number.isFinite(Date.parse(trade.date)));
  const firstBuy = datedTrades.findLast(trade => trade.type === 'buy' && trade.purpose !== 'AIRDROP');
  const latestTrade = datedTrades[0];
  const unit = asset.symbol || 'шт.';

  return (
    <section className="asset-sheet-card">
      <h3>История операций</h3>
      {asset.historyIncomplete && <p className="asset-sheet-hint"><Info size={17} aria-hidden="true" />История операций частичная.</p>}
      {trades.length ? (
        <div className="asset-sheet-table" tabIndex={0} aria-label="Операции актива">
          <table>
            <thead><tr><th scope="col">Операция и дата</th><th scope="col">Количество</th><th scope="col">Цена за ед.</th><th scope="col">Сумма</th><th scope="col">Комиссия</th></tr></thead>
            <tbody>
              {trades.map((trade, index) => {
                const source = tradeSource(trade);
                return (
                  <tr key={trade.id || index}>
                    <td><span className={`trade-badge ${trade.type}`}>{tradeLabel(trade)}</span><small>{tradeDate(trade)}{source && ` · ${source}`}</small></td>
                    <td>{number(trade.quantity, 10)}</td>
                    <td>{price(trade.unitPrice, trade.currency)}{trade.purpose === 'AIRDROP' && <small>Оценка источника</small>}</td>
                    <td>{money(trade.total, trade.currency, 2)}</td>
                    <td>{feeText(trade)}{trade.feeUnknown && <small>Нет данных</small>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="asset-sheet-hint">Операций пока нет.</p>}
      {stats.hasHistory && (
        <details className="asset-sheet-disclosure">
          <summary>Объём покупок и продаж <ChevronDown size={17} aria-hidden="true" /></summary>
          <dl className="asset-sheet-ledger">
            <div><dt>Куплено</dt><dd>{stats.boughtQuantity === null ? '—' : `${number(stats.boughtQuantity, 10)} ${unit}`} · {money(stats.buyTotal, asset.currency, 2)}</dd></div>
            <div><dt>Продано</dt><dd>{stats.soldQuantity === null ? '—' : `${number(stats.soldQuantity, 10)} ${unit}`} · {money(stats.sellTotal, asset.currency, 2)}</dd></div>
            {stats.airdropCount > 0 && <div><dt>Получено через Airdrop</dt><dd>{number(stats.airdroppedQuantity, 10)} {unit}</dd></div>}
            <div><dt>Первая датированная покупка</dt><dd>{firstBuy ? tradeDate(firstBuy) : '—'}</dd></div>
            <div><dt>Последняя датированная операция</dt><dd>{latestTrade ? tradeDate(latestTrade) : '—'}</dd></div>
          </dl>
          {(stats.unknownFees > 0 || stats.unknownDates > 0) && <p className="asset-sheet-hint">{stats.unknownFees > 0 && `Без данных комиссии: ${stats.unknownFees}. `}{stats.unknownDates > 0 && `Без даты: ${stats.unknownDates}.`}</p>}
        </details>
      )}
    </section>
  );
}

function AssetNotes({ asset, options, onChange }: Pick<Props, 'asset' | 'options' | 'onChange'>) {
  const target = options.target && Number.isFinite(options.target) && options.target > 0 ? options.target : null;
  const targetDistance = target !== null && asset.price !== null && asset.price > 0 ? (target / asset.price - 1) * 100 : null;
  const targetPnl = target !== null && asset.cost !== null ? target * asset.quantity - asset.cost : null;

  return (
    <div className="asset-sheet-notes">
      <section className="asset-sheet-card">
        <h3><label htmlFor="asset-note">Заметка</label></h3>
        <textarea id="asset-note" rows={7} value={options.note || ''} onChange={event => onChange({ note: event.target.value })} placeholder="План по позиции или наблюдение" />
      </section>
      <section className="asset-sheet-card">
        <h3>Целевая цена</h3>
        <label htmlFor="asset-target" className="asset-sheet-label">Цена за единицу · {asset.currency}</label>
        <input id="asset-target" type="number" min="0" step="any" placeholder="Не задана" value={options.target ?? ''} onChange={event => {
          const value = event.target.value === '' ? undefined : Number(event.target.value);
          onChange({ target: value !== undefined && Number.isFinite(value) ? Math.max(0, value) : undefined });
        }} />
        {target !== null && (
          <>
            <p className="asset-sheet-hint">{targetDistance === null ? 'Текущая котировка недоступна' : targetDistance <= 0 ? 'Цель достигнута' : `До цели ${number(targetDistance)}%`}</p>
            <details className="asset-sheet-disclosure">
              <summary>Позиция при целевой цене <ChevronDown size={17} aria-hidden="true" /></summary>
              <dl className="asset-sheet-ledger">
                <div><dt>Стоимость</dt><dd>{money(target * asset.quantity, asset.currency, 2)}</dd></div>
                <div><dt>Результат по остатку</dt><dd className={color(targetPnl)}>{signed(targetPnl, asset.currency, 2)}</dd></div>
              </dl>
            </details>
          </>
        )}
      </section>
      <p className="asset-sheet-hint">Заметки, цели и закрепления сохраняются в этом браузере.</p>
    </div>
  );
}
