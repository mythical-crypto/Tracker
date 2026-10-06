import { assetPnl, convert } from './calculations.ts';
import type { Asset } from './types';

export type AssetSort = 'value' | 'price' | 'cost' | 'average' | 'pnl' | 'roi' | 'name' | 'quantity' | 'change0' | 'change1' | 'change2';
export type SortDirection = 'asc' | 'desc';

export function compareAssets(a: Asset, b: Asset, key: AssetSort, direction: SortDirection, usdRub: number | null, native = false, changes?: Map<string, (number | null)[]>) {
  const amount = (value: number | null, asset: Asset) => native ? value : convert(value, asset.currency, usdRub);
  const metric = (asset: Asset): number | null => {
    if (key === 'quantity') return asset.quantity;
    if (key === 'pnl') return assetPnl(asset, usdRub, native);
    if (key === 'roi') return asset.cost !== null && asset.cost > 0 && asset.price !== null ? (asset.price * asset.quantity - asset.cost) / asset.cost * 100 : null;
    if (key.startsWith('change')) return changes?.get(asset.id)?.[Number(key.slice(-1))] ?? null;
    return amount(key === 'price' ? asset.price : key === 'average' ? asset.averageBuyPrice : key === 'cost' ? asset.cost : asset.price === null ? null : asset.price * asset.quantity, asset);
  };
  const tie = () => a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id);
  if (key === 'name') return tie() * (direction === 'asc' ? 1 : -1);
  const x = metric(a), y = metric(b);
  const unknownX = x === null || !Number.isFinite(x), unknownY = y === null || !Number.isFinite(y);
  // Missing prices and costs always stay at the bottom, in either direction.
  if (unknownX || unknownY) return unknownX === unknownY ? tie() : unknownX ? 1 : -1;
  return (x! - y!) * (direction === 'asc' ? 1 : -1) || tie();
}
