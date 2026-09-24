import { worstGrade, type CloudReadinessGrade, type GradedObject, type ObjectUse } from '@/lib/abap/abcd-classification';
import type { CallGraphReport } from '@/lib/abap/call-graph';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import type { TableDependencyReport } from '@/lib/abap/table-dependencies';
import type { UsageRecord, UsageReport } from '@/lib/abap/usage-model';
import type { ProcessMapModel } from '@/lib/process-map';
import type { OverlayDefinition, ProcessNavigation } from '@/lib/process-navigation';

/**
 * The three overlays roadmap 6.3 adds to the process map — **display, never
 * content**.
 *
 * `lib/process-navigation.ts` already builds the three overlays the drawn model
 * can prove on its own (hard-coded, not determined, decisions) and says in so
 * many words why *Findings* and *Level A-D* were left out there: they are
 * artefacts of other stages, and a second reading of the file inside the map
 * would be a second opinion beside 2.6. So they are not read a second time
 * here either. This module **joins** what the engine already produced —
 * `buildAbapEvidence`'s findings, the call graph, the table dependencies, the
 * imported usage report, the levels `/api/abcd-classify` answered — onto the
 * elements the skeleton already anchored, and produces marks.
 *
 * Four rules it is built on:
 *
 *   1. **The join is the line anchor and nothing else.** An element carries an
 *      object, a finding or a usage row when the statement that produced it
 *      sits inside that element's line range. An element without an anchor
 *      carries nothing — it is already in the *Not determined* overlay, and
 *      guessing at it there would be the fabrication rule 6 of the skeleton
 *      forbids.
 *   2. **The code behind a task is the routine it calls.** Measured on the
 *      1.000-line example: the 77 elements are anchored to the statement that
 *      produced them, and the median anchor is **one line** — the `subProcess`
 *      for `VALIDATE_SELECTION` sits on the `PERFORM` at line 159 while the
 *      `FORM` itself runs from 181 to 194. Joining on the anchor alone placed
 *      **8 of 102** object sites, which is not the code behind a task, it is
 *      the line that calls it. So an element's range is its anchor *plus* the
 *      body of every `FORM` that a `PERFORM` inside that anchor names — one
 *      level, never transitively: what the routine performs in turn is drawn
 *      on the plane that element opens, and counting it here as well would
 *      report the same statement on every level above it.
 *   3. **The narrowest range wins.** Those bodies nest around the elements
 *      drawn inside them, so a statement is assigned to the smallest range
 *      that contains it and is counted exactly once. Two elements performing
 *      the same routine is the one tie there is, and outline order breaks it.
 *   4. **The level never becomes content.** Nothing here is written, stored,
 *      hashed or signed. `CLAUDE.md`: *"The grade is never part of the signed
 *      audit pack."* The audit pack is built from the run in
 *      `lib/audit-pack-build.ts`, which does not import this file, and
 *      `tests/process-overlays.spec.ts` holds both halves of that.
 *
 * ## Why the level overlay says which snapshot answered
 *
 * `lib/abap/catalog-service.ts` has no notion of `deployment` or `edition` —
 * measured 23.09.2026, zero occurrences — and the one snapshot this product
 * ships is SAP's `abap-atc-cr-cv-s4hc`, the released-object list of the
 * **Public** Edition. A private-edition project is graded against that list
 * today. Making the snapshot a parameter is roadmap 7.10 and is not done here;
 * what *is* done here is refusing to let the overlay imply an answer that
 * depends on an operating model it never asked about. The note below says
 * which list answered, and that there is only one.
 */

/* ------------------------------------------------------------------ *
 * Object sites — where the code behind an element touches a named object.
 * ------------------------------------------------------------------ */

export type ObjectSiteKind = 'table' | 'function-module' | 'transaction' | 'report';

export interface ObjectSite {
  /** Upper-cased. Never a placeholder and never a computed name. */
  name: string;
  kind: ObjectSiteKind;
  /**
   * How the code touches it, for the objects where that moves the level:
   * reading KNA1 is C, writing it is D. `null` for a call — a called object
   * has no use, and `gradeSapObjectUse` grades it from the name.
   */
  use: ObjectUse | null;
  /** The line the statement starts on. */
  line: number;
}

