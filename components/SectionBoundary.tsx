'use client';

import type { ReactNode } from 'react';
import CcMessageStrip from '@/components/cc/MessageStrip';
import ErrorBoundary from '@/components/ErrorBoundary';

interface SectionBoundaryProps {
  /** Short section label shown in the fallback, e.g. "Routing Rationale" */
  name: string;
  children: ReactNode;
  /** Hide the fallback entirely (fail-invisible) — default shows a compact notice. */
  silent?: boolean;
}

/**
 * Section-level isolation: one crashing section must never blank the page.
 *
 * Wraps the existing ErrorBoundary with a compact, honest fallback so downstream
 * pages (Design, Analyze, Delivery, …) degrade per-section instead of failing
 * whole-page. Use around every data-driven section:
 *
 *   <SectionBoundary name="Routing Rationale">
 *     <RoutingRationale … />
 *   </SectionBoundary>
 */
export default function SectionBoundary({ name, children, silent = false }: SectionBoundaryProps) {
  // Neutral, not error: nothing the reader did failed, and the rest of the page
  // stands (Block D, D.9 — a Message Strip like every other notice, §2.6).
  const fallback = silent ? null : (
    <CcMessageStrip state="neutral" headline={`${name} could not be rendered —`}>
      likely incomplete data from an older analysis run. The rest of the page is unaffected.
    </CcMessageStrip>
  );

  return <ErrorBoundary fallback={fallback}>{children}</ErrorBoundary>;
}
