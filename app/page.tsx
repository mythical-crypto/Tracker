import Dashboard from './dashboard';
import portfolio from '@/data/portfolio.json';
import prices from '@/data/prices.json';
import history from '@/data/history.json';

export default function Page() {
  return <Dashboard portfolio={portfolio} prices={prices} history={history} />;
}
