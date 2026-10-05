import { isAuthenticatedCookie } from '@/lib/auth.mjs';
import { loadPortfolio } from '@/lib/portfolio-data';
import { authorizedPortfolioResponse } from '@/lib/portfolio-response';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return authorizedPortfolioResponse(request, isAuthenticatedCookie, loadPortfolio);
}
