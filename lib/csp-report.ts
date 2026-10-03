/**
 * Reading Content-Security-Policy violation reports (`/api/csp-report`).
 *
 * Browsers deliver two formats:
 *  - `report-uri`: `application/csp-report`, one object `{ "csp-report": { … } }`
 *    with kebab-case fields (`effective-directive`, `blocked-uri`, `document-uri`);
 *  - `report-to`: `application/reports+json`, an array of
 *    `{ type: "csp-violation", body: { effectiveDirective, blockedURL, documentURL, … } }`.
 *
 * Everything that leaves this module is reduced to three short values — the
 * directive, the ORIGIN of what was blocked, and the document PATH without its
 * query — because a report can carry a full URL with a token in it (an
 * `oobCode`, an unsubscribe token, a survey token) and a script sample. None of
 * that is logged. Path segments that are identifiers are replaced by their
 * route parameter name.
 */

export interface CspViolationSummary {
  directive: string;
  blocked: string;
  path: string;
  disposition: string;
}

const MAX_FIELD = 200;

function str(v: unknown): string {
  return typeof v === 'string' ? v.slice(0, 2048) : '';
}

/** `script-src-elem`, `connect-src`, … — a bare directive name, or `unknown`. */
export function normalizeDirective(raw: string): string {
  const first = raw.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return /^[a-z-]{1,40}$/.test(first) ? first : 'unknown';
}

/**
 * The origin of a blocked resource, or the CSP keyword the browser uses for
 * what has no URL (`inline`, `eval`, `data`, `blob`, `wasm-eval`, …). Never a
 * path or a query.
 */
export function normalizeBlocked(raw: string): string {
  const value = raw.trim();
  if (!value) return 'none';
  if (/^[a-z][a-z-]{0,31}$/i.test(value)) return value.toLowerCase();
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:') {
      return url.origin.slice(0, MAX_FIELD);
    }
    // data:, blob:, chrome-extension:, … — the scheme says enough.
    return url.protocol.replace(/:$/, '').slice(0, 32);
  } catch {
    return 'other';
  }
}

/** Route segments after these prefixes are identifiers or secrets, not page names. */
const ID_SEGMENTS: ReadonlyArray<[RegExp, string]> = [
  [/^\/project\/[^/]+/, '/project/[projectId]'],
  [/^\/survey\/[^/]+/, '/survey/[token]'],
  [/^\/invitation\/[^/]+\/[^/]+/, '/invitation/[projectId]/[invitationId]'],
];

/** The document's path, without query or fragment, with identifiers replaced. */
export function normalizeDocumentPath(raw: string): string {
  let pathname = '';
  try {
    pathname = new URL(raw.trim()).pathname;
  } catch {
    return 'unknown';
  }
  for (const [re, replacement] of ID_SEGMENTS) {
    if (re.test(pathname)) {
      pathname = pathname.replace(re, replacement);
      break;
    }
  }
  return pathname.slice(0, MAX_FIELD) || '/';
}

function summarize(body: Record<string, unknown>, kebab: boolean): CspViolationSummary {
  const get = (camel: string, dashed: string) => str(kebab ? body[dashed] : body[camel]);
  const directive = get('effectiveDirective', 'effective-directive') || get('violatedDirective', 'violated-directive');
  return {
    directive: normalizeDirective(directive),
    blocked: normalizeBlocked(get('blockedURL', 'blocked-uri')),
    path: normalizeDocumentPath(get('documentURL', 'document-uri')),
    disposition: get('disposition', 'disposition') === 'enforce' ? 'enforce' : 'report',
  };
}

/** At most this many violations are read from one request body. */
export const MAX_REPORTS_PER_BODY = 20;

/** Both browser formats → summaries. Anything else → an empty list. */
export function parseCspReports(json: unknown): CspViolationSummary[] {
  if (Array.isArray(json)) {
    return json
      .filter((r): r is { type: unknown; body: Record<string, unknown> } =>
        !!r && typeof r === 'object' && (r as { type?: unknown }).type === 'csp-violation'
        && !!(r as { body?: unknown }).body && typeof (r as { body?: unknown }).body === 'object')
      .slice(0, MAX_REPORTS_PER_BODY)
      .map((r) => summarize(r.body, false));
  }
  if (json && typeof json === 'object') {
    const inner = (json as Record<string, unknown>)['csp-report'];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return [summarize(inner as Record<string, unknown>, true)];
    }
  }
  return [];
}

/**
 * A per-instance fixed-window limiter by client address.
 *
 * Not `assertRateLimit`: the house limiter keeps its windows in Firestore, so
 * every report — including a refused one — would cost a Firestore transaction,
 * and this endpoint stores nothing in Firestore by design. The same reasoning
 * as the deep probe in `app/api/health/route.ts`: bounded per instance, which
 * is all it claims. The map is cleared when it grows past `maxKeys`, so a flood
 * of addresses cannot grow memory without bound.
 */
export class InstanceRateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxKeys = 5000,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      if (!w && this.windows.size >= this.maxKeys) this.windows.clear();
      this.windows.set(key, { start: now, count: 1 });
      return true;
    }
    if (w.count >= this.max) return false;
    w.count += 1;
    return true;
  }
}

/**
 * Collapses identical violations so a page that reports the same thing on
 * every view writes one log line per window, carrying the count, instead of
 * one per report. The first occurrence is logged at once (count 1); repeats
 * inside the window are counted and written with the next occurrence after it.
 */
export class ViolationAggregator {
  private seen = new Map<string, { windowStart: number; pending: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly maxKeys = 2000,
  ) {}

  /** Returns the count to log now, or 0 when this occurrence is only counted. */
  record(v: CspViolationSummary, now = Date.now()): number {
    const key = `${v.disposition}|${v.directive}|${v.blocked}|${v.path}`;
    const entry = this.seen.get(key);
    if (!entry) {
      if (this.seen.size >= this.maxKeys) this.seen.clear();
      this.seen.set(key, { windowStart: now, pending: 0 });
      return 1;
    }
    entry.pending += 1;
    if (now - entry.windowStart >= this.windowMs) {
      const count = entry.pending;
      entry.windowStart = now;
      entry.pending = 0;
      return count;
    }
    return 0;
  }
}
