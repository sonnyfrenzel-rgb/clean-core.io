import type { Metadata } from 'next';
import PortfolioInvitation from '@/components/portfolio/PortfolioInvitation';

/** The page a portfolio invitation link opens — roadmap 3.0.21 (4). Never indexed. */
export const metadata: Metadata = {
  title: 'Invitation | Clean-Core.io',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ selectionId: string; invitationId: string }> }) {
  const { selectionId, invitationId } = await params;
  return <PortfolioInvitation selectionId={String(selectionId ?? '')} invitationId={String(invitationId ?? '')} />;
}
