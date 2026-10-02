'use client';

import React from 'react';
import CcDisclosure from '@/components/cc/Disclosure';

/**
 * A section of the Analyze stage folded with its count (§2.11: "Business
 * rules (7) · Show"). The content stays in the document and prints; it is only
 * not shown first. Since 02.10.2026 the stage has two of them below the
 * findings — the model's summary and the technical detail — and the real page
 * and the demo draw them with this one component.
 *
 * Documentation folds its long lists with it too (owner 02.10.2026, through
 * `components/documentation/FoldedList.tsx`), with a one-line `summary` that
 * stays visible while closed, and its short lists open (`defaultOpen`).
 *
 * `aside` stands to the right of the trigger (a provenance chip, say), outside
 * the button, so the chip is seen while the section is closed.
 */
export default function FoldedSection({
  id,
  title,
  count,
  aside,
  summary,
  defaultOpen = false,
  level = 2,
  children,
  ...data
}: {
  id?: string;
  title: string;
  count?: number;
  aside?: React.ReactNode;
  /** The one line seen while closed (Documentation's long lists, 02.10.2026). */
  summary?: React.ReactNode;
  /** Open on first render — a short list on Documentation is not folded. */
  defaultOpen?: boolean;
  /** The heading level of the trigger; 2 unless the section sits under an `h3`. */
  level?: 2 | 3 | 4;
  children: React.ReactNode;
} & { [key: `data-${string}`]: string | number | undefined }) {
  return (
    <section id={id} className="scroll-mt-32 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc px-4 py-2 sm:px-6" {...data}>
      <div className="flex flex-wrap items-start gap-x-3">
        <div className="min-w-0 flex-1">
          <CcDisclosure level={level} density="cozy" title={title} count={count} summary={summary} defaultOpen={defaultOpen}>
            <div className="space-y-8 pt-2 pb-2">{children}</div>
          </CcDisclosure>
        </div>
        {aside ? <div className="flex min-h-10 items-center">{aside}</div> : null}
      </div>
    </section>
  );
}

/** A titled part inside a folded section: an `h3` and its content. */
export function FoldedPart({ title, children, ...data }: { title: string; children: React.ReactNode } & {
  [key: `data-${string}`]: string | number | undefined;
}) {
  return (
    <div className="space-y-4" {...data}>
      <h3 className="m-0 cc-text-h3 text-cc-ink">{title}</h3>
      {children}
    </div>
  );
}
