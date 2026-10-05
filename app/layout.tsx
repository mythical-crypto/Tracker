import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tracker — личный капитал',
  description: 'Личный портфель CS2, Sandbox и криптовалют.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
