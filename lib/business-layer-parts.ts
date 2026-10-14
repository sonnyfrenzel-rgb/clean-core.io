/**
 * The business layer (SOP and RACI) of a program too large for one model
 * answer, written in parts — roadmap 3.0.13 (owner, dev acceptance 14.10.2026:
 * the SD example stopped with "the model did not answer within 90 seconds").
 *
 * What makes a call long is its answer: one RACI row and two to four claims
 * for every step the model writes. The SD reference (1,847 lines) has 196 such
 * steps and a 192,000-character prompt; the PM holdout (1,924 lines) 37 steps
 * and 118,000 characters; the two shipped examples 47 and 49 steps and
 * 52,000–58,000 characters, and those are written in one call today. So a
 * program is written in one call while it has at most
 * `maxStepsPerPart` steps and its prompt stays under `maxPromptChars`, and in
 * parts otherwise:
 *
 *   - **the steps** a part writes are the process elements a reader acts on —
 *     every element but the start, end and error-boundary events
 *     (`writableSteps`);
 *   - **grouped by process step**: each element belongs to the step of the
 *     main process it is drawn under (its top-level sub-process), and a group
 *     is never torn apart while it fits into one part; a group larger than a
 *     part is cut in its own order. Lanes do not partition these programs —
 *     the SD reference has two (the user and one authorization object), the
 *     PM holdout one — so the cut follows the process steps, not the lanes;
 *   - **packed in process order** into parts of at most `maxStepsPerPart`
 *     steps, at most `maxParts` parts (beyond that a part grows instead);
 *   - **each part reads its own slice** of the documentation
 *     (`documentationPart`): its elements, and the statements whose lines lie
 *     in their lines or in the routine an element calls; a statement no part
 *     claims goes to the nearest part. The summary at the top — what the
 *     program does and does not do — is the whole program's in every part;
 *   - **the first part names the roles**, the others are asked to reuse them
 *     (`rolesOfLayer`), so the joined matrix keeps one small set of roles; the
 *     others then run `parallel` at a time;
 *   - **joined** by concatenation (`mergeBusinessLayerParts`): each part keeps
 *     only rows for its own elements, and the first row for an element wins.
 *
 * The limits are assumptions until measured with a real model (see
 * `BUSINESS_LAYER_PART_LIMITS`). Pure: no React, no network.
 */

import type { DocAnchor, DocStatement, DocStep, ProcessDocumentation } from './process-documentation';
import { businessSopPrompt } from './business-sop-prompt';
import { minutesWords, type DurationRange } from './transformation/duration-estimate';

export interface BusinessLayerPartLimits {
  /** Steps one model answer writes at most. 49 are written in one call today (the PO approval example). */
  maxStepsPerPart: number;
  /** A prompt longer than this is split even with few steps. The PM holdout's whole prompt is 118,000. */
  maxPromptChars: number;
  /** At most this many parts (calls of the hourly limit); a larger program gets larger parts. */
  maxParts: number;
  /** Parts written at the same time after the first. */
  parallel: number;
}

/**
 * The limits, in one place. Not measured with a real model yet — to measure
 * (no real call is made from the tests): the latency (p50/p90), the output
 * and thinking tokens (`lib/model-usage-log.ts` logs them per call) and the
 * share of usable rows of one call over 20, 40, 60 and 80 steps of the SD
 * reference, with the provider's default thinking and with LOW
 * (`GEMINI_THINKING_DOCUMENTATION_BUSINESS`, `lib/model-thinking.ts`); then
 * set `maxStepsPerPart` to the largest size whose p90 stays well inside one
 * call's deadline, and `BUSINESS_CALL_P50_MS` / `P90_MS` below to what was
 * measured.
 */
export const BUSINESS_LAYER_PART_LIMITS: Readonly<BusinessLayerPartLimits> = Object.freeze({
  maxStepsPerPart: 60,
  maxPromptChars: 150_000,
  maxParts: 8,
  parallel: 2,
});

