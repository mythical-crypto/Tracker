import { NextResponse } from 'next/server';
import { clearSessionCookie, sameOriginRequest } from '@/lib/auth.mjs';

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return NextResponse.json({ error: 'invalid_request' }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  const cookie = clearSessionCookie();
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
