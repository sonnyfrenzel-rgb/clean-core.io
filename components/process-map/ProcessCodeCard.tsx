'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import CcCodeSurface from '@/components/cc/CodeSurface';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { codeCardLabel, codeCardLines, type ProcessMapElement } from '@/lib/process-map';

/**
 * The code card — roadmap 2.5: *"a click on an element opens the code card with
 * the lines marked"*.
 *
 * The marked lines are the anchor's real lines of the source the run signed,
 * `lineStart` to `lineEnd`, counted from 1. Not a search for something that
 * looks right, not a window around a guess: the whole argument of this product
 * is that a statement on the screen can be checked against a line, and a card
 * that marked "about here" would quietly retract it.
 *
 * An element without an anchor gets a card too, and it says what is missing and
 * why. Showing nothing would leave the reader thinking they mis-clicked.
 *
 * Escape closes it and gives the focus back to the node (`DESIGN.md` §5.7); the
 * parent owns that, because the node lives in the other half of the view.
 */
export interface ProcessCodeCardProps {
  element: ProcessMapElement;
  /** The source the active run signed — the only source a card is built from. */
  source: string;
  fileName: string;
  onClose: () => void;
}

export default function ProcessCodeCard({ element, source, fileName, onClose }: ProcessCodeCardProps) {
  const headingRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(
    () => (element.anchor ? codeCardLines(source, element.anchor) : []),
    [element.anchor, source],
  );

  // The card appeared because the reader asked for it; a screen reader should
  // say so rather than leave the announcement to chance.
  useEffect(() => {
    headingRef.current?.focus();
  }, [element.id]);

  return (
    <section
      data-process-code-card={element.id}
      aria-label={`Source for ${element.label}`}
      // Escape belongs to the card as well as to the map. Opening it moves the
      // focus here, so a handler that only sat on the map would answer Escape
      // everywhere except in the one place the reader actually is.
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      className="flex min-w-0 flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div ref={headingRef} tabIndex={-1} className="min-w-0 outline-none">
          <h4 className="text-[14px] font-bold text-cc-ink">{element.label}</h4>
          <p className="mt-0.5 text-[12px] font-medium text-cc-ink-muted">
            {element.kind}
            {element.businessName ? ` · ${element.technicalName}` : ''}
            {element.anchor ? ` · ${codeCardLabel(fileName, element.anchor)}` : ''}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <CcProvenanceChip value={element.status} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the source"
            data-process-code-card-close=""
            className="inline-flex h-8 w-8 items-center justify-center rounded-cc-row border border-cc-field-border bg-cc-surface text-cc-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
          >
            <X size={16} aria-hidden={true} />
          </button>
        </span>
      </div>

      {element.anchor ? (
        <CcCodeSurface lines={lines} label={codeCardLabel(fileName, element.anchor)} />
      ) : (
        <p data-process-code-card-unanchored="" className="text-[13px] font-medium text-cc-ink-muted">
          <b className="font-semibold text-cc-ink">{element.evidenceLabel}.</b>{' '}
          {element.unanchoredReason
            ? element.unanchoredReason
            : 'The reader drew this element from the shape of the program rather than from one statement, so there is no line to open.'}
        </p>
      )}
    </section>
  );
}