/**
 * Every named SAP or customer object the source touches, with its line.
 *
 * Two readers, both of which the engine already runs elsewhere, and nothing
 * else: `readTableDependencies` for the data and `readCallGraph` for the calls.
 * A dynamic target is skipped — `CALL FUNCTION (lv_name)` names no object, and
 * a level on it would be an invention. So is a `possibleTargetOf` value: R26
 * says a value the source shows for an unresolved dynamic name is a possible
 * target, never the target, and the level overlay does not get to be the place
 * where that distinction quietly disappears.
 */
export function objectSites(
  tables: TableDependencyReport,
  calls: CallGraphReport,
): ObjectSite[] {
  const out: ObjectSite[] = [];

  for (const dependency of tables.dependencies) {
    if (dependency.possibleTargetOf) continue;
    out.push({
      name: dependency.table.toUpperCase(),
      kind: 'table',
      use: dependency.access,
      line: dependency.line,
    });
  }

  for (const call of calls.functionModules) {
    if (call.dynamic || !call.name) continue;
    out.push({ name: call.name.toUpperCase(), kind: 'function-module', use: null, line: call.lineStart });
  }
  for (const call of calls.transactions) {
    if (call.dynamic || !call.code) continue;
    out.push({ name: call.code.toUpperCase(), kind: 'transaction', use: null, line: call.lineStart });
  }
  for (const call of calls.submits) {
    if (call.dynamic || !call.program) continue;
    out.push({ name: call.program.toUpperCase(), kind: 'report', use: null, line: call.lineStart });
  }

  return out.sort((a, b) => a.line - b.line || a.name.localeCompare(b.name));
}

/** One stretch of source an element answers for. */
export interface ElementRange {
  id: string;
  lineStart: number;
  lineEnd: number;
  /** `anchor` for the element's own statement, `body` for a routine it performs. */
  of: 'anchor' | 'body';
}

/**
 * Every stretch of source the elements answer for, narrowest first.
 *
 * Rules 2 and 3 above. `calls` is optional, and leaving it out is a smaller
 * claim rather than a wrong one: without the call graph an element answers for
 * the statement it was drawn from and for nothing else.
 */
export function elementRanges(
  model: ProcessMapModel,
  nav: ProcessNavigation,
  calls: CallGraphReport | null,
): ElementRange[] {
  const order = new Map([...nav.order.entries()].map(([index, id]) => [id, index]));
  const anchored = model.elements.filter(
    (element) => element.anchor !== null && order.has(element.id),
  );

  const ranges: ElementRange[] = anchored.map((element) => {
    const span = element.anchor as { lineStart: number; lineEnd: number };
    return { id: element.id, lineStart: span.lineStart, lineEnd: span.lineEnd, of: 'anchor' };
  });

  if (calls) {
    const forms = new Map(calls.forms.map((form) => [form.name.toUpperCase(), form]));
    for (const element of anchored) {
      const span = element.anchor as { lineStart: number; lineEnd: number };
      for (const perform of calls.performs) {
        // A computed target, or one in another program, names no body in this
        // source; taking the nearest one would be an invented anchor.
        if (perform.dynamic || perform.program || !perform.target) continue;
        if (perform.lineStart < span.lineStart || perform.lineStart > span.lineEnd) continue;
        const form = forms.get(perform.target.toUpperCase());
        if (!form) continue;
        ranges.push({ id: element.id, lineStart: form.lineStart, lineEnd: form.lineEnd, of: 'body' });
      }
    }
  }

  return ranges.sort((a, b) =>
    (a.lineEnd - a.lineStart) - (b.lineEnd - b.lineStart)
    || (order.get(a.id) as number) - (order.get(b.id) as number));
}

function ownerOf(ranges: readonly ElementRange[], line: number): string | null {
  for (const range of ranges) {
    if (line >= range.lineStart && line <= range.lineEnd) return range.id;
  }
  return null;
}

/** Element id -> the object sites the code behind it touches, in line order. */
export function sitesByElement(
  model: ProcessMapModel,
  nav: ProcessNavigation,
  sites: readonly ObjectSite[],
  calls: CallGraphReport | null = null,
): Map<string, ObjectSite[]> {
  const ranges = elementRanges(model, nav, calls);
  const out = new Map<string, ObjectSite[]>();
  for (const site of sites) {
    const owner = ownerOf(ranges, site.line);
    if (!owner) continue;
    const held = out.get(owner);
    if (held) held.push(site);
    else out.set(owner, [site]);
  }
  return out;
}

