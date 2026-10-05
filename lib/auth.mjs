import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE_NAME = 'vault_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const MAX_AUTH_BODY_BYTES = 8 * 1024;
export function safeLoginDestination(candidate) {
  if (typeof candidate !== 'string' || !candidate) return '/';
  try {
    const parsed = new URL(candidate, 'https://vault.invalid');
    if (parsed.origin !== 'https://vault.invalid' || parsed.pathname.startsWith('//')
      || parsed.pathname.startsWith('/login')) return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}
const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
let loginFailures = 0;
let loginPending = 0;
let loginWindowStart = 0;

function config() {
  const username = process.env.AUTH_USERNAME;
  const passwordHash = process.env.AUTH_PASSWORD_HASH;
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!username || !passwordHash || !secret || Buffer.byteLength(secret) < 32) return null;
  return { username, passwordHash, secret };
}

function parseHash(encoded) {
  const parts = encoded.split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, nText, rText, pText, saltText, digestText] = parts;
  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (N !== 16384 || r !== 8 || p !== 1) return null;
  if (!/^[A-Za-z0-9_-]{22}$/.test(saltText) || !/^[A-Za-z0-9_-]{86}$/.test(digestText)) return null;
  const salt = Buffer.from(saltText, 'base64url');
  const digest = Buffer.from(digestText, 'base64url');
  return salt.length === 16 && digest.length === 64 ? { N, r, p, salt, digest } : null;
}

export async function authenticateCredentials(username, password) {
  const now = Date.now();
  if (!loginWindowStart || now - loginWindowStart >= LOGIN_WINDOW_MS) {
    loginWindowStart = now;
    loginFailures = 0;
  }
  if (loginFailures + loginPending >= MAX_LOGIN_FAILURES) return false;
  loginPending++;
  try {
    const settings = config();
    const parsed = settings && parseHash(settings.passwordHash);
    if (typeof username !== 'string' || typeof password !== 'string' || !settings || !parsed) {
      loginFailures++;
      return false;
    }

    const actualUser = Buffer.from(username);
    const expectedUser = Buffer.from(settings.username);
    const usernameMatches = actualUser.length === expectedUser.length && timingSafeEqual(actualUser, expectedUser);
    const derived = await scrypt(password, parsed.salt, parsed.digest.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: 64 * 1024 * 1024,
    });
    const passwordMatches = timingSafeEqual(Buffer.from(derived), parsed.digest);
    if (!usernameMatches || !passwordMatches) {
      loginFailures++;
      return false;
    }
    loginFailures = 0;
    loginWindowStart = now;
    return true;
  } finally {
    loginPending--;
  }
}

function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest();
}

export function createSessionValue(nowSeconds = Math.floor(Date.now() / 1000)) {
  const settings = config();
  if (!settings) throw new Error('Authentication is not configured');
  const payload = Buffer.from(JSON.stringify({
    sub: settings.username,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_TTL_SECONDS,
  })).toString('base64url');
  const signed = signature(payload, settings.secret).toString('base64url');
  return `${payload}.${signed}`;
}

export function verifySessionValue(value, nowSeconds = Math.floor(Date.now() / 1000)) {
  const settings = config();
  if (!settings || typeof value !== 'string' || value.length > 2048) return false;
  const parts = value.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return false;
  const suppliedSignature = Buffer.from(parts[1], 'base64url');
  const expectedSignature = signature(parts[0], settings.secret);
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return payload && payload.sub === settings.username
      && Number.isSafeInteger(payload.iat) && Number.isSafeInteger(payload.exp)
      && payload.iat <= nowSeconds + 60 && payload.exp > nowSeconds
      && payload.exp - payload.iat === SESSION_TTL_SECONDS;
  } catch {
    return false;
  }
}

export function isAuthenticatedCookie(cookieHeader) {
  if (typeof cookieHeader !== 'string') return false;
  const matches = cookieHeader.split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (matches.length !== 1) return false;
  return verifySessionValue(matches[0].slice(SESSION_COOKIE_NAME.length + 1));
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function createSessionCookie() {
  return { name: SESSION_COOKIE_NAME, value: createSessionValue(), options: sessionCookieOptions() };
}

export function clearSessionCookie() {
  return {
    name: SESSION_COOKIE_NAME,
    value: '',
    options: { ...sessionCookieOptions(), maxAge: 0, expires: new Date(0) },
  };
}

export async function requireSession() {
  const { cookies } = await import('next/headers');
  const { redirect } = await import('next/navigation');
  const jar = await cookies();
  if (!verifySessionValue(jar.get(SESSION_COOKIE_NAME)?.value)) redirect('/login');
}

export function sameOriginRequest(request) {
  const origin = request.headers.get('origin');
  if (!origin || !request.url) return false;
  try {
    const supplied = new URL(origin);
    const target = new URL(request.url);
    const validProtocol = (url) => url.protocol === 'https:' || url.protocol === 'http:';
    const serializedOrigin = !supplied.username && !supplied.password
      && supplied.pathname === '/' && !supplied.search && !supplied.hash;
    return validProtocol(supplied) && validProtocol(target) && serializedOrigin && supplied.origin === target.origin;
  } catch {
    return false;
  }
}

export class RequestBodyError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'RequestBodyError';
    this.status = status;
  }
}

export async function readJsonBodyLimited(request, limit = MAX_AUTH_BODY_BYTES) {
  const lengthHeader = request.headers.get('content-length');
  if (lengthHeader !== null && Number(lengthHeader) > limit) {
    throw new RequestBodyError(413, 'Request body is too large');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || !request.body) {
    throw new RequestBodyError(400, 'Invalid JSON request body');
  }

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        throw new RequestBodyError(413, 'Request body is too large');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400, 'Invalid JSON request body');
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new RequestBodyError(400, 'Invalid JSON request body');
  }
}

// In-memory throttling is intentionally process-wide for this single-admin app.
// Multi-instance deployments should enforce an edge/shared rate limit as well.
export function isLoginRateLimited() {
  return loginFailures + loginPending >= MAX_LOGIN_FAILURES
    && Date.now() - loginWindowStart < LOGIN_WINDOW_MS;
}
