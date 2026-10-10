import { gradeKey, isCustomerObject, type CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import type { ProvenanceValue } from '@/lib/provenance';

/**
 * The business reader's view of the Documentation stage — owner, 03.10.2026
 * (translated): "make the Business SOP and the RACIs clearly more visual, with
 * less text, and get to the point. The business user must quickly understand
 * where the value or the problems lie."
 *
 * Nothing here is new knowledge. It **reorganises** two things the stage
 * already holds:
 *
 *   - the engine's reading of the signed source (the handbook of
 *     `lib/process-handbook.ts`, the coverage sweep, the clean core level of a
 *     table the code writes) — for the headline and the callouts. Every callout
 *     carries the evidence it stands on: a line range, a rule id or a table
 *     name with its line. A fact without one is not turned into a callout;
 *   - the stored business layer (a model proposal: SOP, RACI, controls) — for
 *     the step strip and the RACI matrix. Its steps are placed on the engine's
 *     process by element id; a step the process does not have stays visible and
 *     says so. A field the model left empty is `null` here and *Not determined*
 *     on screen, never a default.
 *
 * Pure: no engine import (the inputs are already read), no model, no network.
 * The page, the demo and the Confluence export read the same functions, so the
 * screen and the file cannot disagree.
 */

export interface GlanceAnchor {
  lineStart: number;
  lineEnd: number;
}

/* ------------------------------------------------------------------ inputs */

/** The part of `ProcessHandbook` this module reads — structural, so the demo's plain data fits too. */
export interface GlanceHandbook {
  chapters: Array<{
    reads: Array<{ name: string; plain: string | null; line: number }>;
    writes: Array<{ name: string; plain: string | null; line: number }>;
    calls: Array<{ name: string; plain: string | null; line: number }>;
    rules: Array<{ id: string; plain: string | null; text: string; anchor: GlanceAnchor | null }>;
    exceptions: Array<{ id: string; label: string; anchor: GlanceAnchor | null }>;
  }>;
  writes: Array<{ name: string; plain: string | null; line: number }>;
  calls: Array<{ name: string; plain: string | null; line: number }>;
  rulesOutside: Array<{ id: string; text: string; anchor: GlanceAnchor | null }>;
  counts: { rules: number; exceptions: number };
}

/** A construct the detectors stepped over — `assessCoverage().unassessed`. */
export interface GlanceGap {
  label: string;
  why: string;
  line: number;
}

/**
 * Clean core levels of the tables the code writes, keyed by `gradeKey(name, 'write')`.
 * `loading` and `error` are states of their own: a level that has not arrived
 * is shown as not determined, never as a guess.
 */
export interface GlanceLevels {
  status: 'loading' | 'ready' | 'error';
  byKey: Record<string, CloudReadinessGrade>;
}

/* ------------------------------------------------------------------ output */

export interface GlanceEvidence {
  /** What the evidence is about, as the engine read it — a table, a rule, a construct. */
  label: string;
  /** `BR-004`, `EKKO` — the reference beside the line. */
  ref: string | null;
  anchor: GlanceAnchor | null;
  /**
   * The clean core level, for a table written directly: a grade, or `null`
   * when it is not determined (lookup failed, pending, or Unknown).
   * Absent where a level does not apply.
   */
  level?: CloudReadinessGrade | null;
}

export type CalloutKind = 'direct-write' | 'hard-coded-rules' | 'early-end' | 'not-determined';

export interface BusinessCallout {
  kind: CalloutKind;
  tone: 'error' | 'warning' | 'information' | 'neutral';
  /** How many there are in all — the evidence below shows the first few. */
  count: number;
  evidence: GlanceEvidence[];
  provenance: Extract<ProvenanceValue, 'reconstructed' | 'not-determined'>;
}

export interface GlanceObject {
  name: string;
  plain: string | null;
  line: number;
}

/** "What this process does for the business" — counted and named, not written. */
export interface GlanceHeadline {
  steps: number;
  reads: GlanceObject[];
  writes: GlanceObject[];
  calls: GlanceObject[];
  rules: number;
}

/** At most this many evidence items stand under one callout; the count says how many there are. */
export const CALLOUT_EVIDENCE = 3;

const hasEvidence = (e: GlanceEvidence) => e.anchor !== null || e.ref !== null;

function distinct<T extends { name: string; line: number }>(objects: T[]): T[] {
  const seen = new Map<string, T>();
  for (const o of [...objects].sort((a, b) => a.line - b.line)) if (!seen.has(o.name)) seen.set(o.name, o);
  return [...seen.values()];
}

const lineAnchor = (line: number): GlanceAnchor => ({ lineStart: line, lineEnd: line });

export function glanceHeadline(handbook: GlanceHandbook): GlanceHeadline {
  return {
    steps: handbook.chapters.length,
    reads: distinct(handbook.chapters.flatMap((c) => c.reads)),
    writes: distinct(handbook.writes),
    calls: distinct(handbook.calls),
    rules: handbook.counts.rules,
  };
}

/**
 * Every rule the handbook holds, once: first the rules that decide at a step of
 * the process (in id order, with their plain sentence), then the ones the code
 * holds outside it — a declared constant is a rule too, but not the first one
 * a business reader should meet.
 */
function allRules(handbook: GlanceHandbook) {
  const inProcess = new Map<string, { id: string; label: string; anchor: GlanceAnchor | null }>();
  for (const chapter of handbook.chapters) {
    for (const rule of chapter.rules) {
      if (!inProcess.has(rule.id)) inProcess.set(rule.id, { id: rule.id, label: rule.plain ?? rule.text, anchor: rule.anchor });
    }
  }
  const outside = handbook.rulesOutside
    .filter((rule) => !inProcess.has(rule.id))
    .map((rule) => ({ id: rule.id, label: rule.text, anchor: rule.anchor }));
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id, 'en', { numeric: true });
  return [...[...inProcess.values()].sort(byId), ...outside.sort(byId)];
}

