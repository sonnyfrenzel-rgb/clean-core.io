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
  /** Execution count within the measured window */
  callCount: number;
  /** ISO date of last execution (if provided by the source) */
  lastUsed?: string;
  /** Which SAP tool exported this data */
  source: UsageSource;
  /** Measurement window length in days */
  periodDays?: number;
}

export interface UsageReport {
  records: UsageRecord[];
  source: UsageSource;
  /** Measurement window length in days — surfaced in every view */
  periodDays?: number;
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
