import { retainSnapshots } from '../scripts/history.mjs';

export const steamGames = { cs2: { label: 'CS2', appId: '730' }, sandbox: { label: 'Sandbox', appId: '590830' } } as const;
export type SteamGame = keyof typeof steamGames;
export type SteamReference = { game: SteamGame; name: string; groupId?: string };
export type SteamObservation = { at: string; value: number };
export type TrackedItem = SteamReference & {
  revision: string;
  quantity: number | null;
  buyPrice: number | null;
  history: SteamObservation[];
  attemptedAt: string | null;
  error: string | null;
};

export function steamReference(game: SteamGame, input: string): SteamReference {
  let name = input.trim();
  if (/^(?:https?:|[\w.-]+\.[a-z]{2,}\/|\/\/)/i.test(name)) {
    let url: URL;
    try { url = new URL(name.startsWith('steamcommunity.com/') ? 'https://' + name : name); }
    catch { throw new Error('Вставьте ссылку на предмет из торговой площадки Steam.'); }
    const match = url.pathname.match(/^\/market\/listings\/(730|590830)\/([^/]+)\/?$/);
    if (url.origin !== 'https://steamcommunity.com' || url.username || url.password || !match) {
      throw new Error('Подойдёт ссылка Steam Market на предмет CS2 или Sandbox.');
    }
    game = match[1] === '730' ? 'cs2' : 'sandbox';
    try { name = decodeURIComponent(match[2]).trim(); }
    catch { throw new Error('В ссылке повреждено название предмета.'); }
    if (/^G[0-9A-F]+$/i.test(name)) {
      if ([...url.searchParams.keys()].some(key => !['l', 'utm_source', 'utm_medium', 'utm_campaign'].includes(key))) {
        throw new Error('Для выбранного варианта укажите точное рыночное название, включая состояние или тип.');
      }
      return { game, name, groupId: name };
    }
  }
  if (!name || name.length > 240 || /[\u0000-\u001f\u007f]/.test(name) || name.includes('://')) {
    throw new Error('Введите рыночное название предмета длиной до 240 символов.');
  }
  return { game, name };
}

export function steamListing(ref: SteamReference) {
  return 'https://steamcommunity.com/market/listings/' + steamGames[ref.game].appId + '/' + encodeURIComponent(ref.groupId ?? ref.name);
}

export function trackedId(ref: SteamReference) { return ref.game + ':' + ref.name.normalize('NFC').toLowerCase(); }

export function positionInputs(rawQuantity: string, rawPrice: string) {
  const quantity = rawQuantity.trim() === '' ? null : Number(rawQuantity);
  const priceText = rawPrice.trim().replace(',', '.');
  const buyPrice = priceText === '' ? null : Number(priceText);
  if (quantity !== null && (!Number.isSafeInteger(quantity) || quantity < 1)) throw new Error('Количество должно быть целым числом больше нуля.');
  if (buyPrice !== null && (!/^\d+(?:\.\d{1,2})?$/.test(priceText) || !Number.isSafeInteger(Math.round(buyPrice * 100)))) throw new Error('Укажите цену покупки в рублях, с точностью до копеек.');
  if (buyPrice !== null && quantity === null) throw new Error('Укажите количество, чтобы рассчитать результат по цене покупки.');
  return { quantity, buyPrice };
}

export function validObservation(value: unknown): value is SteamObservation {
  if (typeof value !== 'object' || !value) return false;
  const p = value as Partial<SteamObservation>;
  return typeof p.value === 'number' && p.value > 0 && Number.isSafeInteger(Math.round(p.value * 100))
    && typeof p.at === 'string' && Number.isFinite(Date.parse(p.at));
}

export function mergeObservation(history: SteamObservation[], quote: SteamObservation | null, now = Date.now()): SteamObservation[] {
  if (!validObservation(quote) || Date.parse(quote.at) > now || history.some(point => point.at === quote.at)) return history;
  return retainSnapshots([...history, quote], now);
}

export function parseTrackedItems(stored: string | null): TrackedItem[] {
  if (stored === null) return [];
  const rows: unknown = JSON.parse(stored);
  if (!Array.isArray(rows) || !rows.every(row => row && (row.game === 'cs2' || row.game === 'sandbox')
      && typeof row.name === 'string' && row.name.length > 0 && row.name.length <= 240 && typeof row.revision === 'string'
      && (row.quantity === null || Number.isSafeInteger(row.quantity) && row.quantity > 0)
      && (row.buyPrice === null || typeof row.buyPrice === 'number' && Number.isFinite(row.buyPrice) && row.buyPrice >= 0)
      && (row.error === null || typeof row.error === 'string') && (row.attemptedAt === null || typeof row.attemptedAt === 'string' && Number.isFinite(Date.parse(row.attemptedAt)))
      && Array.isArray(row.history) && row.history.every(validObservation))) throw new Error('Не удалось прочитать сохранённые наблюдения.');
  return rows;
}