function levelOf(name: string, levels: GlanceLevels | null): CloudReadinessGrade | null {
  if (!levels || levels.status !== 'ready') return null;
  const grade = levels.byKey[gradeKey(name, 'write')];
  return grade && grade !== 'Unknown' ? grade : null;
}

/**
 * The callouts, in the order a business reader weighs them — what the code
 * changes behind SAP's back, what it decides on its own, where it stops early.
 *
 * The rules, and why each is safe to put in front of a reader:
 *
 *   1. **direct-write** — a table outside the customer namespace (`Z*`, `Y*`)
 *      that the code writes with a database statement (the handbook's writes,
 *      each with its line). The level is the catalog's, under ADR-062 "written
 *      directly → D"; it is shown beside the table only once the lookup has
 *      answered, otherwise *not determined*. The customer's own tables are not
 *      a callout: writing them is the program's business.
 *   2. **hard-coded-rules** — the rule set's `BR-nnn`, each a value or a
 *      condition that stands in the source (`property: 'hard-coded'`), with its
 *      id and its line.
 *   3. **early-end** — the ends of the flow the map marks as early or as an
 *      error boundary, with their lines.
 *
 * A callout is only made when at least one of its items carries a line or an
 * id. The not-determined points are not mixed in here; they have a box of
 * their own beside the callouts (`notDeterminedCallout`).
 */
export function businessCallouts(handbook: GlanceHandbook, levels: GlanceLevels | null): BusinessCallout[] {
  const out: BusinessCallout[] = [];

  const sapWrites = distinct(handbook.writes).filter((o) => !isCustomerObject(o.name));
  const writeEvidence: GlanceEvidence[] = sapWrites.map((o) => ({
    label: o.plain ?? o.name,
    ref: o.name,
    anchor: lineAnchor(o.line),
    level: levelOf(o.name, levels),
  }));
  if (writeEvidence.length > 0) {
    out.push({
      kind: 'direct-write',
      tone: writeEvidence.some((e) => e.level === 'D') ? 'error' : 'warning',
      count: writeEvidence.length,
      evidence: writeEvidence.slice(0, CALLOUT_EVIDENCE),
      provenance: 'reconstructed',
    });
  }

  const rules = allRules(handbook).map((r) => ({ label: r.label, ref: r.id, anchor: r.anchor }));
  if (rules.length > 0) {
    out.push({
      kind: 'hard-coded-rules',
      tone: 'information',
      // The rule set's own count — the same number the headline and the KPI
      // tile say; a rule at a decision outside every chapter still counts.
      count: Math.max(handbook.counts.rules, rules.length),
      evidence: rules.slice(0, CALLOUT_EVIDENCE),
      provenance: 'reconstructed',
    });
  }

  const early = handbook.chapters
    .flatMap((c) => c.exceptions)
    .map((e) => ({ label: e.label, ref: null, anchor: e.anchor }))
    .filter(hasEvidence);
  if (early.length > 0) {
    out.push({
      kind: 'early-end',
      tone: 'warning',
      count: handbook.counts.exceptions,
      evidence: early.slice(0, CALLOUT_EVIDENCE),
      provenance: 'reconstructed',
    });
  }

  return out;
}

