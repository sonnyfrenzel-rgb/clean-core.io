'use client';

import CcMessageStrip from '@/components/cc/MessageStrip';
import { formatDateTime } from '@/lib/format';

/**
 * Unscheduled-maintenance notice on the sign-in screen.
 *
 * 2026-08-19: the Firestore daily read quota for the production database was
 * exhausted, so sign-in and the dashboard cannot load data until it resets at
 * midnight Pacific Time. Telling people that is far better than letting them hit
 * an opaque error right after being invited by email.
 *
 * It expires by itself. `MAINTENANCE_UNTIL` is the moment the quota resets, and
 * the component renders nothing after it — so a forgotten banner cannot outlive
 * the incident and start lying to visitors.
 *
 * To retire it early, set `MAINTENANCE_UNTIL` to a past date or drop the element
 * from the sign-in form.
 */

/** Quota reset: midnight Pacific = 07:00 UTC = 09:00 CEST. */
export const MAINTENANCE_UNTIL = new Date('2026-08-20T07:00:00Z');

export function isMaintenanceActive(now: Date = new Date()): boolean {
  return now < MAINTENANCE_UNTIL;
}

export default function MaintenanceNotice() {
  if (!isMaintenanceActive()) return null;

  // "20 Aug 2026, 07:00 UTC" — the one date format of the product, with its
  // zone (DESIGN.md §3), instead of a British locale string of its own.
  const backAt = formatDateTime(MAINTENANCE_UNTIL);

  // A notice in its context is a Message Strip (§2.6): state colour, icon and
  // `role="status"` come from the library, not from amber classes written here.
  return (
    <div className="mt-4 text-left">
      <CcMessageStrip state="warning" headline="Unscheduled maintenance.">
        Sign-in is temporarily unavailable while we work on our database. We expect it back by{' '}
        <strong className="font-semibold">{backAt}</strong>. Your account and your projects are not affected —
        nothing has been lost. Sorry for the timing. Questions:{' '}
        <a href="mailto:info@clean-core.io" className="font-semibold text-cc-ink underline">
          info@clean-core.io
        </a>
      </CcMessageStrip>
    </div>
  );
}