/** One model answer for one part, typical — an assumption until measured (see above). */
export const BUSINESS_CALL_P50_MS = 60_000;
/** One model answer for one part, slow — an assumption until measured. */
export const BUSINESS_CALL_P90_MS = 180_000;

export interface BusinessLayerPart {
  /** 0-based. */
  index: number;
  /** The element ids this part writes rows for, in process order. */
  stepIds: string[];
  /** The step of the main process each of its groups belongs to — for the screen ("Order check, Pricing"). */
  groupNames: string[];
}

export interface BusinessLayerPlan {
  /** One part: the whole program in one call, with the prompt it always had. */
  whole: boolean;
  parts: BusinessLayerPart[];
  /** Steps the layer covers in all. */
  steps: number;
  /** The whole program's prompt length — the measure beside the steps. */
  promptChars: number;
}

const EVENT = /^(?:start|end)\b|error boundary/i;

/** The elements a reader acts on: every element but start, end and error-boundary events. */
export function writableSteps(doc: ProcessDocumentation): DocStep[] {
  return doc.steps.filter((s) => !EVENT.test(s.kind));
}

/** The top-level element an element is drawn under (itself at the top level). */
function topOf(byId: ReadonlyMap<string, DocStep>, step: DocStep): DocStep {
  let current = step;
  const seen = new Set<string>();
  while (current.level !== null && !seen.has(current.id)) {
    seen.add(current.id);
    // A nested level is written `outer__inner`; the outer one is the way up when the inner has no element.
    const parent = byId.get(current.level) ?? byId.get(current.level.split('__')[0]);
    if (!parent) break;
    current = parent;
  }
  return current;
}

function stepName(step: DocStep): string {
  return step.businessName ?? step.plainName ?? step.technicalName;
}

/** The parts of the business layer of `doc` — one when it fits into one answer. */
export function planBusinessLayerParts(
  doc: ProcessDocumentation,
  limits: BusinessLayerPartLimits = BUSINESS_LAYER_PART_LIMITS,
): BusinessLayerPlan {
  const writable = writableSteps(doc);
  const promptChars = businessSopPrompt(doc).length;
  if (writable.length <= limits.maxStepsPerPart && promptChars <= limits.maxPromptChars) {
    return { whole: true, steps: writable.length, promptChars, parts: [{ index: 0, stepIds: writable.map((s) => s.id), groupNames: [] }] };
  }
  const byId = new Map(doc.steps.map((s) => [s.id, s]));
  // Groups by the step of the main process, in the order the documentation holds them.
  const groups = new Map<string, { name: string; ids: string[] }>();
  for (const step of writable) {
    const top = topOf(byId, step);
    const group = groups.get(top.id) ?? { name: stepName(top), ids: [] };
    group.ids.push(step.id);
    groups.set(top.id, group);
  }
  // Never more than `maxParts`: a large program gets larger parts instead of more calls.
  const size = Math.max(limits.maxStepsPerPart, Math.ceil(writable.length / Math.max(1, limits.maxParts)));
  const parts: BusinessLayerPart[] = [];
  let open: BusinessLayerPart | null = null;
  const close = () => {
    if (open && open.stepIds.length) parts.push(open);
    open = null;
  };
  for (const group of groups.values()) {
    if (group.ids.length > size) {
      // A group larger than a part is cut in its own order.
      close();
      for (let i = 0; i < group.ids.length; i += size) {
        parts.push({ index: parts.length, stepIds: group.ids.slice(i, i + size), groupNames: [group.name] });
      }
      continue;
    }
    if (open && (open as BusinessLayerPart).stepIds.length + group.ids.length > size) close();
    if (!open) open = { index: parts.length, stepIds: [], groupNames: [] };
    const target: BusinessLayerPart = open;
    target.stepIds.push(...group.ids);
    target.groupNames.push(group.name);
  }
  close();
  parts.forEach((p, i) => { p.index = i; });
  return { whole: parts.length <= 1, steps: writable.length, promptChars, parts };
}

/* ------------------------------------------------------------ a part's slice */

