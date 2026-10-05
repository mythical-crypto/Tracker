import { gzip as gzipCallback } from 'node:zlib';
import { promisify } from 'node:util';

const gzip = promisify(gzipCallback);
// Leave headroom below Vercel's 4.5 MB response payload limit.
export const MAX_RESPONSE_BYTES = 4_000_000;
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', Vary: 'Accept-Encoding' };

function acceptsGzip(value: string | null): boolean {
  const encodings = (value ?? '').toLowerCase().split(',').map(part => {
    const [encoding, ...parameters] = part.trim().split(';');
    const quality = parameters.map(p => p.trim()).find(p => p.startsWith('q='))?.slice(2) ?? '1';
    const q = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(quality) ? Number(quality) : 0;
    return { encoding: encoding.trim(), q };
  });
  const explicit = encodings.find(e => e.encoding === 'gzip');
  return (explicit?.q ?? encodings.find(e => e.encoding === '*')?.q ?? 0) > 0;
}

export async function portfolioJsonResponse(data: unknown, acceptEncoding: string | null): Promise<Response> {
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  if (acceptsGzip(acceptEncoding) && json.byteLength >= 16_384) {
    const compressed = await gzip(json);
    if (compressed.byteLength <= MAX_RESPONSE_BYTES) {
      return new Response(new Uint8Array(compressed), { headers: { ...headers, 'Content-Encoding': 'gzip' } });
    }
    return Response.json({ error: 'portfolio_too_large', message: 'Полная история превышает допустимый размер ответа. Сохранённый снимок не изменён.' }, { status: 503, headers });
  }
  if (json.byteLength > MAX_RESPONSE_BYTES) {
    return Response.json({ error: 'compression_required', message: 'Для полной истории требуется поддержка gzip. Данные не сокращены.' }, { status: 406, headers });
  }
  return new Response(new Uint8Array(json), { headers });
}

export async function authorizedPortfolioResponse(request: Request, authenticate: (cookie: string | null) => boolean, load: () => Promise<unknown>): Promise<Response> {
  if (!authenticate(request.headers.get('cookie'))) {
    return Response.json({ error: 'Требуется вход' }, { status: 401, headers });
  }
  return portfolioJsonResponse(await load(), request.headers.get('accept-encoding'));
}
