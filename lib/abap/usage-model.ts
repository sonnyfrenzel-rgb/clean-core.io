/**
 * Usage Import Data Model (v1.22)
 *
 * Types for SAP usage data import from SCMON, UPL, and ST03N exports.
 * Enables usage-weighted risk prioritization by combining static evidence
 * with real production usage data.
 */

// ── Source & Bucket types ──────────────────────────────────────────

export type UsageSource = 'scmon' | 'upl' | 'st03n' | 'manual';

export type UsageBucket = 'heavy' | 'moderate' | 'low' | 'dormant' | 'unknown';

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
  /** ISO date: start of measurement window */
  measuredFrom?: string;
  /** ISO date: end of measurement window */
  measuredTo?: string;
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
