import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tracker — портфель CS2',
  description: 'Личный портфель предметов Counter-Strike 2 с ценами Steam в рублях.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
