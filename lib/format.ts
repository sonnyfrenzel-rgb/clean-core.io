/**
 * Dates and numbers, one way — DESIGN.md §3 (Block D, D.3).
 *
 * The app printed dates through `toLocaleDateString()` and numbers through
 * `toLocaleString()` in 27 places, so a reader with a German browser saw
 * "15.9.2026" and "1.234", an American one "9/15/2026", and a screenshot of the
 * same project looked like two products. Nineteen more places pinned `'en-US'`,
 * which is at least the same everywhere, but it is not the format §3 asks for.
 *
 * Every function here is deterministic: the output depends on the value and
 * nothing else — not the browser's language, not the machine's time zone.
 *
 *   - Calendar dates are read in **UTC**. A run signed at 23:30 in Berlin is
 *     the same day for every reader, and the day in the table matches the ISO
 *     timestamp in the audit pack, which is UTC as well.
 *   - Month names come from a fixed list, not from `Intl`: ICU spells
 *     September "Sep" in one version and "Sept" in the next, and a date is not
 *     the place to find out which one a browser ships.
 *   - Numbers go through `Intl.NumberFormat('en')` with the locale written
 *     down — the grouping comma is part of the format, not of the reader.
 *
 * Inputs that are not a date or not a finite number return `null`, never a
 * guessed string: the caller decides what "nothing" reads as — usually
 * *Not determined* (§4) — rather than this module printing "Invalid Date" or
 * "NaN" into a table.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/**
 * Anything the app stores a moment as, turned into a `Date` — or `null`.
 *
 * A Firestore `Timestamp` (has `toDate()`), its serialised form
 * (`{ seconds, nanoseconds }`, which is what reaches a client through JSON),
 * a `Date`, epoch milliseconds, or an ISO string.
 */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  let date: Date | null = null;
  if (value instanceof Date) {
    date = new Date(value.getTime());
  } else if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    const out = (value as { toDate: () => unknown }).toDate();
    date = out instanceof Date ? out : null;
  } else if (typeof value === 'number') {
    date = new Date(value);
  } else if (typeof value === 'string') {
    date = new Date(value);
  } else if (typeof value === 'object') {
    const seconds = (value as { seconds?: unknown; _seconds?: unknown }).seconds ??
      (value as { _seconds?: unknown })._seconds;
    const nanos = (value as { nanoseconds?: unknown; _nanoseconds?: unknown }).nanoseconds ??
      (value as { _nanoseconds?: unknown })._nanoseconds;
    if (typeof seconds === 'number') {
      date = new Date(seconds * 1000 + (typeof nanos === 'number' ? Math.floor(nanos / 1e6) : 0));
    }
  }
  if (!date || Number.isNaN(date.getTime())) return null;
  return date;
}

/** Running text: "15 Sep 2026" (§3). The calendar day in UTC. */
export function formatTextDate(value: unknown): string | null {
  const d = toDate(value);
  if (!d) return null;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Meta lines, tables and exports: ISO 8601 "2026-09-15" (§3). The calendar day
 * in UTC. Render it in `font-cc-mono`.
 */
export function formatIsoDate(value: unknown): string | null {
  const d = toDate(value);
  if (!d) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * A moment with its time and its zone: "15 Sep 2026, 14:05 UTC" (§3 — "times
 * with their time zone"). 24-hour clock.
 *
 * UTC unless a zone is named. With an IANA zone (`'Europe/Berlin'`) the wall
 * time of that zone is printed, followed by its offset — "16:05 GMT+2" — so the
 * string still says which clock it was read from.
 */
export function formatDateTime(value: unknown, options: { timeZone?: string } = {}): string | null {
  const d = toDate(value);
  if (!d) return null;
  const timeZone = options.timeZone ?? 'UTC';
  if (timeZone === 'UTC') {
    return `${formatTextDate(d)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  }
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
      timeZoneName: 'shortOffset',
    }).formatToParts(d);
  } catch {
    // An unknown zone name is a programming error, not a reason to print a
    // time from some other clock without saying so.
    return null;
  }
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const month = Number(part('month'));
  const hour = Number(part('hour')) % 24;
  const zone = part('timeZoneName') === 'GMT' ? 'UTC' : part('timeZoneName');
  return `${Number(part('day'))} ${MONTHS[month - 1]} ${part('year')}, ${pad(hour)}:${part('minute')} ${zone}`;
}

/**
 * A count or a measure: `Intl.NumberFormat('en')`, thousands grouped with a
 * comma — "1,234,567" (§3). Decimals as `Intl` gives them (up to three) unless
 * `maximumFractionDigits` says otherwise — the same digits `toLocaleString()`
 * printed, so replacing one with the other rounds nothing that was not
 * rounded before.
 */
export function formatNumber(
  value: number | null | undefined,
  options: { maximumFractionDigits?: number } = {},
): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const { maximumFractionDigits } = options;
  return new Intl.NumberFormat(
    'en',
    maximumFractionDigits === undefined ? {} : { maximumFractionDigits, minimumFractionDigits: 0 },
  ).format(value);
}

/**
 * A share as a whole percent: `0.42` → "42%" (§3 — "percent as a whole
 * number"). The input is a **fraction**, not a percentage.
 *
 * Rounding may not overstate at the two ends that carry a claim. A share that
 * is not all of it never prints as "100%" — 99.6% of rules confirmed is not
 * "all confirmed" — and a share that is not nothing never prints as "0%": it
 * prints "<1%". Everywhere else — including shares above 1 or below 0 — it
 * is ordinary rounding.
 */
export function formatPercent(fraction: number | null | undefined): string | null {
  if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return null;
  // `|| 0` folds the -0 that `Math.round(-0.3)` returns; `Intl` would print it "-0".
  let whole = Math.round(fraction * 100) || 0;
  if (fraction > 0 && fraction < 1) {
    if (whole === 100) whole = 99;
    if (whole === 0) return '<1%';
  }
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(whole)}%`;
}
