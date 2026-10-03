import { sha256Hex } from '@/lib/artefact-digest';
import { buildAbapEvidence, type EvidenceFinding } from '@/lib/abap/evidence-model';
import { buildProcessFacts } from '@/lib/abap/process-facts';
import { containerAt } from '@/lib/abap/block-structure';
import { deriveBusinessRules } from '@/lib/abap/business-rule-set';
import { getCatalogSnapshotRef, gradeSapObjectUse } from '@/lib/abap/catalog-service';
import { routeKindLabel } from '@/lib/abap/extensibility-router';
import {
  CLASSIC_VIEW_META,
  CLOUD_VIEW_META,
  isCustomerObject,
  type CloudReadinessGrade,
  type ObjectUse,
} from '@/lib/abap/abcd-classification';
import { readTableDependencies } from '@/lib/abap/table-dependencies';
import type { CallGraphReport } from '@/lib/abap/call-graph';
import type { ItFindingRow, ItFindingsSource, ItUseRow } from './it-findings';
import { countSourceLines } from '@/lib/source-lines';

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
  catalogSnapshot: string | undefined,
): ItFindingRow {
  const objectName = finding.objectName ? finding.objectName.trim().toUpperCase() : null;
  // No object, no question for the catalog — and therefore no level, rather
  // than an Unknown that would read as "the catalog was asked and shrugged".
  const graded = objectName ? gradeSapObjectUse(objectName, accessUseOfKind(finding.kind), catalogSnapshot) : null;

  return {
    id: finding.id,
    kind: finding.kind,
    kindLabel: routeKindLabel(finding.kind),
    title: finding.title,
    severity: finding.severity,
    objectName,
    objectType: finding.objectType ?? null,
    lineStart: finding.lineStart,
    lineEnd: typeof finding.lineEnd === 'number' ? finding.lineEnd : null,
    routine,
    level: graded ? graded.grade : null,
    objectLevel: graded?.objectGrade ?? null,
    releaseView: graded?.cloudView ? CLOUD_VIEW_META[graded.cloudView].label : null,
    classificationView: graded?.classicView ? CLASSIC_VIEW_META[graded.classicView].label : null,
    successor: finding.sapReplacement?.objectName ?? null,
    successorType: finding.sapReplacement?.objectType ?? null,
    successorConfidence: finding.sapReplacement?.confidence ?? null,
    targetOptions: [...(finding.targetOptions ?? [])],
    rulesCoveringLine,
    rulesInRoutine,
  };
}

/**
 * The rows of one source — pulled out so nothing about it depends on a request.
 *
 * `catalogSnapshot` is the key of the project's target profile
 * (`catalogSnapshotKeyForProject`, roadmap 7.10): the findings and every level
 * on them are read from the catalog the signed run read, so a PCE project does
 * not show a Public Cloud level here and a PCE level in its run (owner
 * decision 30.09.2026). Omitted, the default file — the run route's own
 * default for a project that names no edition.
 */
export function findingsOf(
  source: string,
  fileName: string,
  deployment?: 'public' | 'private',
  catalogSnapshot?: string,
): ItFindingsSource {
  const evidence = buildAbapEvidence(source, fileName, deployment, catalogSnapshot);
  const rules = deriveBusinessRules(source);
  const facts = buildProcessFacts(source);
  const containers = facts.structure.containers;

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
    return rowOf(finding, routine, covering, inRoutine, catalogSnapshot);
  });

  return {
    rows,
    uses: usesOf(source, facts.calls, rows, catalogSnapshot),
    sourceSha256: sha256Hex(source),
    rulesDerived: rules.rules.length,
    catalog: getCatalogSnapshotRef(catalogSnapshot),
    coverage: {
      lines: countSourceLines(source),
      gaps: evidence.coverage.gaps.map((g) => ({ label: g.label, count: g.count, firstLine: g.firstLine })),
    },
  };
}

/* ------------------------------------------------------------ what the code uses */

const LEVEL_RANK: Record<CloudReadinessGrade, number> = { D: 0, C: 1, B: 2, A: 3, Unknown: 4 };

