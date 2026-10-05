import { NextResponse } from 'next/server';
import {
  authenticateCredentials,
  createSessionCookie,
  isLoginRateLimited,
  readJsonBodyLimited,
  RequestBodyError,
  sameOriginRequest,
} from '@/lib/auth.mjs';

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return NextResponse.json({ error: 'invalid_request' }, { status: 403 });
  let body: unknown;
  try {
    body = await readJsonBodyLimited(request);
  } catch (error) {
    const status = error instanceof RequestBodyError ? error.status : 400;
    return NextResponse.json({ error: status === 413 ? 'payload_too_large' : 'invalid_request' }, { status });
  }
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  if (typeof record.username !== 'string' || record.username.length > 128
    || typeof record.password !== 'string' || record.password.length > 1024) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const authenticated = await authenticateCredentials(record.username, record.password);
  if (!authenticated) {
    const limited = isLoginRateLimited();
    return NextResponse.json(
      { error: limited ? 'too_many_attempts' : 'invalid_credentials' },
      { status: limited ? 429 : 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  const cookie = createSessionCookie();
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
