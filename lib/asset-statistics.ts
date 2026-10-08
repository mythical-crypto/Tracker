import type { Asset } from './types';

/** Native-currency accounting. Ledger totals take precedence over partial trade history. */
export function assetStatistics(asset: Asset) {
  const buys = asset.trades.filter(trade => trade.type === 'buy');
  const sells = asset.trades.filter(trade => trade.type === 'sell');
  const hasHistory = asset.trades.length > 0 || asset.accounting !== undefined;
  const value = asset.quantity === 0 ? 0 : asset.price === null ? null : asset.price * asset.quantity;
  const pnl = value === null || asset.cost === null ? null : value - asset.cost;
  const basis = asset.cost !== null && asset.quantity > 0 ? asset.cost / asset.quantity : null;
  return {
    value, pnl, basis,
    roi: pnl !== null && asset.cost !== null && asset.cost > 0 ? pnl / asset.cost * 100 : null,
    hasHistory,
    boughtQuantity: asset.accounting?.boughtQuantity ?? (hasHistory ? buys.reduce((sum, trade) => sum + trade.quantity, 0) : null),
    soldQuantity: asset.accounting?.soldQuantity ?? (hasHistory ? sells.reduce((sum, trade) => sum + trade.quantity, 0) : null),
    buyTotal: asset.accounting?.buyCost ?? (hasHistory ? buys.reduce((sum, trade) => sum + trade.total, 0) : null),
    sellTotal: asset.accounting?.soldTotal ?? (hasHistory ? sells.reduce((sum, trade) => sum + trade.total, 0) : null),
    buyCount: buys.length, sellCount: sells.length,
    unknownFees: asset.trades.filter(trade => trade.feeUnknown).length,
    unknownDates: asset.trades.filter(trade => !trade.date).length,
    totalResult: asset.quantity === 0 ? asset.realized : pnl !== null && asset.realized !== null ? pnl + asset.realized : null,
  };
}
