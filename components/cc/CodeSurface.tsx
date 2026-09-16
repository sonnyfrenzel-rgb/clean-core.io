'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * The code surface — `DESIGN.md` §1.1.
 *
 * One of exactly two dark surfaces in the product (ADR-028), and the only dark
 * one that carries content. The other is the overlay behind a toast or a coach
 * mark. Everything else is light, including after 3.0: there is no dark mode
 * (roadmap 1.6) and this is not the start of one.
 *
 * Five syntax colours and no more — keyword, literal, name, comment, and the
 * default ink. The literal colour is not decoration: a literal in ABAP is very
 * often the hidden rule this product exists to find (`IF lv_amount > 5000`), so
 * it is the brightest thing on the surface at 14:1.
 *
 * A highlighted line carries a 3px bar down its left edge as well as the tint.
 * Colour alone would be invisible in a high-contrast theme and on a printout,
 * and the highlighted line is the thing an anchor points at.
 */
export type CcCodeTokenKind = 'keyword' | 'literal' | 'name' | 'comment' | 'plain';

export interface CcCodeToken {
  kind: CcCodeTokenKind;
  text: string;
}

export interface CcCodeLine {
  /** The real line number in the source — anchors are written against it. */
  number: number;
  tokens: CcCodeToken[];
  /** The line an anchor points at. */
  highlighted?: boolean;
}

const TOKEN_CLASSES: Record<CcCodeTokenKind, string> = {
  keyword: 'text-cc-code-keyword',
  literal: 'text-cc-code-literal',
  name: 'text-cc-code-name',
  comment: 'text-cc-code-muted',
  plain: 'text-cc-code-ink',
};

export default function CcCodeSurface({
  lines,
  label,
}: {
  lines: readonly CcCodeLine[];
  /** What the listing is — "Z_MM_PO_CHECK, lines 405–415". */
  label: string;
}) {
  return (
    <pre
      data-cc-code-surface=""
      aria-label={label}
      tabIndex={0}
      className="cc-code-surface m-0 overflow-x-auto rounded-cc-card bg-cc-code-bg p-3 font-cc-mono text-[12px] leading-5 text-cc-code-ink"
    >
      <code>
        {lines.map((line) => (
          <span
            key={line.number}
            data-cc-code-line={line.highlighted ? 'highlighted' : 'plain'}
            className={cn(
              'block rounded-[4px] pr-2.5',
              line.highlighted && 'bg-cc-code-hl shadow-[inset_3px_0_0_var(--cc-code-hl-bar)]',
            )}
          >
            <span className="mr-3.5 inline-block w-10 text-right text-cc-code-muted select-none">
              {line.number}
            </span>
            {line.tokens.map((token, index) => (
              <span key={index} className={TOKEN_CLASSES[token.kind]}>
                {token.text}
              </span>
            ))}
          </span>
        ))}
      </code>
    </pre>
  );
}
