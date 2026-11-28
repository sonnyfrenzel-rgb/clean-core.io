'use client';

import { useParams } from 'next/navigation';
import RedesignPage from '@/components/redesign/RedesignPage';

/**
 * Decide (ADR-145; was Re-design, ADR-143) — the program decision in one go, on one page for every reader. The route
 * keeps its segment, so every older link and bookmark still lands here. See `components/redesign/RedesignPage.tsx`.
 */
export default function RedesignRoute() {
  const { projectId } = useParams();
  const id = typeof projectId === 'string' ? projectId : '';
  return <RedesignPage key={id} projectId={id} />;
}
