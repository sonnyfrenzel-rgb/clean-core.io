'use client';

import React from 'react';

/**
 * One artefact in a list — `DESIGN.md` §2.4, mockup `.row`.
 *
 * A handover package has twelve of these, a delivery page more; they are the
 * repeating unit of the product's right-hand side. Three columns and no more:
 * a mark, the thing itself, and what it is worth.
 *
 * The third column is the one that earns the component. Every artefact row in
 * the product before this carried a status invented at the call site — "ready",
 * "generated", "ok" — and the reader had to work out each time whether that was
 * a proof or a promise. Here it is a slot, and what goes in it is a provenance
 * chip, an object status or an evidence level: one of the fixed lists, never a
 * sentence.
 */
export interface CcArtefactRowProps {
  /** A 16px lucide icon. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** One line under the title: format, size, where it came from. */
  detail?: React.ReactNode;
  /** Provenance, status or level — right-aligned. */
  status?: React.ReactNode;
}

export default function CcArtefactRow({ icon, title, detail, status }: CcArtefactRowProps) {
  return (
    <div
      data-cc-artefact-row=""
      className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-cc-row border border-cc-line bg-cc-surface-muted px-2.5 py-2"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-cc-row border border-cc-line bg-cc-surface text-cc-ink-muted">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold leading-snug text-cc-ink">{title}</span>
        {detail ? (
          <span className="mt-0.5 block text-[12px] font-medium leading-snug text-cc-ink-muted">
            {detail}
          </span>
        ) : null}
      </span>
      <span className="flex items-center gap-1.5 pt-0.5">{status}</span>
    </div>
  );
}
