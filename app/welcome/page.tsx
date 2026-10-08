import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, ChartNoAxesCombined, Coins, Gamepad2, Layers3, ListFilter, NotebookPen, ScanLine } from 'lucide-react';
import '../public-pages.css';

export const metadata: Metadata = { title: 'Tracker — капитал в деталях', description: 'Предметы, криптовалюты и сделки в одном пространстве.' };

export default function WelcomePage() {
  return <div className="public-page public-welcome-page">
    <header className="public-header"><Link className="public-brand" href="/welcome"><span><ChartNoAxesCombined size={22}/></span>Tracker</Link><Link className="public-login-link" href="/login">Войти в портфель<ArrowUpRight size={15}/></Link></header>
    <main className="public-welcome-main">
      <section className="public-hero"><div className="public-eyebrow">Личный капитал · три рынка · одна картина</div><h1>Капитал —<br/>в деталях.</h1><p>Понимать свой портфель проще,<br/>когда каждая цифра на своём месте.</p><Link href="/login" className="public-primary-button">Открыть мой портфель<ArrowRight size={18}/></Link></section>
      <section className="welcome-portfolios" aria-label="Рынки портфеля">
        {[{ name: 'CS2', icon: Gamepad2, source: 'Steam Community Market', currency: 'RUB', href: '/cs2', text: 'Кейсы, капсулы, наклейки и другие предметы.' }, { name: 'Sandbox', icon: Layers3, source: 'Steam Community Market', currency: 'RUB', href: '/sandbox', text: 'Предметы инвентаря и история операций.' }, { name: 'Криптовалюты', icon: Coins, source: 'DropsTab', currency: 'USD', href: '/crypto', text: 'Монеты, сделки и ценовая история.' }].map(({ name, icon: Icon, source, currency, href, text }) => <Link className="welcome-portfolio" key={name} href={href}><span className="welcome-icon"><Icon size={24}/></span><h2>{name}<ArrowUpRight size={18}/></h2><p>{text}</p><footer><span>{source}</span><strong>{currency}</strong></footer></Link>)}
      </section>
      <section className="welcome-features"><div><ScanLine size={20}/><h3>Общая картина</h3><p>Стоимость, вложения и результат. Доли каждого портфеля и крупнейшие позиции.</p></div><div><ListFilter size={20}/><h3>Каждый актив подробно</h3><p>Цена единицы, динамика, доходность, покупки, продажи и комиссии.</p></div><div><NotebookPen size={20}/><h3>Ваши ориентиры</h3><p>Закрепляйте важное, записывайте наблюдения и задавайте цели по цене.</p></div></section>
      <footer className="welcome-footer"><span>Реальные котировки. Фактические даты.<br/>Отсутствующие данные всегда обозначены «—».</span><span>Источники цен: Steam Market и DropsTab.<br/>Криптовалюты в общей оценке пересчитываются в RUB.</span></footer>
    </main>
  </div>;
}
