/**
 * What Analyze in the Management view reads off the engine's findings (ADR-143; `components/analyze/AnalyzeManagement.tsx`).
 * Pure: the rows of `GET /api/projects/{id}/findings`, nothing else. A view: never stored, never signed.
 */
import type { ItFindingRow } from './it-findings';

/** The sections of the page, in "On this page" order. */
export const MANAGEMENT_PAGE_IDS = Object.freeze({
  options: 'mgmt-options',
  risk: 'mgmt-risk',
  needs: 'mgmt-needs',
  open: 'mgmt-still-open',
});

const SERIOUS = new Set<ItFindingRow['severity']>(['Critical', 'High']);
const SEVERITY_RANK: Record<ItFindingRow['severity'], number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };

export interface ManagementRiskGroup {
  kind: string;
  /** The kind in plain words, as the router prints it. */
  label: string;
  count: number;
  /** The worst severity in the group. */
  severity: ItFindingRow['severity'];
  /** The first three places, for line anchors. */
  lines: { start: number; end: number | null }[];
}

export interface ManagementRisks {
  /** The serious findings (critical or high). */
  total: number;
  /** The worst group's label, or `null` when there is none. */
  worst: string | null;
  groups: ManagementRiskGroup[];
}

/**
 * "Risk if nothing changes": the critical and high findings of the signed run, grouped by kind, worst first, then by
 * count. Each group keeps its first three places as line anchors. No finding is invented or weighed: the engine's own
 * severity decides.
 */
export function managementRisks(rows: readonly ItFindingRow[]): ManagementRisks {
  const by = new Map<string, ManagementRiskGroup>();
  for (const r of rows) {
    if (!SERIOUS.has(r.severity)) continue;
    const g = by.get(r.kind) ?? { kind: r.kind, label: plainKind(r.kindLabel ?? r.kind), count: 0, severity: r.severity, lines: [] };
    g.count += 1;
    if (SEVERITY_RANK[r.severity] < SEVERITY_RANK[g.severity]) g.severity = r.severity;
    if (g.lines.length < 3 && !g.lines.some((l) => l.start === r.lineStart)) g.lines.push({ start: r.lineStart, end: r.lineEnd });
    by.set(r.kind, g);
  }
  const groups = [...by.values()].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count || a.label.localeCompare(b.label));
  for (const g of groups) g.lines.sort((a, b) => a.start - b.start);
  return { total: groups.reduce((n, g) => n + g.count, 0), worst: groups[0]?.label ?? null, groups };
}

/** "reads of SAP standard tables" → "Reads of SAP standard tables". */
function plainKind(text: string): string {
  const t = text.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/**
 * The Level A–D mix of the objects the findings name, counted once per object and level — a reading of SAP's lists for
 * the screen (`lib/abap/abcd-classification.ts`), never part of the signed pack. Rows without a level are not counted.
 */
export function managementLevelMix(rows: readonly ItFindingRow[]): Record<'A' | 'B' | 'C' | 'D', number> {
  const mix = { A: 0, B: 0, C: 0, D: 0 };
  const seen = new Set<string>();
  for (const r of rows) {
    const level = r.level;
    if (level !== 'A' && level !== 'B' && level !== 'C' && level !== 'D') continue;
    const key = `${r.objectName ?? `${r.kind}@${r.lineStart}`}|${level}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mix[level] += 1;
  }
  return mix;
}
