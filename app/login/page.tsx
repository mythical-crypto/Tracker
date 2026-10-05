import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE_NAME, verifySessionValue, safeLoginDestination } from '@/lib/auth.mjs';
import LoginForm from './login-form';

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  const jar = await cookies();
  if (verifySessionValue(jar.get(SESSION_COOKIE_NAME)?.value)) redirect('/');
  const params = await searchParams;
  const candidate = Array.isArray(params.next) ? params.next[0] : params.next;
  const destination = safeLoginDestination(candidate);

  return (
    <main className="vault-login">
      <section className="login-card" aria-labelledby="login-title">
        <p className="login-eyebrow">PRIVATE VAULT</p>
        <h1 id="login-title">Вход в портфель</h1>
        <p className="login-description">Введите учётные данные, чтобы продолжить.</p>
        <LoginForm destination={destination} />
      </section>
    </main>
  );
}
