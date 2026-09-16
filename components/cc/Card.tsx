'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * The card — `DESIGN.md` §1.4, §2.3, §2.11.
 *
 * 12px radius, one-pixel line, the barely-there shadow of §1.4, white. The
 * workspace card is not the landing card: no 24px radius, no mesh, no gradient.
 * A tool is dense and quiet.
 *
 * Three things it does that a `<div>` would not:
 *
 *   - **The title is an `h3`** and cannot be anything else (§2.3: project title
 *     `h1`, section `h2`, card `h3`, no level skipped). A card that wrote its
 *     own heading level is how a page ends up with three `h2`s inside one
 *     section and a screen reader outline that does not match the picture.
 *   - **The count belongs to the title**, in the toolbar shape of §2.4 —
 *     "Findings (42)" — and is announced politely, because a live filter above
 *     it changes it while nobody is looking at it (§2.5).
 *   - **`provenance` sits in the header row**, next to the title, so a card
 *     whose content is reconstructed or proposed says so before it is read.
 *
 * `compact` is 12px padding and `cozy` 16px (§1.3) — the density of §2.9, again
 * passed in rather than sniffed here.
 */
export interface CcCardProps {
  title?: React.ReactNode;
  /** "(42)" after the title — the count of what is inside. */
  count?: number | string;
  /** Provenance chip, evidence level, tag: what the card's content is worth. */
  meta?: React.ReactNode;
  /** Buttons, right-aligned in the header row. */
  actions?: React.ReactNode;
  density?: 'compact' | 'cozy';
  children: React.ReactNode;
}

export default function CcCard({
  title,
  count,
  meta,
  actions,
  density = 'cozy',
  children,
}: CcCardProps) {
  return (
    <section
      data-cc-card=""
      className={cn(
        'cc-card min-w-0 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc',
        density === 'compact' ? 'p-3' : 'p-4',
      )}
    >
      {(title || meta || actions) && (
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          {title ? (
            <h3 data-cc-card-title className="m-0 text-[14px] font-bold leading-tight text-cc-ink">
              {title}
            </h3>
          ) : null}
          {count !== undefined ? (
            <span
              aria-live="polite"
              className="text-[12px] font-medium text-cc-ink-muted whitespace-nowrap"
            >
              ({count})
            </span>
          ) : null}
          {meta}
          {actions ? <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