/** The not-determined box: the coverage sweep's constructs, each with its line. Null while unknown. */
export function notDeterminedCallout(gaps: GlanceGap[] | null): BusinessCallout | null {
  if (gaps === null) return null;
  return {
    kind: 'not-determined',
    tone: 'neutral',
    count: gaps.length,
    evidence: gaps.slice(0, CALLOUT_EVIDENCE).map((g) => ({ label: g.label, ref: null, anchor: lineAnchor(g.line) })),
    provenance: 'not-determined',
  };
}

/* ------------------------------------------------------- the business layer */

/** What the stored layer holds — model JSON, read as the page reads it. */
export interface StoredBusinessLayer {
  raci_matrix?: unknown;
  sop_details?: unknown;
  audit_controls?: unknown;
}

/** A step of the process as the engine read it — from the stored documentation. */
export interface ProcessStepRef {
  id: string;
  name: string;
  technicalName: string;
  anchor: GlanceAnchor | null;
  /** The step's own provenance — `reconstructed`, or `confirmed` once a person confirmed it. */
  provenance: ProvenanceValue;
}

export type RaciLetter = 'R' | 'A' | 'C' | 'I';
export const RACI_LETTERS: readonly RaciLetter[] = ['R', 'A', 'C', 'I'];

export interface SopStep {
  stepId: string;
  /** 1-based, in the order of the process. */
  number: number;
  /** The engine's step, or null when the model named an id the process does not have. */
  step: ProcessStepRef | null;
  /** The first sentence of the narrative — the one-line outcome. Null when the model wrote none. */
  outcome: string | null;
  narrative: string | null;
  exception: string | null;
  kpi: string | null;
  roles: Record<RaciLetter, string[]>;
  /** True when the layer has a RACI row for this step. */
  hasRaci: boolean;
  /**
   * The model's text for this step says nothing the step's name does not —
   * no narrative, a sentence of a few words, or a filler such as "The check
   * authority step is carried out by the responsible role." (owner review
   * 10.10.2026). The card is flagged as thin, never hidden.
   */
  thin: boolean;
}

/** Fillers a model writes when it has nothing to say about a step. */
const THIN_TEXT: readonly RegExp[] = [
  /\bcarried out by the responsible role\b/i,
  /^the [^.]{1,80} step is (?:carried out|performed|handled|executed|done|completed)\b[^.]*\.?$/i,
  /^(?:this|the) step (?:is|will be) (?:carried out|performed|handled|executed|done|completed)\b/i,
];

/** Whether a narrative is too thin to stand as the step's description (see `SopStep.thin`). */
export function isThinNarrative(narrative: string | null): boolean {
  if (!narrative) return true;
  const first = firstSentence(narrative) ?? narrative;
  if (THIN_TEXT.some((re) => re.test(first))) return true;
  return first.split(/\s+/).filter(Boolean).length < 5;
}

const text = (value: unknown): string | null => {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  return t && !/^(n\/?a|none|-|—)$/i.test(t) ? t : null;
};

const rows = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)) : [];

/** "Finance, Internal Audit" → two roles. Commas, semicolons and slashes separate; case decides nothing. */
export function splitRoles(value: unknown): string[] {
  const t = text(value);
  if (!t) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of t.split(/[,;/]/)) {
    const role = part.trim();
    if (!role || seen.has(role.toLowerCase())) continue;
    seen.add(role.toLowerCase());
    out.push(role);
  }
  return out;
}

/** The first sentence, so a step reads in one line; the full narrative stays in the fold. */
export function firstSentence(value: string | null): string | null {
  if (!value) return null;
  const match = /^(.+?[.!?])(\s|$)/.exec(value);
  return (match ? match[1] : value).trim();
}

/**
 * The SOP steps in the order of the process: the engine's order for every id it
 * knows. A row the model wrote for an id the process does not have
 * ("Task_not_in_process") is not shown — owner review 10.10.2026: a step the
 * code does not have is never a row of the SOP or the RACI. Only when no
 * process is known (an empty list) is the layer drawn as it was written.
 */
