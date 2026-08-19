'use client';

import { AlertTriangle } from 'lucide-react';

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

  const backAt = MAINTENANCE_UNTIL.toLocaleString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
    timeZoneName: 'short',
  });

  return (
    <div
      role="status"
      className="mt-4 p-4 bg-amber-50 border border-amber-300 rounded-2xl text-left flex gap-3 items-start"
    >
      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest leading-none mb-1.5">
          Unscheduled maintenance
        </p>
        <p className="text-[12px] text-amber-900/85 font-medium leading-relaxed">
          Sign-in is temporarily unavailable while we work on our database. We expect it back by{' '}
          <strong className="font-black">{backAt}</strong>. Your account and your projects are not
          affected — nothing has been lost.
        </p>
        <p className="text-[11px] text-amber-900/70 font-medium leading-relaxed mt-1.5">
          Sorry for the timing. Questions:{' '}
          <a href="mailto:info@clean-core.io" className="underline font-bold">
            info@clean-core.io
          </a>
        </p>
      </div>
    </div>
  );
}
