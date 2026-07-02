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

import type { UsageReport, UsageRecord, UsageBucket, UsageJoinRow, RiskLevel, Quadrant, Feasibility } from './usage-model';
import type { AbapEvidenceReport, EvidenceFinding } from './evidence-model';
import type { ExtensibilityRouteReport } from './extensibility-router';
import { hasNoReleasedApiPath } from './catalog-service';

// ── Public API ─────────────────────────────────────────────────────

export function joinUsageWithEvidence(
  usage: UsageReport,
  evidence: AbapEvidenceReport,
  _route: ExtensibilityRouteReport,
): UsageJoinRow[] {
  // Build usage lookup: objectName → UsageRecord
  const usageMap = new Map<string, UsageRecord>();
  for (const r of usage.records) {
    const key = r.objectName.toUpperCase();
    const existing = usageMap.get(key);
    if (existing) {
      // Merge: sum call counts, keep latest lastUsed
      existing.callCount += r.callCount;
      if (r.lastUsed && (!existing.lastUsed || r.lastUsed > existing.lastUsed)) {
        existing.lastUsed = r.lastUsed;
      }
    } else {
      usageMap.set(key, { ...r });
    }
  }

  // Compute percentile thresholds for bucketing
  const callCounts = usage.records.map(r => r.callCount).filter(c => c > 0).sort((a, b) => a - b);
  const p25 = percentile(callCounts, 25);
  const p75 = percentile(callCounts, 75);

  // Dormancy threshold: 13 months (394 days) before measurement end
  const dormancyThreshold = usage.measuredTo
    ? new Date(new Date(usage.measuredTo).getTime() - 394 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    : undefined;

  // Collect all unique object names from BOTH usage and evidence
  const allObjects = new Set<string>();
  for (const r of usage.records) allObjects.add(r.objectName.toUpperCase());
  for (const f of evidence.findings) {
    if (f.objectName) allObjects.add(f.objectName.toUpperCase());
  }

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

    const bucket = classifyUsageBucket(usageRecord, p25, p75, dormancyThreshold);
    const riskLevel = deriveRiskLevel(objectFindings);
    const feasibility = deriveFeasibility(objName, objectFindings);
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
): UsageBucket {
  // §5 SAFEGUARD: no record → unknown, NEVER dormant
  if (!record) return 'unknown';

  // Zero calls → dormant
  if (record.callCount === 0) return 'dormant';

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

function deriveFeasibility(objectName: string, findings: EvidenceFinding[]): Feasibility {
  // Check if any finding has no released API path
  if (hasNoReleasedApiPath(objectName)) return 'no-released-api-path';

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
  // §5: Unknown usage = unknown quadrant. Period.
  if (usage === 'unknown') return 'unknown';

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
    description: 'Zero usage or dormant for 13+ months — retire after business owner confirmation.',
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
    description: 'No usage data in the imported export. Missing data is not evidence of non-use — verify manually before retiring.',
  },
};