/** Line ranges of the routines a source defines, by upper-case name (`FORM`, `METHOD`, `FUNCTION`, `MODULE`). */
export function routineRanges(source: string | null | undefined): Map<string, DocAnchor> {
  const out = new Map<string, DocAnchor>();
  if (!source) return out;
  const lines = source.split('\n');
  const open = /^\s*(FORM|METHOD|FUNCTION|MODULE)\s+([\w/~]+)/i;
  const ends: Record<string, RegExp> = {
    FORM: /^\s*ENDFORM\b/i,
    METHOD: /^\s*ENDMETHOD\b/i,
    FUNCTION: /^\s*ENDFUNCTION\b/i,
    MODULE: /^\s*ENDMODULE\b/i,
  };
  for (let i = 0; i < lines.length; i++) {
    const m = open.exec(lines[i]);
    if (!m) continue;
    const kind = m[1].toUpperCase();
    for (let j = i + 1; j < lines.length; j++) {
      if (ends[kind].test(lines[j])) {
        const name = m[2].toUpperCase();
        if (!out.has(name)) out.set(name, { lineStart: i + 1, lineEnd: j + 1 });
        break;
      }
    }
  }
  return out;
}

const overlaps = (a: DocAnchor, b: DocAnchor) => a.lineStart <= b.lineEnd && b.lineStart <= a.lineEnd;
const distance = (a: DocAnchor, b: DocAnchor) => (overlaps(a, b) ? 0 : Math.min(Math.abs(a.lineStart - b.lineEnd), Math.abs(b.lineStart - a.lineEnd)));

/** The lines each part stands on: its elements' anchors and the routines they call. */
function partRanges(doc: ProcessDocumentation, plan: BusinessLayerPlan, source?: string | null): DocAnchor[][] {
  const routines = routineRanges(source);
  const byId = new Map(doc.steps.map((s) => [s.id, s]));
  // A part also stands on the elements drawn inside its own (the events of a sub-process).
  const inside = (ids: Set<string>) => doc.steps.filter((s) => ids.has(s.id) || (s.level !== null && ids.has(topOf(byId, s).id)));
  return plan.parts.map((part) => {
    const ids = new Set(part.stepIds);
    const ranges: DocAnchor[] = [];
    for (const step of inside(ids)) {
      if (step.anchor) ranges.push(step.anchor);
      const routine = routines.get(step.technicalName.toUpperCase());
      if (routine) ranges.push(routine);
    }
    return ranges;
  });
}

/**
 * The statements each part reads: those whose lines lie in its ranges, and a
 * statement no part claims goes to the nearest part (by lines), so nothing of
 * the program is lost from every prompt.
 */
export function statementsByPart(doc: ProcessDocumentation, plan: BusinessLayerPlan, source?: string | null): DocStatement[][] {
  const ranges = partRanges(doc, plan, source);
  const byId = new Map(doc.steps.map((s) => [s.id, s]));
  const out: DocStatement[][] = plan.parts.map(() => []);
  const ownStatement = new Map<string, number>();
  plan.parts.forEach((part, i) => {
    for (const id of part.stepIds) {
      const st = byId.get(id)?.statementId;
      if (st) ownStatement.set(st, i);
    }
  });
  for (const statement of doc.statements) {
    const claimed = new Set<number>();
    const own = ownStatement.get(statement.id);
    if (own !== undefined) claimed.add(own);
    ranges.forEach((rs, i) => {
      if (statement.anchors.some((a) => rs.some((r) => overlaps(a, r)))) claimed.add(i);
    });
    if (claimed.size === 0 && ranges.length) {
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      ranges.forEach((rs, i) => {
        for (const r of rs) for (const a of statement.anchors) {
          const d = distance(a, r);
          if (d < bestDistance) { bestDistance = d; best = i; }
        }
      });
      claimed.add(best);
    }
    for (const i of claimed) out[i].push(statement);
  }
  return out;
}

/**
 * The documentation one part reads: the whole program's summary and facts,
 * its own elements (with the events drawn inside them) and its statements.
 */
