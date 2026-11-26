import React from 'react';
import { CcCleanCoreLevelExplained } from '@/components/cc/LevelExplained';
import { cn } from '@/lib/utils';

/**
 * The parts of Analyze's Management page (ADR-143): a section card, a numbered item, a step of the way on and the
 * Level A–D mix. Pure presentation, shared by a project's page (`AnalyzeManagement.tsx`) and the demo's
 * (`components/demo/DemoAnalyzeManagement.tsx`), so the demo draws the same page without reaching the project's
 * loaders (`tests/public-no-google-before-signin-guard.spec.ts`).
 */

export function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className="min-w-0 scroll-mt-24 rounded-cc-card border border-cc-line bg-cc-surface px-5 py-4 shadow-cc max-[720px]:px-4"
    >
      <h2 id={`${id}-h`} tabIndex={-1} className="m-0 cc-text-h2 text-cc-ink">
        {title}
      </h2>
      {lead ? <p className="m-0 mt-1 max-w-[860px] cc-text-cell text-cc-ink-muted">{lead}</p> : null}
      {children}
    </section>
  );
}

export function NumberedItem({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 border-t border-cc-line py-2 cc-text-cell text-cc-ink first:border-t-0 first:pt-0">
      <span aria-hidden={true} className="flex size-6 items-center justify-center rounded-full bg-cc-ink cc-text-meta font-bold text-cc-on-dark">
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export function FlowItem({ on = false, children }: { on?: boolean; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 py-1 cc-text-cell text-cc-ink">
      <span aria-hidden={true} className={cn('mt-1 size-3 rounded-full border-2', on ? 'border-cc-ink bg-cc-ink' : 'border-cc-ink-muted bg-cc-surface')} />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

const LEVEL_CLASS: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: 'border-cc-success-border bg-cc-success-bg text-cc-success',
  B: 'border-cc-information-border bg-cc-information-bg text-cc-information',
  C: 'border-cc-warning-border bg-cc-warning-bg text-cc-warning',
  D: 'border-cc-error-border bg-cc-error-bg text-cc-error',
};

/** The Level A–D mix of the findings, as four small marks — a reading of SAP's lists, never part of the signed pack. */
export function LevelMix({ mix }: { mix: Record<'A' | 'B' | 'C' | 'D', number> }) {
  return (
    <span data-management-levels="" className="flex flex-wrap items-center gap-1">
      {(['A', 'B', 'C', 'D'] as const).map((k) => (
        <CcCleanCoreLevelExplained
          key={k}
          value={k}
          trigger={<span className={cn('inline-flex items-center rounded-cc-row border px-1 cc-text-meta font-bold', LEVEL_CLASS[k])}>{k} {mix[k]}</span>}
        />
      ))}
    </span>
  );
}
