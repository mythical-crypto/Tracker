import Dashboard from '../dashboard';
import { loadPortfolio } from '@/lib/portfolio-data';
export default async function Page() { return <Dashboard initialData={await loadPortfolio()} section="cs2" />; }
