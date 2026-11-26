import { fetchSteamPrice } from '../scripts/extra-sources.mjs';
import { steamGames, steamListing, steamReference, type SteamReference } from './tracked-items.ts';

const headers = { 'Cache-Control': 'private, no-store' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

function listingName(html: string): string | null {
  const match = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  const title = match?.[1].replace(/(?: - | :: )Steam Community Market$/i, '').replace(/^Steam Community Market :: /i, '').trim();
  if (!title) return null;
  const name = title.replace(/&quot;/g, '"').replace(/&#(?:39|x27);|&apos;/gi, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  // A group can include many finishes. Only use its title if Steam also lists that exact market hash.
  const field = '"market_hash_name":' + JSON.stringify(name);
  if (name.length > 240 || !(html.includes(field) || html.includes(JSON.stringify(field).slice(1, -1)))) return null;
  return name;
}

export async function trackedSteamQuote(request: Request, authenticated: boolean, fetcher = fetch, clock = () => new Date().toISOString()) {
  if (!authenticated) return json({ error: 'Требуется вход.' }, 401);
  const params = new URL(request.url).searchParams;
  const game = params.get('game');
  const input = params.get('item') ?? '';
  if ((game !== 'cs2' && game !== 'sandbox') || input.length > 1600) return json({ error: 'Некорректная игра или название.' }, 400);
  let ref: SteamReference;
  try { ref = steamReference(game, input); }
  catch (error) { return json({ error: (error as Error).message }, 400); }
  const fetchSteam = async (url: URL | string) => {
    const response = await fetcher(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8500), headers: { 'Accept-Language': 'en', 'User-Agent': 'Tracker/1.0 (personal portfolio)' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response;
  };
  try {
    if (ref.groupId) {
      const name = listingName(await (await fetchSteam(steamListing(ref))).text());
      if (!name) return json({ error: 'У этой карточки несколько вариантов или название недоступно. Введите точное рыночное название из Steam.' }, 422);
      ref = { game: ref.game, name };
    }
    const price = await fetchSteamPrice(ref.name, { appid: steamGames[ref.game].appId, fetchSource: async (url: URL) => (await fetchSteam(url)).json() });
    return json({ game: ref.game, name: ref.name, currency: 'RUB', quote: { at: clock(), value: price } });
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    const message = reason.includes('429') ? 'Steam ограничил частоту запросов. Попробуйте позже.'
      : reason.startsWith('Steam не подтвердил') ? 'В Steam нет подтверждённой цены в рублях. Проверьте точное название и наличие предложений.'
      : 'Steam сейчас не вернул котировку. Попробуйте обновить позже.';
    return json({ error: message, ...(ref.groupId ? {} : { game: ref.game, name: ref.name }) }, 503);
  }
}
