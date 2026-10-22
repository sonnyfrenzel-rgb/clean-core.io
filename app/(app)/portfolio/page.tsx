import type { Metadata } from 'next';
import PortfolioPage from '@/components/portfolio/PortfolioPage';

/**
 * The portfolio — roadmap 3.0.21: many programs in one run, one aggregated
 * view. Reached from "My workspace" (`components/workspace/WorkspaceListReport.tsx`).
 * Open only to an account whose own model key is stored and tested; the page
 * says so otherwise and leads to Settings.
 */
export const metadata: Metadata = {
  title: 'Portfolio | Clean-Core.io',
  description: 'Analyse many ABAP programs in one batch and read them together: score bands, levels, buckets and what recurs.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <PortfolioPage />;
}