/** The distinct objects of a set of sites, for one batch lookup. */
export function lookupObjects(sites: readonly ObjectSite[]): { name: string; use: ObjectUse | null }[] {
  const seen = new Map<string, { name: string; use: ObjectUse | null }>();
  for (const site of sites) {
    const key = site.use ? `${site.name}@${site.use}` : site.name;
    if (!seen.has(key)) seen.set(key, { name: site.name, use: site.use });
  }
  return [...seen.values()];
}

/* ------------------------------------------------------------------ *
 * Level A-D.
 * ------------------------------------------------------------------ */

/**
 * The one snapshot this product ships, named in the overlay itself.
 *
 * Not a decoration: the level the overlay prints is the Public Edition answer,
 * whatever edition the project runs on, because `catalog-service.ts` has no
 * edition to ask about (roadmap 7.10). Saying so is cheaper than being wrong
 * quietly.
 */
export const LEVEL_OVERLAY_NOTE =
  'Levels come from the one released-object snapshot this product ships: SAP’s abap-atc-cr-cv-s4hc, '
  + 'release "latest" — the list for S/4HANA Cloud Public Edition. There is no second snapshot here, '
  + 'so a private-edition project is read against this one too.';

/** `NAME` or `NAME@use`, the shape `/api/abcd-classify` answers with. */
function keyOf(site: ObjectSite): string {
  return site.use ? `${site.name}@${site.use}` : site.name;
}

const USE_WORD: Record<ObjectUse, string> = { read: 'read', write: 'write', reference: 'type' };

/**
 * *Level A-D* — the clean core level of the code behind a task.
 *
 * The mark is the **worst** level among the objects the element touches, with
 * the object that carries it, because that is the level a reader has to act on:
 * one D write makes the step a D step whatever else it reads.
 *
 * `null` while the lookup has not answered. An overlay reading *Level A-D 0*
 * would say "no levels here", which is a different claim from "not looked up
 * yet", and this repository does not stand in for an unknown with a default.
 */
export function buildLevelOverlay(
  byElement: ReadonlyMap<string, readonly ObjectSite[]>,
  grades: Readonly<Record<string, GradedObject>>,
  nav: ProcessNavigation,
): OverlayDefinition | null {
  if (Object.keys(grades).length === 0) return null;

  const marks = new Map<string, string>();
  const ids: string[] = [];

  for (const id of nav.order) {
    const sites = byElement.get(id);
    if (!sites || sites.length === 0) continue;

    const graded: { site: ObjectSite; grade: CloudReadinessGrade }[] = [];
    for (const site of sites) {
      const answer = grades[keyOf(site)];
      if (answer) graded.push({ site, grade: answer.grade });
    }
    if (graded.length === 0) continue;

    const letters = graded.map((entry) => entry.grade);
    // `worstGrade` is the rollup rule of `abcd-classification.ts` (F-05) and is
    // not restated here; the object named is the first one that carries it.
    const worst = worstGrade(letters);
    const worstFor = (graded.find((entry) => entry.grade === worst) ?? graded[0]).site;
    const use = worstFor.use ? ` (${USE_WORD[worstFor.use]})` : '';
    // The rollup leaves Unknown out of the letter, as SAP's does. The mark
    // must not leave it out of the count: an ungraded object folded into
    // "+N" reads as one more graded object, and "not determined" is never
    // rounded away (QA full review of 81810c8, bfbbcc22a9f2). When nothing
    // was determined the letter itself says Unknown and the count stays "+N".
    const undetermined = worst === 'Unknown' ? 0 : letters.filter((g) => g === 'Unknown').length;
    const rest = letters.length - 1 - undetermined;
    marks.set(
      id,
      `${worst} · ${worstFor.name}${use}${rest > 0 ? ` +${rest}` : ''}${undetermined > 0 ? ` · ${undetermined} not determined` : ''}`,
    );
    ids.push(id);
  }

  return { key: 'level', label: 'Level A–D', ids, marks, note: LEVEL_OVERLAY_NOTE };
}

/* ------------------------------------------------------------------ *
 * Findings.
 * ------------------------------------------------------------------ */

const SEVERITY_ORDER = ['Info', 'Low', 'Medium', 'High', 'Critical'] as const;

