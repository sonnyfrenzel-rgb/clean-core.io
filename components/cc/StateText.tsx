'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { SemanticState } from '@/lib/provenance';
import { STATE_CLASSES } from './state';

/**
 * A state in words, with a dot — `DESIGN.md` §2.4 "Status as text with a dot —
 * never colour alone", for a state that is not on one of the fixed lists.
 *
 * `CcObjectStatus` is the same shape for *how far a piece of work has got*, and
 * it takes its value from `lib/object-status.ts`, so its word and its colour
 * cannot disagree. Everything else that is a state but not on that list — an
 * account that is suspended, a factor that has to be set up again, the strength
 * of a password — had been built twice by hand (`components/admin/AccountState.tsx`,
 * `StateWord` in `app/(app)/settings/page.tsx`), with two different gaps between
 * dot and word. This is the one of them (block D, D.5e).
 *
 * The caller names the word and the state; the component owns the look:
 *
 *   - the word is always there, the dot never alone;
 *   - no outline and no icon, so it can never be taken for a provenance chip
 *     (ADR-023);
 *   - `hollow` for the absence of something — "not set", "deleted" — because a
 *     filled dot reads as a result and an absence is not one;
 *   - no `success`. Green means proven (§1.1, ADR-007), and what is proven has
 *     its own fixed list — a provenance chip, an object status "done", a
 *     success strip after an action. A free word in green would be a claim
 *     nothing backs: "Active", "Enabled" and "Strong" are information, not
 *     proof. `tests/cc-provenance-guard.spec.ts` measures it on the gallery.
 */
export type CcStateTextState = Exclude<SemanticState, 'success'>;

export interface CcStateTextProps {
  state: CcStateTextState;
  /** The word. Short, sentence case — "Suspended", "Set up again". */
  children: React.ReactNode;
  /** An absence rather than a result: an empty dot. */
  hollow?: boolean;
  /** What the state is about — "Account", "Two-factor". Rendered before it, muted. */
  facet?: string;
}

/**
 * The dot alone, shared with `CcObjectStatus` so the two can never grow two
 * sizes or two meanings of "hollow". Always `aria-hidden`: the word carries it.
 */
export function CcStateDot({ state, hollow = false }: { state: SemanticState; hollow?: boolean }) {
  return (
    <span
      aria-hidden={true}
      data-cc-state-dot={hollow ? 'hollow' : 'filled'}
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full border',
        hollow ? 'bg-transparent border-current' : cn(STATE_CLASSES[state].mark, 'border-transparent'),
      )}
    />
  );
}

export default function CcStateText({ state, children, hollow = false, facet }: CcStateTextProps) {
  return (
    <span data-cc-state-text={state} className="inline-flex items-center gap-2 cc-text-meta whitespace-nowrap">
      {facet ? <span className="font-medium text-cc-ink-muted">{facet}</span> : null}
      <span className={cn('inline-flex items-center gap-1', STATE_CLASSES[state].text)}>
        <CcStateDot state={state} hollow={hollow} />
        <span data-cc-state-text-label="">{children}</span>
      </span>
    </span>
  );
}
