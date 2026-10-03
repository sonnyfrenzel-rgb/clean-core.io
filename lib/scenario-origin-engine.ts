import { sha256Hex } from '@/lib/artefact-digest';
import { buildProcessFacts } from '@/lib/abap/process-facts';
import { buildProcessSkeletonFrom } from '@/lib/abap/process-skeleton';
import { deriveBusinessRulesFrom } from '@/lib/abap/business-rule-set';
import { findingObjects, type OriginEngine, type OriginEngineObject, type OriginFindingInput } from '@/lib/scenario-origin';

/**
 * The engine objects a scenario's origin is checked against, built from one
 * source — the one the active run signed.
 *
 * No model, no network, no catalog: the business rules and the process skeleton
 * are derived from the text alone (`deriveBusinessRules`), so the browser can
 * build this as `hooks/useProcessRules.ts` does. The findings carry the SAP
 * catalog and are read on the server (`GET /api/projects/{id}/evidence`); they
 * are handed in, and `null` means they are not available — a finding reference
 * is then reported as not checked.
 *
 * Imported dynamically by its callers: it pulls the statement reader, the block
 * structure, the control flow and the skeleton with it.
 */

export function buildOriginEngine(source: string, findings: readonly OriginFindingInput[] | null): OriginEngine {
  const facts = buildProcessFacts(source);
  const skeleton = buildProcessSkeletonFrom(facts);
  const set = deriveBusinessRulesFrom(source, facts, skeleton);

  const rules: OriginEngineObject[] = set.rules.map((rule) => {
    const ranges: Array<{ lineStart: number; lineEnd: number }> = [];
    const add = (r: { lineStart: number; lineEnd: number }) => {
      if (!ranges.some((x) => x.lineStart === r.lineStart && x.lineEnd === r.lineEnd)) ranges.push({ lineStart: r.lineStart, lineEnd: r.lineEnd });
    };
    for (const s of rule.sentences) for (const a of s.anchors) add(a);
    for (const p of rule.parameters) add(p);
    ranges.sort((a, b) => a.lineStart - b.lineStart || a.lineEnd - b.lineEnd);
    return { id: rule.id, label: rule.label, ranges };
  });

  const anchored = skeleton.nodes.filter((n) => n.anchor !== null);
  const nodeObject = (n: (typeof anchored)[number]): OriginEngineObject => ({
    id: n.id,
    label: n.label,
    ranges: [{ lineStart: n.anchor!.lineStart, lineEnd: n.anchor!.lineEnd }],
  });
  const byLine = (a: OriginEngineObject, b: OriginEngineObject) => a.ranges[0].lineStart - b.ranges[0].lineStart;
  const decisions = anchored.filter((n) => n.kind === 'gateway').map(nodeObject).sort(byLine);
  const steps = anchored.map(nodeObject).sort(byLine);

  return {
    sourceSha256: sha256Hex(source),
    sourceLines: source.split(/\r\n|\r|\n/),
    rules,
    decisions,
    steps,
    findings: findings ? findingObjects(findings) : null,
  };
}
