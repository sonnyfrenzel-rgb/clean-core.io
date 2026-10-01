import type { EvidenceFinding } from './abap/evidence-model';

/**
 * The deterministic half of the initial worklist: one item per grouped finding.
 *
 * Moved out of the Analyze stage so the workspace produces the identical
 * worklist. It is reached from four places in a run (`lib/analysis-run.ts`) —
 * a parsed narrative, an unparseable one, a run with no narrative at all
 * (roadmap 1.2), and a run started from the list report (roadmap 1.8) — and
 * from the demo, which shows the worklist a run of the example would store.
 *
 * Pure, and a module of its own for the demo's sake: the demo may have no code
 * path to a run, and `lib/analysis-run.ts` is one.
 */
export function findingsWorklist(
  findings: EvidenceFinding[],
  fileName: string,
): Record<string, unknown>[] {
  const grouped = new Map<string, { finding: EvidenceFinding; lines: number[] }>();
  for (const f of findings) {
    const groupKey = `${f.kind}::${f.objectName || f.title}`;
    const existing = grouped.get(groupKey);
    if (existing) {
      existing.lines.push(f.lineStart);
    } else {
      grouped.set(groupKey, { finding: f, lines: [f.lineStart] });
    }
  }
  return Array.from(grouped.values()).map(({ finding: f, lines }, idx) => ({
    id: `finding-${f.kind}-${idx}`,
    title: lines.length > 1 ? `${f.title} (${lines.length}×)` : f.title,
    category: 'Finding',
    level: f.severity === 'Critical' || f.severity === 'High' ? 'not-supported' : 'partial',
    severity: f.severity === 'Critical' || f.severity === 'High' ? 'High' : f.severity === 'Medium' ? 'Medium' : 'Low',
    location: lines.length > 1 ? `${fileName}:${lines.join(', ')}` : `${fileName}:${lines[0]}`,
    recommendation: f.recommendation,
    status: 'open',
    effort: f.severity === 'Critical' ? 'High' : f.severity === 'High' || f.severity === 'Medium' ? 'Medium' : 'Low',
    targetAnchor: f.kind,
    detail: f.technicalDetail,
  }));
}
