import { sha256Hex } from '@/lib/artefact-digest';
import { buildAbapEvidence, type EvidenceFinding } from '@/lib/abap/evidence-model';
import { buildProcessFacts } from '@/lib/abap/process-facts';
import { containerAt } from '@/lib/abap/block-structure';
import { deriveBusinessRules } from '@/lib/abap/business-rule-set';
import { gradeSapObjectUse } from '@/lib/abap/catalog-service';
import { CLASSIC_VIEW_META, CLOUD_VIEW_META, type ObjectUse } from '@/lib/abap/abcd-classification';
import type { ItFindingRow, ItFindingsSource } from './it-findings';

/**
 * The rows of `lib/it-findings.ts`, derived from one ABAP source — roadmap 8.1.
 *
 * **Server-only.** `buildAbapEvidence` and `gradeSapObjectUse` both reach the
 * merged SAP catalog, 4.3 MB of generated JSON, and `lib/first-look.ts` states
 * the rule this file exists to keep: the workspace route does not ship a catalog
 * to a browser to recompute an answer the server can give. The one caller is
 * `app/api/projects/[projectId]/findings/route.ts`.
 *
 * **One engine, not a second opinion.** This is the same deterministic pass the
 * signed run makes — the same evidence builder, the same rule derivation, the
 * same catalog service. It adds the join the IT view needs and no judgement of
 * its own, and it writes nothing: the clean core level in particular is never
 * stored (`CLAUDE.md` — *"The grade is never part of the signed audit pack."*).
 *
 * Its own module rather than a function in the route so that a spec can run the
 * derivation over the product's own examples without importing a route handler,
 * the Admin SDK and `next/server` with it.
 */

/**
 * The use behind a finding's kind, where the kind names one.
 *
 * Read off the kind and nothing else — the finding carries no access type of its
 * own. This matters: `gradeSapObjectUse('VBAK', 'read')` is C and the same
 * object written is D, and grading every table read as a write would publish a D
 * for the 21 `standard-table-read` findings of the 1.000-line example.
 */
function accessUseOfKind(kind: string): ObjectUse | null {
  if (kind.endsWith('-read')) return 'read';
  if (kind.endsWith('-write')) return 'write';
  return null;
}

function rowOf(
  finding: EvidenceFinding,
  routine: string | null,
  rulesCoveringLine: string[],
  rulesInRoutine: string[],
): ItFindingRow {
  const objectName = finding.objectName ? finding.objectName.trim().toUpperCase() : null;
  // No object, no question for the catalog — and therefore no level, rather
  // than an Unknown that would read as "the catalog was asked and shrugged".
  const graded = objectName ? gradeSapObjectUse(objectName, accessUseOfKind(finding.kind)) : null;

  return {
    id: finding.id,
    kind: finding.kind,
    title: finding.title,
    severity: finding.severity,
    objectName,
    objectType: finding.objectType ?? null,
    lineStart: finding.lineStart,
    lineEnd: typeof finding.lineEnd === 'number' ? finding.lineEnd : null,
    routine,
    level: graded ? graded.grade : null,
    releaseView: graded?.cloudView ? CLOUD_VIEW_META[graded.cloudView].label : null,
    classificationView: graded?.classicView ? CLASSIC_VIEW_META[graded.classicView].label : null,
    successor: finding.sapReplacement?.objectName ?? null,
    targetOptions: [...(finding.targetOptions ?? [])],
    rulesCoveringLine,
    rulesInRoutine,
  };
}

/** The rows of one source — pulled out so nothing about it depends on a request. */
export function findingsOf(source: string, fileName: string, deployment?: 'public' | 'private'): ItFindingsSource {
  const evidence = buildAbapEvidence(source, fileName, deployment);
  const rules = deriveBusinessRules(source);
  const containers = buildProcessFacts(source).structure.containers;

  // `BR-nnn` by routine, once, rather than per finding.
  const byRoutine = new Map<string, string[]>();
  for (const rule of rules.rules) {
    for (const place of rule.sources) {
      const key = place.routine ? place.routine.toUpperCase() : '';
      const held = byRoutine.get(key) ?? [];
      if (!held.includes(rule.id)) held.push(rule.id);
      byRoutine.set(key, held);
    }
  }

  const rows = evidence.findings.map((finding) => {
    const container = containerAt(containers, finding.lineStart);
    const routine = container ? container.name.toUpperCase() : null;
    // A rule covers the finding when one of its own anchors contains the line.
    // Nothing looser: an anchor is what the rule was written from, and a rule
    // that merely stands nearby has not been shown to require this statement.
    const covering = rules.rules
      .filter((rule) =>
        rule.sentences.some((sentence) =>
          sentence.anchors.some(
            (anchor) => finding.lineStart >= anchor.lineStart && finding.lineStart <= anchor.lineEnd,
          ),
        ),
      )
      .map((rule) => rule.id);
    const inRoutine = (byRoutine.get(routine ?? '') ?? []).filter((id) => !covering.includes(id));
    return rowOf(finding, routine, covering, inRoutine);
  });

  return { rows, sourceSha256: sha256Hex(source), rulesDerived: rules.rules.length };
}
