import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE_NAME, verifySessionValue, safeLoginDestination } from '@/lib/auth.mjs';
import LoginForm from './login-form';
import Link from 'next/link';
import { ChartNoAxesCombined, LockKeyhole, ArrowUpRight } from 'lucide-react';
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
      <aside className="login-story">
        <Link className="public-brand" href="/welcome"><span><ChartNoAxesCombined size={23}/></span>Tracker</Link>
        <div><span className="public-eyebrow">Личное пространство инвестора</span><h2>Ваш капитал.<br/>Ясная картина.</h2><p>Предметы, монеты и сделки —<br/>в одном спокойном пространстве.</p><div className="login-markets"><span>CS2</span><span>Sandbox</span><span>Криптовалюты</span></div></div>
        <footer><span>Steam Market · RUB<br/>DropsTab · USD</span><Link href="/welcome">О трекере <ArrowUpRight size={15}/></Link></footer>
      </aside>
      <main className="public-login-main">
        <section className="public-login-panel" aria-labelledby="login-title">
          <span className="login-lock"><LockKeyhole size={22}/></span>
          <div className="public-eyebrow">С возвращением</div><h1 id="login-title">Вход в портфель</h1><p className="login-description">Всё готово к вашему следующему взгляду на цифры.</p>
          <LoginForm destination={destination} />
          <p className="login-privacy"><LockKeyhole size={12}/> Доступ только по вашему логину и паролю</p>
        </section>
      </main>
    </div>
  );
}
