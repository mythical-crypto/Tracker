import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import {
  authenticateCredentials,
  createSessionCookie,
  createSessionValue,
  isAuthenticatedCookie,
  isLoginRateLimited,
  MAX_AUTH_BODY_BYTES,
  readJsonBodyLimited,
  RequestBodyError,
  sameOriginRequest,
  safeLoginDestination,
  SESSION_TTL_SECONDS,
  verifySessionValue,
} from '../lib/auth.mjs';

const testSalt = randomBytes(16);
test('login destination stays local after URL normalization', () => {
  for (const candidate of [undefined, '//example.com', 'https://example.com', 'https://vault.invalid//example.com', '/.//example.com', '/login?next=/cs2', '/\\example.com']) {
    assert.equal(safeLoginDestination(candidate), '/');
  }
  assert.equal(safeLoginDestination('/cs2?view=list#history'), '/cs2?view=list#history');
  assert.equal(safeLoginDestination('https://vault.invalid/crypto'), '/crypto');
});
const testDigest = scryptSync('test-only-password', testSalt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
process.env.AUTH_USERNAME = 'test-admin';
process.env.AUTH_PASSWORD_HASH = `scrypt:16384:8:1:${testSalt.toString('base64url')}:${testDigest.toString('base64url')}`;
process.env.AUTH_SESSION_SECRET = randomBytes(48).toString('base64url');

test('credentials authenticate without storing the password in configuration', async () => {
  assert.equal(await authenticateCredentials('test-admin', 'test-only-password'), true);
  assert.equal(await authenticateCredentials('wrong-user', 'test-only-password'), false);
  assert.equal(await authenticateCredentials('test-admin', 'wrong-password'), false);
});

test('HMAC session is accepted until expiry and rejects tampering', () => {
  const now = 1_800_000_000;
  const value = createSessionValue(now);
  assert.equal(verifySessionValue(value, now), true);
  assert.equal(verifySessionValue(value, now + SESSION_TTL_SECONDS), false);
  const [payload, signature] = value.split('.');
  const tampered = `${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  assert.equal(verifySessionValue(tampered, now), false);
  assert.equal(verifySessionValue('malformed', now), false);
});

test('cookie parsing rejects duplicates and cookie is HttpOnly, SameSite Lax', () => {
  const cookie = createSessionCookie();
  assert.equal(isAuthenticatedCookie(`${cookie.name}=${cookie.value}`), true);
  assert.equal(isAuthenticatedCookie(`${cookie.name}=${cookie.value}; ${cookie.name}=tampered`), false);
  assert.equal(cookie.options.httpOnly, true);
  assert.equal(cookie.options.sameSite, 'lax');
  assert.equal(cookie.options.secure, false);
});

test('same-origin guard compares Origin host and rejects absent or foreign origins', () => {
  assert.equal(sameOriginRequest(new Request('http://localhost:3000/api/auth/login', {
    method: 'POST', headers: { origin: 'http://localhost:3000' },
  })), true);
  assert.equal(sameOriginRequest(new Request('http://localhost:3000/api/auth/login', {
    method: 'POST', headers: { origin: 'http://attacker.example' },
  })), false);
  assert.equal(sameOriginRequest(new Request('http://localhost:3000/api/auth/login', {
    method: 'POST', headers: {},
  })), false);
  assert.equal(sameOriginRequest(new Request('https://vault.example/api/auth/login', {
    method: 'POST', headers: { origin: 'http://vault.example' },
  })), false);
  assert.equal(sameOriginRequest(new Request('https://vault.example/api/auth/login', {
    method: 'POST', headers: { origin: 'https://vault.example' },
  })), true);
});

function chunkedRequest(chunks, headers = {}) {
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Request('http://localhost:3000/api/auth/login', {
    method: 'POST', headers, body, duplex: 'half',
  });
}

test('bounded JSON reader accepts chunked and exact-limit bodies without Content-Length', async () => {
  const json = JSON.stringify({ username: 'admin', password: 'test' });
  const parsed = await readJsonBodyLimited(chunkedRequest([
    Buffer.from(json.slice(0, 9)),
    Buffer.from(json.slice(9)),
  ]));
  assert.deepEqual(parsed, { username: 'admin', password: 'test' });

  const exactBytes = Buffer.from(`${json}${' '.repeat(MAX_AUTH_BODY_BYTES - Buffer.byteLength(json))}`);
  assert.equal(exactBytes.byteLength, MAX_AUTH_BODY_BYTES);
  assert.deepEqual(await readJsonBodyLimited(chunkedRequest([exactBytes])), { username: 'admin', password: 'test' });
});

test('bounded JSON reader rejects oversized streamed bodies and invalid UTF-8', async () => {
  const tooLarge = new Uint8Array(MAX_AUTH_BODY_BYTES + 1).fill(0x20);
  await assert.rejects(readJsonBodyLimited(chunkedRequest([tooLarge])), (error) => {
    assert.ok(error instanceof RequestBodyError);
    assert.equal(error.status, 413);
    return true;
  });
  await assert.rejects(readJsonBodyLimited(chunkedRequest([Uint8Array.of(0xff)])), (error) => {
    assert.ok(error instanceof RequestBodyError);
    assert.equal(error.status, 400);
    return true;
  });
});

test('concurrent login attempts reserve the shared five-attempt budget before scrypt', async () => {
  const attempts = Array.from({ length: 20 }, () => authenticateCredentials('test-admin', 'wrong-password'));
  assert.equal(isLoginRateLimited(), true);
  assert.deepEqual(await Promise.all(attempts), Array(20).fill(false));
  assert.equal(isLoginRateLimited(), true);
});

test('missing or weak configuration fails closed', () => {
  const secret = process.env.AUTH_SESSION_SECRET;
  delete process.env.AUTH_SESSION_SECRET;
  assert.equal(verifySessionValue('anything', 1_800_000_000), false);
  assert.throws(() => createSessionValue(), /not configured/);
  process.env.AUTH_SESSION_SECRET = 'too-short';
  assert.equal(verifySessionValue('anything'), false);
  process.env.AUTH_SESSION_SECRET = secret;
});
