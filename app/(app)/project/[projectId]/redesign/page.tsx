'use client';

import { useParams } from 'next/navigation';
import RedesignPage from '@/components/redesign/RedesignPage';

/**
 * Re-design — the way on from Analyze into the six tools (ADR-143). Read-only: the steps in the one tool order, each
 * state read from the project, and one primary action, the next step. See `components/redesign/RedesignPage.tsx`.
 */
export default function RedesignRoute() {
  const { projectId } = useParams();
  const id = typeof projectId === 'string' ? projectId : '';
  return <RedesignPage key={id} projectId={id} />;
}
