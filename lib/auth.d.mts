export const SESSION_COOKIE_NAME: 'vault_session';
export const SESSION_TTL_SECONDS: number;
export const MAX_AUTH_BODY_BYTES: number;
export function safeLoginDestination(candidate: unknown): string;
export function authenticateCredentials(username: unknown, password: unknown): Promise<boolean>;
export function createSessionValue(nowSeconds?: number): string;
export function verifySessionValue(value: unknown, nowSeconds?: number): boolean;
export function isAuthenticatedCookie(cookieHeader: string | null | undefined): boolean;
export function sessionCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
};
export function createSessionCookie(): { name: string; value: string; options: ReturnType<typeof sessionCookieOptions> };
export function clearSessionCookie(): { name: string; value: string; options: ReturnType<typeof sessionCookieOptions> & { maxAge: 0; expires: Date } };
export function requireSession(): Promise<void>;
export function sameOriginRequest(request: Request): boolean;
export function isLoginRateLimited(): boolean;
export class RequestBodyError extends Error {
  status: number;
  constructor(status: number, message: string);
}
export function readJsonBodyLimited(request: Request, limit?: number): Promise<unknown>;