/**
 * Every object the code calls, reads or writes — the IT view's answer to "what
 * exactly", whether or not a detector raised a finding on it.
 *
 * Why it exists: `Z_SALES_ORDER_CREATOR` calls three BAPIs and has no finding,
 * because the detectors judge violations and a local `CALL FUNCTION` is outside
 * them (`lib/abap/coverage.ts` lists it as not assessed). The IT view then said
 * "no findings, 0 places" beside a process that plainly calls SAP. The calls
 * were known all along — `call-graph.ts` reads them for the process map — they
 * were just not shown.
 *
 * Read from the facts the findings were built from, so the lines agree:
 *
 *   - named function modules (`CALL FUNCTION 'X'`), BAPIs marked, a
 *     `DESTINATION` marked as remote. A computed name is not guessed — it is in
 *     *Not determined* as a dynamic call;
 *   - `CALL TRANSACTION` and `SUBMIT` with a name the source closes;
 *   - table reads and writes as `readTableDependencies` reads them — a type
 *     reference (`TYPE vbak`) is not a use and is left out;
 *   - an object a finding names that none of the above reached (a class, say),
 *     with the use its kind states.
 *
 * The level of a use is the finding's level where a finding stands on the same
 * object and line — one answer per place, never two letters for one statement —
 * and otherwise `gradeSapObjectUse` for that use under the same snapshot. It is
 * SAP's published classification, derived here and never stored.
 */
function usesOf(
  source: string,
  calls: CallGraphReport,
  rows: readonly ItFindingRow[],
  catalogSnapshot: string | undefined,
): ItUseRow[] {
  type Draft = { object: string; kind: ItUseRow['kind']; use: ItUseRow['use']; lines: Set<number>; remote: boolean };
  const drafts = new Map<string, Draft>();
  const add = (object: string | undefined, kind: ItUseRow['kind'], use: ItUseRow['use'], line: number, remote = false) => {
    const name = (object ?? '').trim().toUpperCase();
    if (!name) return;
    const key = `${name}@${use}`;
    const held = drafts.get(key) ?? { object: name, kind, use, lines: new Set<number>(), remote: false };
    held.lines.add(line);
    held.remote = held.remote || remote;
    drafts.set(key, held);
  };

  for (const call of calls.functionModules) {
    if (call.dynamic || !call.name) continue;
    add(call.name, call.bapi ? 'bapi' : 'function-module', 'call', call.lineStart, Boolean(call.destination));
  }
  for (const tx of calls.transactions) if (!tx.dynamic && tx.code) add(tx.code, 'transaction', 'call', tx.lineStart);
  for (const sub of calls.submits) if (!sub.dynamic && sub.program) add(sub.program, 'program', 'call', sub.lineStart);
  for (const dep of readTableDependencies(source).dependencies) {
    if (dep.access === 'reference' || dep.possibleTargetOf) continue;
    add(dep.table, 'table', dep.access === 'write' ? 'write' : 'read', dep.line);
  }
  // An object a finding names that the readers above did not reach.
  const reached = new Set([...drafts.values()].flatMap((d) => [...d.lines].map((line) => `${d.object}#${line}`)));
  for (const row of rows) {
    if (!row.objectName || reached.has(`${row.objectName}#${row.lineStart}`)) continue;
    const use = accessUseOfKind(row.kind);
    add(row.objectName, 'object', use === 'read' ? 'read' : use === 'write' ? 'write' : 'use', row.lineStart);
  }

  const out: ItUseRow[] = [...drafts.values()].map((d) => {
    const lines = [...d.lines].sort((a, b) => a - b);
    const onIt = rows.filter((r) => r.objectName === d.object && d.lines.has(r.lineStart));
    const fromFindings = onIt
      .map((r) => r.level)
      .filter((g): g is CloudReadinessGrade => g !== null)
      .sort((a, b) => LEVEL_RANK[a] - LEVEL_RANK[b])[0];
    const graded = gradeSapObjectUse(
      d.object,
      d.use === 'read' ? 'read' : d.use === 'write' ? 'write' : null,
      catalogSnapshot,
    );
    const worstRow = fromFindings ? onIt.find((r) => r.level === fromFindings) : undefined;
    return {
      object: d.object,
      kind: d.kind,
      use: d.use,
      lines,
      remote: d.remote,
      custom: isCustomerObject(d.object),
      level: fromFindings ?? graded.grade,
      // The finding's own answer where one stands here — said as such.
      levelBasis: fromFindings ? 'finding' : graded.provenance,
      releaseView: worstRow ? worstRow.releaseView : graded.cloudView ? CLOUD_VIEW_META[graded.cloudView].label : null,
      classificationView: worstRow
        ? worstRow.classificationView
        : graded.classicView
          ? CLASSIC_VIEW_META[graded.classicView].label
          : null,
      findingIds: onIt.map((r) => r.id),
    };
  });
  // Calls first, in the order the program makes them (the order the process
  // map reads), then writes and reads, worst level first, then by line.
  const USE_RANK: Record<ItUseRow['use'], number> = { call: 0, write: 1, read: 2, use: 3 };
  return out.sort(
    (a, b) =>
      USE_RANK[a.use] - USE_RANK[b.use] ||
      (a.use === 'call' ? 0 : LEVEL_RANK[a.level ?? 'Unknown'] - LEVEL_RANK[b.level ?? 'Unknown']) ||
      a.lines[0] - b.lines[0],
  );
}
