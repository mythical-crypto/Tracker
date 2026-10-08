'use client';

import { useState } from 'react';
import { Boxes } from 'lucide-react';
import type { Asset, Currency, Trade } from '@/lib/types';

export const money = (value: number | null | undefined, currency: Currency = 'RUB', digits = 0) => value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
export const number = (value: number, digits = 2) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
export const countLabel = (value: number, forms: [string, string, string]) => `${value} ${forms[value % 100 >= 11 && value % 100 <= 14 ? 2 : value % 10 === 1 ? 0 : value % 10 >= 2 && value % 10 <= 4 ? 1 : 2]}`;
export const price = (value: number | null, currency: Currency) => value === null ? '—' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: currency === 'USD' ? Math.min(16, Math.max(4, 3 - Math.floor(Math.log10(Math.abs(value) || 1)))) : 2 }).format(value);
export const pct = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${number(value, 2)}%`;
export const signed = (value: number | null, currency: Currency = 'RUB', digits = 0) => value === null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value), currency, digits)}`;
export const color = (value: number | null) => value === null || value === 0 ? '' : value > 0 ? 'positive' : 'negative';
export const time = (at: string | null | undefined, full = false) => at && Number.isFinite(Date.parse(at)) ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', ...(full ? { year: 'numeric' as const } : {}), hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Astrakhan' }).format(new Date(at)) : 'Дата неизвестна';
export const stale = (at: string | null) => !at || !Number.isFinite(Date.parse(at)) || Date.now() - Date.parse(at) > 3600000;
export const feeText = (t: Trade) => t.feeUnknown ? '—' : t.feeType === 'PERCENT' ? `${number(t.fee, 6)}%` : t.feeQuantity !== undefined ? `${number(t.feeQuantity, 10)} ${t.feeCurrency || t.currency}` : `${number(t.fee, 8)} ${t.feeCurrency || (t.currency === 'RUB' ? '₽' : '$')}`;
export const classNames = { cs2: 'CS2', sandbox: 'Sandbox', crypto: 'Криптовалюты' };
export type AssetOptions = { pinned?: boolean; note?: string; target?: number };

export function AssetImage({ asset }: { asset: Asset }) {
  const [failed, setFailed] = useState(false);
  return <span className={`asset-image ${asset.class}`}>{asset.icon && !failed ? <img src={asset.icon} alt="" loading="lazy" onError={() => setFailed(true)} /> : asset.symbol ? <b>{asset.symbol.slice(0, 2)}</b> : <Boxes size={20}/>}</span>;
}
