import { headers } from 'next/headers';
import Dashboard from '../dashboard';
import { hasLocalTrackerAccess } from '@/lib/auth.mjs';
import { loadPortfolio } from '@/lib/portfolio-data';

export default async function Page() {
  return <Dashboard initialData={await loadPortfolio()} section="cs2" localAccess={hasLocalTrackerAccess(await headers())} />;
}
