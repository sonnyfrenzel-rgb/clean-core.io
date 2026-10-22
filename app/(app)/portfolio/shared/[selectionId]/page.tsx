import type { Metadata } from 'next';
import PortfolioShared from '@/components/portfolio/PortfolioShared';

/** A portfolio overview shared with the signed-in account — roadmap 3.0.21 (4). Never indexed. */
export const metadata: Metadata = {
  title: 'Shared portfolio | Clean-Core.io',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ selectionId: string }> }) {
  const { selectionId } = await params;
  return <PortfolioShared selectionId={String(selectionId ?? '')} />;
}
