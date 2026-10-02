'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { SemanticState } from '@/lib/provenance';
import { STATE_CLASSES } from '@/components/cc/state';

/**
 * The state of an account, as the admin console shows it — text with a state
 * dot, the same shape as `CcObjectStatus` (`DESIGN.md` §2.4: "Status as text
 * with a dot — never colour alone").
 *
 * Not `CcObjectStatus` itself, because that one takes a value from the fixed
 * list in `lib/object-status.ts` (how far a *piece of work* has got), and
 * "suspended" or "welcome mail bounced" are not on it and do not belong there.
 * The colours still come from the one state table (`components/cc/state.ts`),
 * so nothing here is a palette of its own.
 *
 * Green (`success`) is not used: in this product green means proven (§1.1,
 * ADR-007), and an active account or an opened mail proves nothing.
 */
export interface AccountStateEntry {
  label: string;
  state: SemanticState;
  /** The absence of something rather than a result — an empty dot. */
  hollow?: boolean;
}

export function AccountStateText({ entry, facet }: { entry: AccountStateEntry; facet?: string }) {
  const classes = STATE_CLASSES[entry.state];
  return (
    <span data-account-state={entry.state} className="inline-flex items-center gap-2 cc-text-meta whitespace-nowrap">
      {facet ? <span className="font-medium text-cc-ink-muted">{facet}</span> : null}
      <span className={cn('inline-flex items-center gap-1', classes.text)}>
        <span
          aria-hidden={true}
          className={cn(
            'inline-block h-2 w-2 shrink-0 rounded-full border',
            entry.hollow ? 'border-current bg-transparent' : cn(classes.mark, 'border-transparent'),
          )}
        />
        <span>{entry.label}</span>
      </span>
    </span>
  );
}

/** Access withdrawn without one of the states above — quota set to 0, say. */
export const REVOKED_STATE: AccountStateEntry = { label: 'Revoked', state: 'neutral', hollow: true };

/**
 * `users/{uid}.status` and `registration_requests/{uid}.status` in words.
 *
 * 'pending' no longer means "waiting for an administrator": sign-up activates
 * the account at once, so a pending account is one whose activation call did
 * not land. It says so, in both halves of the console.
 */
export function accountState(status: string | undefined): AccountStateEntry {
  switch (status) {
    case 'approved':
      return { label: 'Active', state: 'information' };
    case 'suspended':
      return { label: 'Suspended', state: 'error' };
    case 'deleted':
      return { label: 'Deleted', state: 'neutral', hollow: true };
    default:
      // 'pending', and anything a request document carries that is none of
      // the above — the console always folded those into one "not yet".
      return { label: 'Setup unfinished', state: 'warning' };
  }
}
