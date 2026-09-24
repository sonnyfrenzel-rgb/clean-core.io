'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * A line anchor — `L243`, `L380-412`, `CC-017`, `BR-004` (`DESIGN.md` §3).
 *
 * The anchor is the product's whole argument in one element: every statement on
 * the screen either points at a line of the customer's code or admits that it
 * cannot. So it has three forms and the third is the one that matters:
 *
 *   `linked`     an anchor that goes somewhere. Clickable, keyboard reachable.
 *   `unlinked`   an anchor that names a place nothing can open yet — dashed, so
 *                a reader can see at a glance that a sentence is unbacked
 *                without reading the sentence.
 *   `hot`        the anchor for the currently selected node or line. It is a
 *                selection, not a state, so it takes `information` and not the
 *                green that would read as proof.
 *
 * Always monospace. An ID in the body face is a word; an ID in monospace is a
 * reference, and readers treat the two differently without being told.
 */
export type CcAnchorTone = 'linked' | 'unlinked' | 'hot';

const TONE_CLASSES: Record<CcAnchorTone, string> = {
  linked: 'bg-cc-surface-muted border-cc-line text-cc-ink border-solid',
  unlinked: 'bg-cc-surface border-cc-field-border text-cc-ink-muted border-dashed',
  hot: 'bg-cc-information-bg border-cc-information-border text-cc-information border-solid',
};

export interface CcAnchorProps {
  /** What it reads — `L412`, `L380-412`, `CC-017`, `BR-004`. */
  children: React.ReactNode;
  tone?: CcAnchorTone;
  /** Where it goes. Without it the anchor is rendered as text, not as a link. */
  onOpen?: () => void;
  /** Spoken name, where the code alone would not say what it points at. */
  label?: string;
}

export default function CcAnchor({ children, tone = 'linked', onOpen, label }: CcAnchorProps) {
  const className = cn(
    'inline-block rounded-[4px] border px-1.5 align-middle font-cc-mono',
    'text-[11px] font-semibold leading-[17px] whitespace-nowrap',
    TONE_CLASSES[tone],
  );

  if (!onOpen) {
    // A label on a plain `span` is not read: ARIA does not name a generic
    // element, so "Source line 243" never reached a screen reader and "243"
    // did, as a bare number (roadmap 3.0.4). The label is spoken instead of the
    // glyphs, which stay what a sighted reader and a printed page see.
    if (label) {
      return (
        <span data-cc-anchor={tone} className={className}>
          <span aria-hidden={true}>{children}</span>
          <span className="sr-only">{label}</span>
        </span>
      );
    }
    return (
      <span data-cc-anchor={tone} className={className}>
        {children}
      </span>
    );
  }

  return (
    <button type="button" data-cc-anchor={tone} onClick={onOpen} aria-label={label} className={className}>
      {children}
    </button>
  );
}