export function sopSteps(layer: StoredBusinessLayer, process: ProcessStepRef[]): SopStep[] {
  const sop = rows(layer.sop_details);
  const raci = rows(layer.raci_matrix);
  const sopById = new Map<string, Record<string, unknown>>();
  const raciById = new Map<string, Record<string, unknown>>();
  const order: string[] = [];
  const note = (id: string) => {
    if (!order.includes(id)) order.push(id);
  };
  for (const row of sop) {
    const id = text(row.stepId);
    if (!id) continue;
    if (!sopById.has(id)) sopById.set(id, row);
    note(id);
  }
  for (const row of raci) {
    const id = text(row.stepId);
    if (!id) continue;
    if (!raciById.has(id)) raciById.set(id, row);
    note(id);
  }
  const position = new Map(process.map((s, i) => [s.id, i]));
  const byId = new Map(process.map((s) => [s.id, s]));
  const known = order.filter((id) => position.has(id)).sort((a, b) => position.get(a)! - position.get(b)!);
  const unknown = process.length ? [] : order.filter((id) => !position.has(id));

  return [...known, ...unknown].map((stepId, i) => {
    const s = sopById.get(stepId);
    const r = raciById.get(stepId);
    const narrative = text(s?.narrative);
    return {
      stepId,
      number: i + 1,
      step: byId.get(stepId) ?? null,
      outcome: firstSentence(narrative),
      narrative,
      exception: text(s?.businessException),
      kpi: text(s?.kpiTarget),
      roles: {
        R: splitRoles(r?.r),
        A: splitRoles(r?.a),
        C: splitRoles(r?.c),
        I: splitRoles(r?.i),
      },
      hasRaci: r !== undefined,
      thin: isThinNarrative(narrative),
    };
  });
}

/** How many rows of the stored layer name a step the process does not have — said once, never drawn. */
export function stepsNotInProcess(layer: StoredBusinessLayer, process: ProcessStepRef[]): number {
  if (!process.length) return 0;
  const known = new Set(process.map((s) => s.id));
  const ids = new Set<string>();
  for (const row of [...rows(layer.sop_details), ...rows(layer.raci_matrix)]) {
    const id = text(row.stepId);
    if (id && !known.has(id)) ids.add(id);
  }
  return ids.size;
}

export type RaciStepGap = 'no-accountable' | 'several-accountable' | 'no-responsible';

export interface RaciRole {
  name: string;
  /** A short form for a narrow column head ("PCC"); the full name is always shown beside the matrix. */
  short: string;
  counts: Record<RaciLetter, number>;
  /** Responsible on more than half the steps, and on at least three. */
  overloaded: boolean;
}

export interface RaciMatrix {
  /** The roles drawn as columns — at most `MAX_RACI_COLUMNS`, the ones that carry most. */
  roles: RaciRole[];
  /** Roles the model named beyond those — listed under the matrix with their letters, never dropped. */
  moreRoles: RaciRole[];
  steps: Array<SopStep & {
    gaps: RaciStepGap[];
    more: Array<{ role: string; letters: RaciLetter[] }>;
    /** The step's Accountable when its role is not a column — said in the row, never hidden. */
    hiddenAccountable: string[];
  }>;
  /** Every role the proposal names; above `MANY_RACI_ROLES` the stage says the proposal is too large. */
  totalRoles: number;
  /** Steps with at least one gap. */
  gapCount: number;
}

/** The overload line: a role that is Responsible on more than half the steps, and on three or more. */
export const OVERLOAD_MIN_STEPS = 3;

/**
 * The columns a matrix draws (owner 04.10.2026: "unrealistically many roles in
 * the RACI" — fourteen job titles, and the table scrolled sideways at 1440 px).
 * A realistic process has four to six roles; six columns plus the step and the
 * check fit a desktop without scrolling. The model is asked for a small set
 * (the prompt in the Documentation page), and this guard holds for any answer,
 * old or new: the six roles that carry most become columns, the others are
 * listed under the matrix with their letters per step. Nothing is merged and
 * nothing is invented.
 */
export const MAX_RACI_COLUMNS = 6;

/** More roles than this, and the stage says the proposal is larger than a process of this size needs. */
export const MANY_RACI_ROLES = 7;

/** A head longer than this is shortened to its initials; the full name stands in the key under the matrix. */
const SHORT_HEAD = 16;

function shortName(name: string, taken: Set<string>): string {
  if (name.length <= SHORT_HEAD) return name;
  const words = name.replace(/\([^)]*\)/g, ' ').split(/[\s/&-]+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|and|the|for)$/i.test(w));
  let short = words.map((w) => w[0].toUpperCase()).join('') || name.slice(0, 3).toUpperCase();
  let n = 2;
  while (taken.has(short)) short = `${short}${n++}`;
  taken.add(short);
  return short;
}

/**
 * Roles × steps. Only steps the layer has a RACI row for take part. The roles
 * are every name the rows use (a name in any case is one role), ranked by what
 * they carry — Accountable and Responsible first, then Consulted and Informed,
 * then the order they first appear — so the same layer gives the same matrix.
 * The gaps are read over every role, drawn or listed: a step without an
 * Accountable says so ("No Accountable named — to clarify"), and none is made
 * up for it.
 */
