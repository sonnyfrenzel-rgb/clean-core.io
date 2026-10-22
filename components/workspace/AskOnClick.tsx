'use client';

import React from 'react';
import { PenLine } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import { ON_A_CLICK_NOTE } from '@/lib/auto-steps';

/**
 * The click that replaces an automatic step (roadmap 3.0.21, owner decision
 * B6): with the account's own key and "Automatic steps" off for it, the plain
 * wording and the business names are not asked for by themselves — this
 * button asks, once, and says why it is a button. Renders nothing when no
 * click is waiting (`askNow` null): the platform key, a reader, a stored
 * answer, or the step already asked.
 *
 * The pen, never a sparkle (DESIGN.md §3.1): what comes back is AI-generated.
 */
export default function AskOnClick({ askNow, label }: { askNow: (() => void) | null; label: string }) {
  if (!askNow) return null;
  return (
    <div data-ask-on-click="" className="flex min-w-0 flex-wrap items-center gap-2">
      <CcButton variant="secondary" icon={<PenLine size={16} aria-hidden={true} />} onClick={askNow}>
        {label}
      </CcButton>
      <span className="text-[12px] font-medium text-cc-ink-muted">{ON_A_CLICK_NOTE}</span>
    </div>
  );
}
