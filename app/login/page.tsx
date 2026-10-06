import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE_NAME, verifySessionValue, safeLoginDestination } from '@/lib/auth.mjs';
import LoginForm from './login-form';
import Link from 'next/link';
import '../public-pages.css';

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  const jar = await cookies();
  if (verifySessionValue(jar.get(SESSION_COOKIE_NAME)?.value)) redirect('/');
  const params = await searchParams;
  const candidate = Array.isArray(params.next) ? params.next[0] : params.next;
  const destination = safeLoginDestination(candidate);

  return (
    <div className="public-page public-login-page">
      <header className="public-header public-login-header">
        <Link className="public-brand" href="/welcome">Tracker</Link>
      </header>
      <main className="public-login-main">
        <section className="public-login-panel" aria-labelledby="login-title">
          <h1 id="login-title">Вход в портфель</h1>
          <LoginForm destination={destination} />
        </section>
      </main>
    </div>
  );
}
