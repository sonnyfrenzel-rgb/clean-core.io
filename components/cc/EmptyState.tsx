'use client';

import React from 'react';
import { Filter } from 'lucide-react';
import { t } from '@/lib/cc-messages';
import CcButton from './Button';

/**
 * Nothing there — and the two cases are not the same thing (`DESIGN.md` §2.4).
 *
 * **Empty** means there is nothing yet: a new project before its first run. It
 * says what would fill it and offers the one action that does — and, because
 * every action in this product declares its price before the click (§2.8), it
 * can say "No model call · the engine only" underneath.
 *
 * **No matches** means a filter excluded everything that is there. It says so —
 * "No findings match these filters" — and offers "Clear filters". It never
 * shows the empty state, and this is not a nicety: an empty state after a
 * filter tells someone their analysis produced nothing, and the next thing they
 * do is run it again.
 *
 * Two components rather than one with a flag, so the wrong one cannot be
 * reached by passing the wrong boolean.
 */
export function CcEmptyState({
  illustration,
  title,
  children,
  action,
  cost,
}: {
  /** A line drawing. Never a sparkle or a robot (§3.1). */
  illustration?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  /** The one action that would fill this. */
  action?: React.ReactNode;
  /** What that action costs, before the click — §2.8. */
  cost?: React.ReactNode;
}) {
  return (
    <div
      data-cc-empty-state="empty"
      className="rounded-cc-row border border-dashed border-cc-field-border bg-cc-surface px-5 py-6 text-center"
    >
      {illustration ? <div className="mb-1.5 flex justify-center">{illustration}</div> : null}
      <div className="text-[14px] font-bold text-cc-ink">{title}</div>
      {children ? (
        <p className="mx-auto mt-1 mb-2.5 max-w-md text-[12px] font-medium leading-snug text-cc-ink-muted">
          {children}
        </p>
      ) : null}
      {action}
      {cost ? <p className="mt-2 text-[12px] font-medium text-cc-ink-muted">{cost}</p> : null}
    </div>
  );
}

export function CcNoMatches({
  reason,
  onClear,
}: {
  /** Why nothing matched, in terms of the filters — not "try again". */
  reason?: React.ReactNode;
  onClear: () => void;
}) {
  return (
    <div
      data-cc-empty-state="no-matches"
      className="rounded-cc-row border border-cc-line bg-cc-surface px-5 py-6 text-center"
    >
      <div className="mb-1.5 flex justify-center text-cc-ink-muted">
        <Filter size={20} aria-hidden={true} />
      </div>
      <div className="text-[14px] font-bold text-cc-ink">{t('filter.noMatch')}</div>
      {reason ? (
        <p className="mx-auto mt-1 mb-2.5 max-w-md text-[12px] font-medium leading-snug text-cc-ink-muted">
          {reason}
        </p>
      ) : null}
      <CcButton variant="ghost" onClick={onClear}>
        {t('action.clearFilters')}
      </CcButton>
    </div>
  );
}

export default CcEmptyState;
