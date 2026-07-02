/**
 * Run Capability Model (structural fix for the "Design page goes blank" class of bugs).
 *
 * Problem it solves: `enforceActiveRun()` (v1.19) only checks WHETHER a run
 * exists — not whether the run carries the fields the CURRENT engine version
 * produces. Projects analyzed before the extensibility router (pre-v1.14) have
 * runs without `extensibilityRoute` / `findings`; components that dereference
 * those fields crash, and one crashing section blanks the whole page.
 *
 * Structural answer: ONE module answers "what evidence does this run actually
 * carry?" — capability detection is SHAPE-BASED (field presence), not
 * version-string-based, so it stays correct even when version numbering
 * changes. Pages consult this once and render honestly:
 *   - full evidence  → render everything
 *   - legacy run     → render what exists + show <LegacyRunBanner/> (honest,
 *                      visible state instead of silently missing sections)
 *
 * This module is additive — lib/run-guard.ts stays untouched (the trust-chain
 * e2e tests assert its exports).
 */

export interface RunEvidenceSource {
  activeRunId?: string;
  extensibilityRoute?: string;
  findings?: unknown[];
  evidenceReport?: unknown;
  cleanCoreScore?: number;
  auditMetadata?: { modelCard?: { engineVersion?: string } };
  /** v1.22: usage import data (SCMON/UPL/ST03N) */
  usageReport?: unknown;
}

export interface RunCapabilities {
  hasRun: boolean;
  /** extensibilityRoute present → RoutingRationale & routing-bound sections can render */
  hasRoutingEvidence: boolean;
  /** deterministic findings present → evidence tables / rationale chips can render */
  hasFindings: boolean;
  /** evidence report present → scanner-backed sections can render */
  hasEvidenceReport: boolean;
  /** v1.22: usage import data present → risk matrix can render */
  hasUsageData: boolean;
  /** run exists but predates current engine capabilities */
  isLegacy: boolean;
  engineVersion?: string;
  /** human-readable list of what's missing — feeds the LegacyRunBanner */
  missing: string[];
}

export function getRunCapabilities(src: RunEvidenceSource | null | undefined): RunCapabilities {
  const hasRun = !!src?.activeRunId;
  const hasRoutingEvidence = typeof src?.extensibilityRoute === 'string' && src.extensibilityRoute.length > 0;

  // Deterministic findings live in `evidenceReport`, which the current engine
  // stores as the findings ARRAY (runs/create: `evidenceReport: evidenceReport.findings`).
  // Also accept a legacy top-level `findings[]` and the in-memory `{ findings: [] }`
  // object shape so detection is robust across shapes.
  const er = src?.evidenceReport as unknown;
  const findingsArr: unknown[] | null =
    Array.isArray(src?.findings) ? (src!.findings as unknown[])
    : Array.isArray(er) ? (er as unknown[])
    : (er && Array.isArray((er as { findings?: unknown[] }).findings)) ? (er as { findings: unknown[] }).findings
    : null;

  // The run carries the deterministic-scan capability when the evidence field is
  // present at all — an EMPTY findings list (clean code) is valid, not legacy.
  const hasEvidenceReport = er !== undefined && er !== null;
  const hasFindings = Array.isArray(findingsArr) && findingsArr.length > 0;
  const hasUsageData = src?.usageReport !== undefined && src?.usageReport !== null;

  const missing: string[] = [];
  if (hasRun && !hasRoutingEvidence) missing.push('extensibility routing decision');
  // Legacy iff the run lacks the deterministic evidence scan entirely. Do NOT flag
  // a run as legacy merely because it found zero issues.
  if (hasRun && !hasEvidenceReport) missing.push('deterministic evidence scan');
  // Note: usage data is OPTIONAL — its absence does NOT mark a run as legacy

  return {
    hasRun,
    hasRoutingEvidence,
    hasFindings,
    hasEvidenceReport,
    hasUsageData,
    isLegacy: hasRun && missing.length > 0,
    engineVersion: src?.auditMetadata?.modelCard?.engineVersion,
    missing,
  };
}
