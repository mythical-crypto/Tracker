import type { Trade } from './types';

export function tradeDate(trade: Trade): string {
  if (!trade.date) return trade.dateLabel ? `${trade.dateLabel} · год неизвестен` : 'Дата неизвестна';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Astrakhan',
    ...(trade.datePrecision === 'day' ? {} : { hour: '2-digit', minute: '2-digit' }),
  }).format(new Date(trade.date));
}

export function newestTradeFirst(a: Trade, b: Trade): number {
  return (b.date ?? '').localeCompare(a.date ?? '') || (b.monthDay ?? 0) - (a.monthDay ?? 0) || (b.sourceOrder ?? 0) - (a.sourceOrder ?? 0);
}

export function tradeSource(trade: Trade): string {
  return trade.source === 'steam-csv' ? 'CSV Steam' : trade.source === 'user-table' ? 'По таблице · без даты' : trade.source === 'inferred' ? 'Предварительная запись' : '';
}
