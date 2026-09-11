/**
 * Usage Import Data Model (v1.22)
 *
 * Types for SAP usage data import from SCMON, UPL, and ST03N exports.
 * Enables usage-weighted risk prioritization by combining static evidence
 * with real production usage data.
 */

// ── Source & Bucket types ──────────────────────────────────────────

export type UsageSource = 'scmon' | 'upl' | 'st03n' | 'manual';

/**
 * `unobserved`: a measured zero inside a monitoring window too short — or not
 * declared at all — to call it disuse. A year-end program that ran nowhere in a
 * six-week export is exactly this, and it is not a retirement candidate (E03-F02).
 */
export type UsageBucket = 'heavy' | 'moderate' | 'low' | 'dormant' | 'unobserved' | 'unknown';

/**
 * How to read dates that are neither ISO (`YYYY-MM-DD`) nor SAP internal
 * (`YYYYMMDD`). Declared by the person importing, never guessed: `05.04.2026`
 * is 5 April in a German export and would be 4 May if read the American way.
 * `iso` accepts only the two unambiguous forms.
 */
export type UsageDateLocale = 'de-DE' | 'en-GB' | 'en-US' | 'iso';

/**
 * A zero count is evidence of disuse only over a window that contains every
 * periodic run — month-end, quarter-end, year-end. Thirteen months, the same
 * threshold the join uses for "last used too long ago".
 */
export const RETIREMENT_WINDOW_DAYS = 394;

/** A row the import did not take over, and why. */
export interface UsageQuarantineEntry {
  /** Spreadsheet row number, header = 1. */
  row: number;
  objectName: string;
  reason: string;
}

// ── Usage Record & Report ──────────────────────────────────────────

export interface UsageRecord {
  /** ABAP object name, normalized to UPPER CASE */
  objectName: string;
  /** ABAP object type: PROG / CLAS / FUGR / FUNC / TRAN ... */
  objectType?: string;
  /**
   * Execution count within the measured window, or `null` when the export did
   * not carry one.
   *
   * `null` rather than `0`, and the distinction is the whole point: a zero is a
   * measurement that the object was never called, and it makes the object a
   * retirement candidate. An absent column is not that measurement. The parser
   * used to coerce one into the other, which turned "we have no usage data" into
   * "delete this code" for every object in the export.
   */
  callCount: number | null;
  /** ISO date of last execution (if provided by the source) */
  lastUsed?: string;
  /** Which SAP tool exported this data */
  source: UsageSource;
  /** Measurement window length in days */
  observedSpanDays?: number;
}

export interface UsageReport {
  records: UsageRecord[];
  source: UsageSource;
  /**
   * Span in days between the first and last execution seen in the export.
   *
   * Deliberately NOT called a measurement period. Executions are not the
   * monitoring window: a one-year SCMON export in which everything happened to
   * run on 1 and 2 June describes a year of monitoring, not two days of it. The
   * field used to be named for the window and was inferred from exactly this
   * span, which reported the wrong number with the right label.
   */
  observedSpanDays?: number;
  /** ISO date of the earliest execution seen in the export. Not a window start. */
  observedFrom?: string;
  /** ISO date of the latest execution seen in the export. Not a window end. */
  observedTo?: string;
  /**
   * @deprecated The observed dates under their old names — present only on
   * pre-v2.9.7 reports, where they were derived from the executions
   * and labelled as the measurement window. Read as observed, never as declared.
   */
  measuredFrom?: string;
  /** @deprecated See `measuredFrom`. */
  measuredTo?: string;
  /**
   * The monitoring window as declared by whoever took the export — the start of
   * measurement comes from the declared capture, not from the first execution
   * seen (E03-F02-US01). Absent when nobody declared one.
   */
  window?: { from: string; to: string; days: number };
  /** The date format the import was told to read. */
  dateLocale?: UsageDateLocale;
  /**
   * Rows not taken over: negative counts, dates that do not match the declared
   * format or cannot exist, dates after the window or in the future, rows with
   * no object name. Shown before the import is confirmed and kept with it.
   */
  quarantined?: UsageQuarantineEntry[];
  /** ISO date: when the import was performed */
  importedAt: string;
  /**
   * Parser warnings (unmapped columns, skipped rows, etc.).
   * Never silently guessed — always surfaced to the user.
   */
  warnings: string[];
  /** Retention TTL — ISO date after which this report may be auto-deleted */
  retentionExpiresAt?: string;
}

// ── Risk & Quadrant types ──────────────────────────────────────────

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

/**
 * 2D quadrant combining usage intensity with technical feasibility.
 *
 * IMPORTANT: `unknown` is a FIRST-CLASS status, not a fallback for dormant.
 * An object with no usage record is "not measured", not "unused".
 * See §5 of the v1.22 concept: "Unknown ≠ Dormant" safeguard.
 */
export type Quadrant =
  | 'danger'            // high usage + hard/no path  → plan first
  | 'prioritize'        // high usage + feasible       → transform first
  | 'retire-candidate'  // dormant + feasible/no path  → retire (after sign-off)
  | 'low-priority'      // moderate/low, feasible
  | 'unknown';          // no usage data for this object

export type Feasibility = 'clean-core-ready' | 'needs-architect' | 'no-released-api-path';

export interface UsageJoinRow {
  objectName: string;
  usage: UsageBucket;
  /** null = no usage record for this object → 'unknown' bucket */
  callCount: number | null;
  lastUsed?: string;
  /** Severity derived from static findings */
  riskLevel: RiskLevel;
  /** Technical feasibility from evidence engine + catalog */
  feasibility: Feasibility;
  /** Combined usage × feasibility quadrant */
  quadrant: Quadrant;
  /** IDs of evidence findings linked to this object */
  findingIds: string[];
}
