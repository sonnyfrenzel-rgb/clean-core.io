'use client';

import React from 'react';
import CcAnchor from '@/components/cc/Anchor';
import { CcTag } from '@/components/cc/Tag';
import type { AnchorBasis, TargetAnchor } from '@/lib/process-target';

/**
 * Where one subject of the Soll stands in the code — or the visible statement
 * that it stands nowhere (roadmap 3.6, C23-A06).
 *
 * Four bases and four different things on the screen, because they are four
 * different facts and a reader who cannot tell them apart is being misled:
 *
 *   `code`       an `L` anchor. The Ist's line range, copied.
 *   `unanchored` the `Unanchored` tag with the reconstruction's own reason —
 *                the element is in the code and no line was found for it.
 *   `need`       the `Unanchored` tag with "it exists only in the target
 *                model". **This is the one C23-A06 is about.** The temptation
 *                is to borrow the neighbour's or the parent's line so the row
 *                looks as complete as the others; borrowing it would make the
 *                product claim that somebody's wish is in the customer's code.
 *   `unknown`    nothing at all. A business rule stands at every place its
 *                condition is written, so it has no single range, and this
 *                derivation is not handed the rule set. Saying nothing is the
 *                honest output; a dash would read as "none".
 *
 * The tag is deliberately not a provenance chip and not an object status
 * (`DESIGN.md` §4.1): the absence of evidence for one row is not a third origin
 * and not a stage of progress.
 */
export interface TargetAnchorNoteProps {
  anchor: TargetAnchor | null;
  anchorBasis: AnchorBasis;
  /** `Unanchored`, or null when nothing is stated either way. */
  evidenceLabel: string | null;
  unanchoredReason: string | null;
  /** Opens the code card on those lines. Without it the anchor is text, not a link. */
  onOpen?: () => void;
}

export default function TargetAnchorNote({
  anchor,
  anchorBasis,
  evidenceLabel,
  unanchoredReason,
  onOpen,
}: TargetAnchorNoteProps) {
  if (anchor) {
    const text = anchor.lineEnd === anchor.lineStart ? `L${anchor.lineStart}` : `L${anchor.lineStart}-${anchor.lineEnd}`;
    return (
      <span data-target-anchor="code" className="inline-flex items-center gap-1.5">
        <CcAnchor onOpen={onOpen} label={`${text} in the analysed file`}>
          {text}
        </CcAnchor>
      </span>
    );
  }

  if (anchorBasis === 'unknown' || !evidenceLabel) return null;

  return (
    <span data-target-anchor={anchorBasis} className="inline-flex flex-wrap items-center gap-1.5">
      <CcTag>{evidenceLabel}</CcTag>
      {unanchoredReason ? (
        <span data-target-anchor-reason={anchorBasis} className="text-[12px] font-medium text-cc-ink-muted">
          {unanchoredReason}
        </span>
      ) : null}
    </span>
  );
}
