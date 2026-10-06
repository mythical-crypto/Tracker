import type { Metadata } from 'next';
import Link from 'next/link';
import '../public-pages.css';

export const metadata: Metadata = {
  title: 'Tracker — все инвестиции в цифрах',
  description: 'Стоимость, сделки и результат в одном портфеле.',
};

// Изолированный пример интерфейса. Рабочие данные портфеля здесь не загружаются.
const demoPortfolios = [
  { name: 'CS2', href: '/cs2', invested: '170 000 ₽', value: '195 000 ₽', result: '+25 000 ₽', percent: '+14,71%' },
  { name: 'Sandbox', href: '/sandbox', invested: '70 000 ₽', value: '81 000 ₽', result: '+11 000 ₽', percent: '+15,71%' },
  { name: 'Криптовалюты', href: '/crypto', invested: '189 000 ₽', value: '210 000 ₽', result: '+21 000 ₽', percent: '+11,11%' },
];

function DemoChart() {
  return (
    <figure className="public-demo-chart">
      <div className="public-demo-legend" aria-hidden="true">
        <span><i className="public-value-key" />Стоимость</span>
        <span><i className="public-cost-key" />Себестоимость</span>
      </div>
      <svg viewBox="0 0 1400 235" role="img" aria-labelledby="demo-chart-title demo-chart-description">
        <title id="demo-chart-title">Демонстрационный график стоимости портфеля в рублях</title>
        <desc id="demo-chart-description">Условный пример с 6 сентября по 6 октября: стоимость меняется с 423 000 до 486 000 рублей, себестоимость с 405 000 до 429 000 рублей. Это демо, а не история реального портфеля.</desc>
        {[20, 75, 130, 185].map((y, index) => (
          <g key={y}>
            <line x1="85" y1={y} x2="1360" y2={y} className="public-chart-grid" />
            <text x="72" y={y + 5} textAnchor="end" className="public-chart-axis">{520 - index * 40} 000 ₽</text>
          </g>
        ))}
        {[85, 405, 725, 1045, 1360].map(x => <line key={x} x1={x} y1="20" x2={x} y2="185" className="public-chart-grid" />)}
        <polyline points="85,153.4 405,124.5 725,128.6 1045,91.5 1360,66.8" className="public-chart-value" />
        <polyline points="85,178.1 405,157.5 725,147.1 1045,140.3 1360,145.1" className="public-chart-cost" />
        {[[85,153.4],[405,124.5],[725,128.6],[1045,91.5],[1360,66.8]].map(([x,y]) => <circle key={x} cx={x} cy={y} r="4.8" className="public-chart-value-point" />)}
        {[[85,178.1],[405,157.5],[725,147.1],[1045,140.3],[1360,145.1]].map(([x,y]) => <circle key={x} cx={x} cy={y} r="4" className="public-chart-cost-point" />)}
        <rect x="1205" y="27" width="155" height="28" rx="4" className="public-chart-label-box" />
        <text x="1282" y="46" textAnchor="middle" className="public-chart-point-label">6 окт. · 486 000 ₽</text>
        <rect x="1260" y="109" width="100" height="26" rx="4" className="public-chart-label-box" />
        <text x="1310" y="127" textAnchor="middle" className="public-chart-point-label">429 000 ₽</text>
        <text x="85" y="214" textAnchor="middle" className="public-chart-axis">6 сен.</text>
        <text x="725" y="214" textAnchor="middle" className="public-chart-axis">20 сен.</text>
        <text x="1360" y="214" textAnchor="middle" className="public-chart-axis">6 окт.</text>
      </svg>
      <figcaption>Условные значения и динамика · демо.</figcaption>
    </figure>
  );
}

export default function WelcomePage() {
  return (
    <div className="public-page public-welcome-page">
      <header className="public-header">
        <Link className="public-brand" href="/welcome">Tracker</Link>
        <Link className="public-login-link" href="/login">Войти</Link>
      </header>
      <main className="public-welcome-main">
        <section className="public-hero" aria-labelledby="welcome-title">
          <h1 id="welcome-title">Все инвестиции — в цифрах</h1>
          <p>Стоимость, сделки и результат в одном портфеле</p>
          <Link className="public-primary-button" href="/">Открыть портфель</Link>
        </section>
        <section className="public-demo-panel" aria-labelledby="demo-title">
          <div className="public-demo-heading">
            <div>
              <div className="public-demo-title"><h2 id="demo-title">Обзор портфеля</h2><span className="public-demo-badge">Демо-данные</span></div>
              <p>Пример оценки: 1 USD = 84,00 ₽ · 6 окт. 2026, 14:30</p>
            </div>
            <div className="public-demo-periods" aria-label="Демонстрационный период: месяц">
              {['День', 'Неделя', 'Месяц', 'Год', 'Всё'].map(period => <span key={period} className={period === 'Месяц' ? 'selected' : undefined}>{period}</span>)}
            </div>
          </div>
          <dl className="public-demo-metrics">
            <div><dt>Стоимость</dt><dd>486 000 ₽</dd></div>
            <div><dt>Вложено</dt><dd>429 000 ₽</dd></div>
            <div><dt>Нереализованный результат</dt><dd className="public-positive">+57 000 ₽ <small>+13,29%</small></dd></div>
            <div><dt>Результат продаж</dt><dd className="public-positive">+12 840 ₽</dd></div>
          </dl>
          <DemoChart />
          <div className="public-demo-table-scroll">
            <table className="public-demo-table">
              <thead><tr><th scope="col">Портфель</th><th scope="col">Вложено</th><th scope="col">Стоимость</th><th scope="col" colSpan={2}>Результат</th></tr></thead>
              <tbody>{demoPortfolios.map(portfolio => <tr key={portfolio.name}><th scope="row"><Link href={portfolio.href}>{portfolio.name}</Link></th><td>{portfolio.invested}</td><td>{portfolio.value}</td><td className="public-positive">{portfolio.result}</td><td className="public-positive">{portfolio.percent}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
        <p className="public-sources">CS2 и Sandbox · Steam Community Market, ₽ / Криптовалюты · DropsTab, $.</p>
      </main>
    </div>
  );
}
