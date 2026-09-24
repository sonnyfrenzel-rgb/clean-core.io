'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/cc-messages';
import { formatDateTime, formatIsoDate, formatTextDate, toDate } from '@/lib/format';

/**
 * A date on screen — `DESIGN.md` §3, block D, step D.5c, on top of
 * `lib/format.ts` (D.3).
 *
 *   - `text` in running text: "15 Sep 2026";
 *   - `iso` in meta lines, tables and exports: `2026-09-15`, in mono;
 *   - `datetime` where the time matters: "15 Sep 2026, 14:05 UTC" — a time is
 *     never printed without its zone.
 *
 * Always a `<time>` with the machine-readable moment in `dateTime`, and the full
 * moment with its zone as a tooltip on the two date-only forms, so a reader who
 * needs the hour does not have to open the audit pack for it.
 *
 * A value that is not a date prints `fallback` — by default "no date
 * recorded" — and never "Invalid Date", which is a bug report shown to the
 * reader instead of to us.
 */
export type CcDateFormat = 'text' | 'iso' | 'datetime';

export interface CcDateTextProps {
  /** A `Date`, Firestore `Timestamp`, `{ seconds }`, epoch ms or ISO string. */
  value: unknown;
  format: CcDateFormat;
  /** IANA zone for `datetime`; UTC when omitted. */
  timeZone?: string;
  /** What stands where no date is — "not signed yet". */
  fallback?: string;
}

export default function CcDateText({ value, format, timeZone, fallback }: CcDateTextProps) {
  const date = toDate(value);
  const shown =
    format === 'iso'
      ? formatIsoDate(date)
      : format === 'text'
        ? formatTextDate(date)
        : formatDateTime(date, { timeZone });

  if (!date || !shown) {
    return (
      <span data-cc-date="none" className="text-cc-ink-muted">
        {fallback ?? t('date.none')}
      </span>
    );
  }

  return (
    <time
      data-cc-date={format}
      dateTime={date.toISOString()}
      title={format === 'datetime' ? undefined : (formatDateTime(date) ?? undefined)}
      className={cn('whitespace-nowrap', format === 'iso' && 'font-cc-mono')}
    >
      {shown}
    </time>
  );
}
