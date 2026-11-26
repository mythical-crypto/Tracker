import { isAuthenticatedCookie } from '@/lib/auth.mjs';
import { trackedSteamQuote } from '@/lib/tracked-steam-quote';

export const runtime = 'nodejs';

export function GET(request: Request) {
  return trackedSteamQuote(request, isAuthenticatedCookie(request.headers.get('cookie')));
}