export function documentationPart(
  doc: ProcessDocumentation,
  plan: BusinessLayerPlan,
  index: number,
  source?: string | null,
  statements: DocStatement[][] = statementsByPart(doc, plan, source),
): ProcessDocumentation {
  const part = plan.parts[index];
  const ids = new Set(part.stepIds);
  const byId = new Map(doc.steps.map((s) => [s.id, s]));
  const steps = doc.steps.filter((s) => ids.has(s.id) || (EVENT.test(s.kind) && s.level !== null && ids.has(topOf(byId, s).id)));
  const kept = new Set(steps.map((s) => s.id));
  return {
    ...doc,
    // A flow to an element of another part is not followed in this one.
    steps: steps.map((s) => ({ ...s, next: s.next.filter((f) => kept.has(f.to)) })),
    statements: statements[index] ?? [],
  };
}

/** The prompt of every part, in order. `roles` are the first part's, for the parts after it. */
export function businessLayerPartPrompt(
  doc: ProcessDocumentation,
  plan: BusinessLayerPlan,
  index: number,
  roles: readonly string[],
  source?: string | null,
): string {
  if (plan.whole) return businessSopPrompt(doc);
  const part = plan.parts[index];
  return businessSopPrompt(documentationPart(doc, plan, index, source), {
    index,
    total: plan.parts.length,
    stepIds: part.stepIds,
    roles: index === 0 ? [] : roles,
  });
}

/* ------------------------------------------------------------ joining */

const rowsOf = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)) : [];

/** A part's answer with only the rows of its own elements. */
export function keepPartRows(answer: Record<string, unknown>, stepIds: readonly string[]): Record<string, unknown> {
  const own = new Set(stepIds);
  const keep = (r: Record<string, unknown>) => typeof r.stepId === 'string' && own.has(r.stepId);
  return { ...answer, raci_matrix: rowsOf(answer.raci_matrix).filter(keep), sop_details: rowsOf(answer.sop_details).filter(keep) };
}

/** The roles a layer names, in the order they first appear. */
export function rolesOfLayer(answer: Record<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of rowsOf(answer.raci_matrix)) {
    for (const key of ['r', 'a', 'c', 'i']) {
      const value = row[key];
      if (typeof value !== 'string') continue;
      for (const part of value.split(/[,;/]/)) {
        const role = part.trim();
        if (role && !seen.has(role.toLowerCase())) {
          seen.add(role.toLowerCase());
          out.push(role);
        }
      }
    }
  }
  return out;
}

/** The parts joined into one layer: the lists concatenated in part order, the first row of an element kept. */
export function mergeBusinessLayerParts(answers: ReadonlyArray<Record<string, unknown>>): Record<string, unknown> {
  const first = answers[0] ?? {};
  const join = (key: 'raci_matrix' | 'sop_details') => {
    const seen = new Set<string>();
    const out: Array<Record<string, unknown>> = [];
    for (const answer of answers) {
      for (const row of rowsOf(answer[key])) {
        const id = typeof row.stepId === 'string' ? row.stepId : '';
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        out.push(row);
      }
    }
    return out;
  };
  return { ...first, raci_matrix: join('raci_matrix'), sop_details: join('sop_details') };
}

/* ------------------------------------------------------------ how long */

/** Rounds of calls: the first part alone, the rest `parallel` at a time. */
export function businessLayerWaves(parts: number, parallel: number = BUSINESS_LAYER_PART_LIMITS.parallel): number {
  if (parts <= 0) return 0;
  return 1 + Math.ceil((parts - 1) / Math.max(1, Math.floor(parallel) || 1));
}

/** The expected time of the whole layer, before the first call. */
export function expectedBusinessLayerDuration(parts: number, parallel?: number): DurationRange {
  const waves = businessLayerWaves(parts, parallel);
  return { lowMs: waves * BUSINESS_CALL_P50_MS, highMs: waves * BUSINESS_CALL_P90_MS };
}

/** "about 1–3 minutes (estimate)" — said before the call, beside the elapsed time while it runs. */
export function expectedBusinessLayerWords(parts: number, parallel?: number): string {
  return `${minutesWords(expectedBusinessLayerDuration(parts, parallel))} (estimate)`;
}