export function raciMatrix(steps: SopStep[]): RaciMatrix {
  const withRaci = steps.filter((s) => s.hasRaci);
  const roles = new Map<string, RaciRole & { first: number }>();
  let seen = 0;
  for (const step of withRaci) {
    for (const letter of RACI_LETTERS) {
      for (const name of step.roles[letter]) {
        const key = name.toLowerCase();
        const role = roles.get(key) ?? { name, short: name, counts: { R: 0, A: 0, C: 0, I: 0 }, overloaded: false, first: seen++ };
        role.counts[letter] += 1;
        roles.set(key, role);
      }
    }
  }
  const half = withRaci.length / 2;
  const weight = (r: RaciRole) => r.counts.A + r.counts.R;
  const ranked = [...roles.values()]
    .map((role) => ({ ...role, overloaded: role.counts.R >= OVERLOAD_MIN_STEPS && role.counts.R > half }))
    .sort((a, b) => weight(b) - weight(a) || (b.counts.C + b.counts.I) - (a.counts.C + a.counts.I) || a.first - b.first);
  const taken = new Set<string>();
  const list: RaciRole[] = ranked.map((role) => ({ name: role.name, counts: role.counts, overloaded: role.overloaded, short: shortName(role.name, taken) }));
  // The columns: first the Accountables, chosen so that as many steps as
  // possible show theirs (greedy cover — the role that covers most uncovered
  // steps first); then the roles that carry most fill the rest.
  const key = (n: string) => n.toLowerCase();
  const chosen: RaciRole[] = [];
  const uncovered = new Set(withRaci.filter((st) => st.roles.A.length > 0).map((st) => st.stepId));
  while (chosen.length < MAX_RACI_COLUMNS && uncovered.size > 0) {
    let best: RaciRole | null = null;
    let bestCount = 0;
    for (const role of list) {
      if (chosen.includes(role)) continue;
      const count = withRaci.filter((st) => uncovered.has(st.stepId) && st.roles.A.some((a) => key(a) === key(role.name))).length;
      if (count > bestCount) { best = role; bestCount = count; }
    }
    if (!best) break;
    chosen.push(best);
    for (const st of withRaci) if (st.roles.A.some((a) => key(a) === key(best!.name))) uncovered.delete(st.stepId);
  }
  for (const role of list) {
    if (chosen.length >= MAX_RACI_COLUMNS) break;
    if (!chosen.includes(role)) chosen.push(role);
  }
  const shown = list.filter((r) => chosen.includes(r));
  const moreRoles = list.filter((r) => !chosen.includes(r));

  const rowsOut = withRaci.map((step) => {
    const gaps: RaciStepGap[] = [];
    if (step.roles.A.length === 0) gaps.push('no-accountable');
    if (step.roles.A.length > 1) gaps.push('several-accountable');
    if (step.roles.R.length === 0) gaps.push('no-responsible');
    const more = moreRoles
      .map((role) => ({ role: role.name, letters: lettersOf(step, role.name) }))
      .filter((m) => m.letters.length > 0);
    const hiddenAccountable = step.roles.A.filter((a) => !shown.some((r) => key(r.name) === key(a)));
    return { ...step, gaps, more, hiddenAccountable };
  });
  return { roles: shown, moreRoles, steps: rowsOut, gapCount: rowsOut.filter((s) => s.gaps.length > 0).length, totalRoles: list.length };
}

/** The letters one role holds on one step, in R-A-C-I order. */
export function lettersOf(step: SopStep, role: string): RaciLetter[] {
  const key = role.toLowerCase();
  return RACI_LETTERS.filter((letter) => step.roles[letter].some((r) => r.toLowerCase() === key));
}

/** The engine's steps as `ProcessStepRef`, from the stored documentation's steps. */
export function processStepsOf(
  steps: Array<{ id: string; technicalName: string; businessName: string | null; anchor: GlanceAnchor | null; provenance: ProvenanceValue }>,
  labels?: Map<string, string>,
): ProcessStepRef[] {
  return steps.map((s) => ({
    id: s.id,
    name: labels?.get(s.id) ?? s.businessName ?? s.technicalName,
    technicalName: s.technicalName,
    anchor: s.anchor ?? null,
    // An engine step is a reconstruction unless its file proves more
    // (`lib/process-documentation.ts`); a stored step without the field is read so.
    provenance: s.provenance ?? 'reconstructed',
  }));
}
