'use client';

import React from 'react';
import CcDisclosure from '@/components/cc/Disclosure';
import { foldText, LEAD_SENTENCES } from '@/lib/text-fold';

/**
 * A long paragraph, short on top and complete underneath (owner feedback
 * 24.11.2026). The first sentences stand; the rest is folded with the one
 * disclosure this product has (`CcDisclosure`, DESIGN.md §2.11) — folded, never
 * removed, and open on paper. A paragraph short enough stands whole, without a
 * fold.
 */
export default function FoldedText({
  text,
  sentences = LEAD_SENTENCES,
  className,
  title = 'Read the rest',
  leadAttrs,
}: {
  text: string;
  /** Attributes for the paragraph on top (`data-*` hooks of the place it stands in). */
  leadAttrs?: Record<`data-${string}`, string>;
  sentences?: number;
  /** Classes of the paragraph on top and of the folded one. */
  className?: string;
  title?: string;
}) {
  const { lead, rest } = foldText(text, sentences);
  if (!rest) return <p {...leadAttrs} className={className}>{lead}</p>;
  return (
    <div data-folded-text="" className="min-w-0">
      <p {...leadAttrs} className={className}>{lead}</p>
      <div className="mt-1">
        <CcDisclosure title={title}>
          <p className={className}>{rest}</p>
        </CcDisclosure>
      </div>
    </div>
  );
}
