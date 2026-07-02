'use client';

import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
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
  const fallback = silent ? null : (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 flex items-center gap-3">
      <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
      <p className="text-xs text-slate-500 leading-relaxed">
        <span className="font-bold text-slate-600">{name}</span> could not be rendered —
        likely incomplete data from an older analysis run. The rest of the page is unaffected.
      </p>
    </div>
  );

  return <ErrorBoundary fallback={fallback}>{children}</ErrorBoundary>;
}
