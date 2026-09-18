/**
 * Usage × Evidence Join & Quadrant Matrix (v1.22, §4)
 *
 * Joins usage data with evidence findings and extensibility routing to produce
 * a risk-prioritized matrix. Each object gets a quadrant assignment based on
 * the cross-product of usage intensity × technical feasibility.
 *
 * CRITICAL SAFEGUARD (§5): Unknown ≠ Dormant.
 * Objects without usage records are 'unknown', NEVER 'dormant' or 'retire-candidate'.
 * Missing data is not evidence of non-use.
 */

import { RETIREMENT_WINDOW_DAYS } from './usage-model';
import type { UsageReport, UsageRecord, UsageBucket, UsageJoinRow, RiskLevel, Quadrant, Feasibility } from './usage-model';
import type { AbapEvidenceReport, EvidenceFinding } from './evidence-model';
import type { ExtensibilityRouteReport } from './extensibility-router';

// ── Public API ─────────────────────────────────────────────────────

/**
 * The set of object names a join over this usage report and this evidence
 * will produce a row for — every object either one names, upper-cased.
 *
 * Exposed so a caller that needs a per-object fact before the join runs (the
 * client's `/api/abcd-classify` batch lookup for `hasNoReleasedApiPath`, since
 * this module deliberately does not import the catalog — see
 * `joinUsageWithEvidence`'s `hasNoPath` parameter) asks for exactly this set,
 * not a guess at it that could drift from what the join actually looks at.
 */
export function usageJoinObjectNames(
  usage: Pick<UsageReport, 'records'>,
  evidence: Pick<AbapEvidenceReport, 'findings'>,
): string[] {
  const names = new Set<string>();
  for (const r of usage.records) names.add(r.objectName.toUpperCase());
  for (const f of evidence.findings) {
    if (f.objectName) names.add(f.objectName.toUpperCase());
  }
  return [...names];
}

