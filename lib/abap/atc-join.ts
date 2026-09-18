/**
 * ATC × Evidence Comparison (roadmap 7.1)
 *
 * Compares an imported ATC worklist with the engine's own evidence findings,
 * object by object. This is a **comparison, not a join in the usual sense**:
 * unlike `usage-join.ts`, which combines usage intensity and feasibility into
 * one quadrant per object, this module never combines an `AtcFinding` and an
 * `EvidenceFinding` into one value. The two lists stay separate on every row
 * (`AtcJoinRow.atcFindings`, `AtcJoinRow.engineFindingIds`); what is computed
 * is only which of the three states in `AtcComparisonState` the object falls
 * into. See that type's own doc comment for what each state does and does not
 * say — the misreading it guards against is the point of this module.
 */

import type { AtcComparisonState, AtcFinding, AtcJoinRow, AtcReport } from './atc-model';
import type { AbapEvidenceReport, EvidenceFinding } from './evidence-model';

/**
 * The set of object names a comparison over this ATC report and this evidence
 * will produce a row for — every object either one names, upper-cased.
 * Exposed for the same reason `usageJoinObjectNames` is: a caller that needs
 * the exact set this comparison will visit, without duplicating the union.
 */
export function atcJoinObjectNames(
  atc: Pick<AtcReport, 'findings'>,
  evidence: Pick<AbapEvidenceReport, 'findings'>,
): string[] {
  const names = new Set<string>();
  for (const f of atc.findings) names.add(f.objectName.toUpperCase());
  for (const f of evidence.findings) {
    if (f.objectName) names.add(f.objectName.toUpperCase());
  }
  return [...names];
}

export function joinAtcWithEvidence(
  atc: Pick<AtcReport, 'findings'>,
  // Only the findings are read here, for the same reason `joinUsageWithEvidence`
  // takes only `findings` rather than the whole evidence report: inventing a
  // `coverage` value for a caller that has none would be exactly the kind of
  // unearned claim this repository's guards exist to catch.
  evidence: Pick<AbapEvidenceReport, 'findings'>,
): AtcJoinRow[] {
  const atcByObject = new Map<string, AtcFinding[]>();
  for (const f of atc.findings) {
    const key = f.objectName.toUpperCase();
    const list = atcByObject.get(key) || [];
    list.push(f);
    atcByObject.set(key, list);
  }

  const evidenceByObject = new Map<string, EvidenceFinding[]>();
  for (const f of evidence.findings) {
    if (!f.objectName) continue;
    const key = f.objectName.toUpperCase();
    const list = evidenceByObject.get(key) || [];
    list.push(f);
    evidenceByObject.set(key, list);
  }

  const allObjects = atcJoinObjectNames(atc, evidence);
  const rows: AtcJoinRow[] = allObjects.map((objectName) => {
    const atcFindings = atcByObject.get(objectName) ?? [];
    const engineFindings = evidenceByObject.get(objectName) ?? [];
    const state: AtcComparisonState =
      atcFindings.length > 0 && engineFindings.length > 0 ? 'both'
      : atcFindings.length > 0 ? 'atc-only'
      : 'engine-only';
    return {
      objectName,
      state,
      atcFindings,
      engineFindingIds: engineFindings.map((f) => f.id),
    };
  });

  // Same ordering intent as the usage matrix: what needs a human's attention
  // first is listed first. Overlap is where the two sources of evidence
  // corroborate each other's coverage of an object, so it leads.
  const stateOrder: Record<AtcComparisonState, number> = { both: 0, 'atc-only': 1, 'engine-only': 2 };
  rows.sort((a, b) => stateOrder[a.state] - stateOrder[b.state] || a.objectName.localeCompare(b.objectName));
  return rows;
}

/** Counts for a summary strip — never a combined "total findings" across the two sources (honesty rule 2). */
export interface AtcComparisonCounts {
  both: number;
  atcOnly: number;
  engineOnly: number;
}

export function summarizeAtcComparison(rows: AtcJoinRow[]): AtcComparisonCounts {
  const counts: AtcComparisonCounts = { both: 0, atcOnly: 0, engineOnly: 0 };
  for (const row of rows) {
    if (row.state === 'both') counts.both++;
    else if (row.state === 'atc-only') counts.atcOnly++;
    else counts.engineOnly++;
  }
  return counts;
}