/**
 * *Findings* — what the evidence engine reported at the lines behind an element.
 *
 * The caller hands over the findings; the join is `finding.lineStart` against
 * the element anchors. A finding whose line no element covers is not marked
 * anywhere, and
 * that is the correct outcome rather than a missing one — not every statement
 * of a program becomes a BPMN element, and attaching a finding to the nearest
 * element would be an invented anchor.
 */
export function buildFindingsOverlay(
  model: ProcessMapModel,
  nav: ProcessNavigation,
  findings: readonly EvidenceFinding[],
  calls: CallGraphReport | null = null,
): OverlayDefinition {
  const ranges = elementRanges(model, nav, calls);
  const byElement = new Map<string, EvidenceFinding[]>();
  for (const finding of findings) {
    const owner = ownerOf(ranges, finding.lineStart);
    if (!owner) continue;
    const held = byElement.get(owner);
    if (held) held.push(finding);
    else byElement.set(owner, [finding]);
  }

  const marks = new Map<string, string>();
  const ids: string[] = [];
  for (const id of nav.order) {
    const held = byElement.get(id);
    if (!held || held.length === 0) continue;
    const worst = held.reduce((carry, finding) =>
      SEVERITY_ORDER.indexOf(finding.severity) > SEVERITY_ORDER.indexOf(carry.severity) ? finding : carry);
    const names = held.slice(0, 3).map((finding) => finding.id);
    const rest = held.length - names.length;
    marks.set(id, `${names.join(', ')}${rest > 0 ? ` +${rest}` : ''} · ${worst.severity}`);
    ids.push(id);
  }

  return { key: 'findings', label: 'Findings', ids, marks };
}

/* ------------------------------------------------------------------ *
 * Usage — only when it was imported.
 * ------------------------------------------------------------------ */

function usageMark(record: UsageRecord): string {
  const last = record.lastUsed ? `last used ${record.lastUsed}` : 'no last-use date';
  if (record.callCount === null) return `${record.objectName} · no count in the export · ${last}`;
  return `${record.objectName} · ${record.callCount} ${record.callCount === 1 ? 'call' : 'calls'} · ${last}`;
}

/**
 * *Usage* — what the imported export measured for the objects a step calls.
 *
 * Two deliberate restraints:
 *
 *   - **No overlay at all without an import.** `null`, not an overlay counting
 *     zero. A measured zero and an absent measurement are different facts, and
 *     `usage-model.ts` keeps `callCount: null` apart from `0` for exactly that
 *     reason: the parser used to coerce one into the other and turned "we have
 *     no usage data" into "delete this code".
 *   - **No bucket.** `heavy`/`dormant`/`unobserved` are derived in
 *     `lib/abap/usage-join.ts` from percentiles over the whole report and a
 *     declared monitoring window. Re-deriving them here from a different set of
 *     rows would be a second answer to the same question. The mark prints what
 *     the export recorded — the count and the last-use date — and the Analyze
 *     stage stays the one place that judges it.
 *
 * Only calls are joined, never tables: a usage export lists executable objects,
 * and matching a table name against it would be a name collision, not a
 * measurement.
 */
export function buildUsageOverlay(
  byElement: ReadonlyMap<string, readonly ObjectSite[]>,
  nav: ProcessNavigation,
  usage: UsageReport | null | undefined,
): OverlayDefinition | null {
  if (!usage || !Array.isArray(usage.records) || usage.records.length === 0) return null;

  const records = new Map<string, UsageRecord>();
  for (const record of usage.records) {
    const name = (record.objectName || '').trim().toUpperCase();
    if (name && !records.has(name)) records.set(name, record);
  }

  const marks = new Map<string, string>();
  const ids: string[] = [];
  for (const id of nav.order) {
    const sites = byElement.get(id);
    if (!sites) continue;
    const hits: UsageRecord[] = [];
    const seen = new Set<string>();
    for (const site of sites) {
      if (site.kind === 'table') continue;
      const record = records.get(site.name);
      if (!record || seen.has(site.name)) continue;
      seen.add(site.name);
      hits.push(record);
    }
    if (hits.length === 0) continue;
    const rest = hits.length - 1;
    marks.set(id, `${usageMark(hits[0])}${rest > 0 ? ` +${rest}` : ''}`);
    ids.push(id);
  }

  return {
    key: 'usage',
    label: 'Usage',
    ids,
    marks,
    note: `Counts as the ${usage.source.toUpperCase()} export recorded them, not a judgement of use — the Analyze stage weighs them.`,
  };
}