export function joinUsageWithEvidence(
  usage: UsageReport,
  // Only the findings are read here. Taking the whole report would force every
  // caller to invent a `coverage` value, and the honest default for an invented
  // one — "nothing was skipped" — is the false clean bill this type exists to
  // prevent. Narrower parameter, no fabrication.
  evidence: Pick<AbapEvidenceReport, 'findings'>,
  _route: ExtensibilityRouteReport,
  // Whether the Cloudification Repository shows no released successor and no
  // extension path for an object (`catalog-service.ts`'s `hasNoReleasedApiPath`).
  // Taken as an input rather than imported: this module is loaded by a client
  // component (`UsageRiskMatrix.tsx`), and importing the ~4 MB catalog
  // artifacts here would ship them to the browser again — exactly what
  // roadmap "SAP-Katalog im Browser-Bundle" removes. The client caller batches
  // the same question through `/api/abcd-classify` first and passes a lookup
  // over the answer; the two specs that call this function directly pass a
  // stub, since neither exercises feasibility.
  hasNoPath: (objectName: string) => boolean,
): UsageJoinRow[] {
  // ST03N counts transaction steps, SCMON counts procedure calls, UPL counts
  // procedure executions. Summed into one number they measure nothing (E03-F02).
  // A report carries one source by construction; if one ever carries two, that
  // is refused here rather than added up.
  const sources = new Set(usage.records.map((r) => r.source));
  if (sources.size > 1) {
    throw new Error(
      `Usage records from different sources (${[...sources].join(', ')}) cannot be combined into one count. Import them separately.`,
    );
  }

  // Build usage lookup: objectName → UsageRecord
  const usageMap = new Map<string, UsageRecord>();
  for (const r of usage.records) {
    const key = r.objectName.toUpperCase();
    const existing = usageMap.get(key);
    if (existing) {
      // Merge: sum call counts, keep latest lastUsed. Two records that both
      // carry no count stay uncounted — summing them as zeroes would recreate
      // the very coercion the parser stopped doing.
      if (r.callCount !== null) {
        existing.callCount = (existing.callCount ?? 0) + r.callCount;
      }
      if (r.lastUsed && (!existing.lastUsed || r.lastUsed > existing.lastUsed)) {
        existing.lastUsed = r.lastUsed;
      }
    } else {
      usageMap.set(key, { ...r });
    }
  }

  // Compute percentile thresholds for bucketing
  const callCounts = usage.records
    .map(r => r.callCount)
    .filter((c): c is number => c !== null && c > 0)
    .sort((a, b) => a - b);
  const p25 = percentile(callCounts, 25);
  const p75 = percentile(callCounts, 75);

  // Dormancy threshold: 13 months before the end of the declared window — or,
  // with none declared, before the last execution seen (never later than the
  // true end, so the error runs towards "less dormant"). `measuredTo` is that
  // same observed date on pre-v2.9.7 reports.
  const windowEnd = usage.window?.to ?? usage.observedTo ?? usage.measuredTo;
  const dormancyThreshold = windowEnd
    ? new Date(new Date(windowEnd).getTime() - RETIREMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    : undefined;

  // A zero is evidence of disuse only across a declared window long enough to
  // contain every periodic run. Reports without a declared window — including
  // every pre-v2.9.7 report — do not qualify, whatever their dates say.
  const zeroMeansDormant = (usage.window?.days ?? 0) >= RETIREMENT_WINDOW_DAYS;

  // Collect all unique object names from BOTH usage and evidence — the exact
  // set `usageJoinObjectNames` exposes, so any caller that batches a fact
  // ahead of this call (see `hasNoPath` above) is asking about the same
  // objects this loop below actually visits.
  const allObjects = new Set(usageJoinObjectNames(usage, evidence));

  // Build findings lookup: objectName → EvidenceFinding[]
  const findingsMap = new Map<string, EvidenceFinding[]>();
  for (const f of evidence.findings) {
    if (!f.objectName) continue;
    const key = f.objectName.toUpperCase();
    const list = findingsMap.get(key) || [];
    list.push(f);
    findingsMap.set(key, list);
  }

  // Join
  const rows: UsageJoinRow[] = [];
  for (const objName of allObjects) {
    const usageRecord = usageMap.get(objName);
    const objectFindings = findingsMap.get(objName) || [];

    const bucket = classifyUsageBucket(usageRecord, p25, p75, dormancyThreshold, zeroMeansDormant);
    const riskLevel = deriveRiskLevel(objectFindings);
    const feasibility = deriveFeasibility(objName, objectFindings, hasNoPath);
    const quadrant = computeQuadrant(bucket, feasibility);

    rows.push({
      objectName: objName,
      usage: bucket,
      callCount: usageRecord?.callCount ?? null,
      lastUsed: usageRecord?.lastUsed,
      riskLevel,
      feasibility,
      quadrant,
      findingIds: objectFindings.map(f => f.id),
    });
  }

  // Sort: danger first, then prioritize, then rest
  const quadrantOrder: Record<Quadrant, number> = {
    'danger': 0,
    'prioritize': 1,
    'retire-candidate': 2,
    'low-priority': 3,
    'unknown': 4,
  };
  rows.sort((a, b) => quadrantOrder[a.quadrant] - quadrantOrder[b.quadrant]);

  return rows;
}

// ── Usage Bucketing ────────────────────────────────────────────────

function classifyUsageBucket(
  record: UsageRecord | undefined,
  p25: number,
  p75: number,
  dormancyThreshold: string | undefined,
  zeroMeansDormant: boolean,
): UsageBucket {
  // §5 SAFEGUARD: no record → unknown, NEVER dormant
  if (!record) return 'unknown';

  // §5, second half. The guard above tests whether a record exists; it says
  // nothing about whether that record carries a measurement. An export with an
  // object-name column and no recognised call-count column produces a record for
  // every object with no count in it — and until the parser stopped coercing
  // that to 0, every one of them came out of the line below as 'dormant', and
  // then as 'retire-candidate'. A recommendation to delete code, derived from
  // the absence of data.
  if (record.callCount === null) return 'unknown';

  // Zero calls → dormant, if the window could have seen every periodic run. A
  // measured zero, not a missing one — but a zero over six weeks says nothing
  // about a year-end program, and it used to make one a retirement candidate.
  if (record.callCount === 0) return zeroMeansDormant ? 'dormant' : 'unobserved';

  // Last used too long ago → dormant (regardless of call count)
  if (dormancyThreshold && record.lastUsed && record.lastUsed < dormancyThreshold) {
    return 'dormant';
  }

  // Percentile-based bucketing (relative, not magic numbers)
  if (record.callCount >= p75) return 'heavy';
  if (record.callCount >= p25) return 'moderate';

  // Below p25 but non-zero and recent → low, NOT dormant.
  // Low-frequency objects may still be business-critical (monthly closings,
  // year-end processes, audit reports, escalation programs).
  return 'low';
}

// ── Risk Level derivation ──────────────────────────────────────────

function deriveRiskLevel(findings: EvidenceFinding[]): RiskLevel {
  if (findings.length === 0) return 'low';

  const hasCritical = findings.some(f => f.severity === 'Critical');
  const hasHigh = findings.some(f => f.severity === 'High');
  const hasMedium = findings.some(f => f.severity === 'Medium');

  if (hasCritical) return 'critical';
  if (hasHigh) return 'high';
  if (hasMedium) return 'medium';
  return 'low';
}

// ── Feasibility derivation ─────────────────────────────────────────

function deriveFeasibility(
  objectName: string,
  findings: EvidenceFinding[],
  hasNoPath: (objectName: string) => boolean,
): Feasibility {
  // Check if any finding has no released API path — looked up by the caller,
  // never imported here (see `joinUsageWithEvidence`'s `hasNoPath` parameter).
  if (hasNoPath(objectName)) return 'no-released-api-path';

  // Check if any finding requires architect sign-off
  const needsDecision = findings.some(f => f.needsBusinessDecision === true);
  if (needsDecision) return 'needs-architect';

  return 'clean-core-ready';
}

// ── Quadrant computation (§4 matrix) ───────────────────────────────

/**
 * Usage × Feasibility → Quadrant
 *
 * |                        | heavy       | moderate     | low            | dormant          | unknown |
 * |------------------------|-------------|--------------|----------------|------------------|---------|
 * | no-released-api-path   | 🔴 danger   | high         | 🟡 low-prio    | 🟡 retire-cand.  | ⚪ unknown |
 * | needs-architect        | 🔴 danger   | medium       | low-prio       | retire-cand.     | ⚪ unknown |
 * | clean-core-ready       | 🟢 prioritize | low-priority | low-prio     | retire-cand.     | ⚪ unknown |
 *
 * §5 SAFEGUARD: unknown usage → ALWAYS 'unknown' quadrant, regardless of feasibility.
 * §6 SAFEGUARD: 'low' usage → NEVER 'retire-candidate'. Low ≠ dormant.
 */
function computeQuadrant(usage: UsageBucket, feasibility: Feasibility): Quadrant {
  // §5: Unknown usage = unknown quadrant. Period. And a zero from a window too
  // short to mean anything is no better than no data (E03-F02).
  if (usage === 'unknown' || usage === 'unobserved') return 'unknown';

  if (usage === 'heavy') {
    if (feasibility === 'clean-core-ready') return 'prioritize';
    return 'danger'; // no-released-api-path or needs-architect
  }

  if (usage === 'moderate') {
    return 'low-priority';
  }

  // §6: Low usage = low-priority, NEVER retire-candidate.
  // Low-frequency objects may be business-critical (monthly closings, year-end, audit).
  if (usage === 'low') {
    return 'low-priority';
  }

  // dormant (zero calls or last used > 13 months ago)
  return 'retire-candidate';
}

// ── Percentile helper ──────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Quadrant metadata (for UI) ─────────────────────────────────────

export const QUADRANT_META: Record<Quadrant, { label: string; emoji: string; color: string; bgColor: string; description: string }> = {
  'danger': {
    label: 'Danger Zone',
    emoji: '🔴',
    color: 'text-red-700',
    bgColor: 'bg-red-50 border-red-200',
    description: 'High usage + no clean path — plan and resource first.',
  },
  'prioritize': {
    label: 'Prioritize',
    emoji: '🟢',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50 border-emerald-200',
    description: 'High usage + feasible — transform first for maximum impact.',
  },
  'retire-candidate': {
    label: 'Retire Candidate',
    emoji: '🟡',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50 border-amber-200',
    description: 'Zero calls across a declared window of 13+ months, or last used 13+ months ago — retire after business owner confirmation.',
  },
  'low-priority': {
    label: 'Low Priority',
    emoji: '⚪',
    color: 'text-slate-600',
    bgColor: 'bg-slate-50 border-slate-200',
    description: 'Moderate usage, clean path — transform when convenient.',
  },
  'unknown': {
    label: 'Unknown Usage',
    emoji: '❓',
    color: 'text-slate-500',
    bgColor: 'bg-slate-50 border-slate-200',
    description: 'No usage data for the object — or zero calls in a window too short, or undeclared, to call it disuse. Neither is evidence of non-use; verify manually before retiring.',
  },
};
