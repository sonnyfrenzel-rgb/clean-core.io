/**
 * The business layer (SOP and RACI) of a program too large for one model
 * answer, written in parts — roadmap 3.0.13 (owner, dev acceptance 14.10.2026:
 * the SD example stopped with "the model did not answer within 90 seconds").
 *
 * What makes a call long is its answer: one RACI row and two to four claims
 * for every step the model writes. Until 16.10.2026 that was every element of
 * the process — 196 for the SD reference (1,847 lines). Since the owner's
 * decision of that day the layer is written on the business level
 * (`lib/business-steps.ts`): one row per step "How it works" lists — 14 for
 * the SD reference, 6 for the PM holdout, 11 and 15 for the two shipped
 * examples — with the elements under each step as its detail. So the answer
 * is small, and a program is written in one call while it has at most
 * `maxStepsPerPart` business steps and its prompt stays under
 * `maxPromptChars`; in parts otherwise:
 *
 *   - **the steps** a part writes are business steps, never torn apart: a
 *     part reads the business steps it writes with every element under them;
 *   - **as many parts as the steps or the prompt length need**, at most
 *     `maxParts`, the business steps packed in process order by their weight
 *     (the step and the elements under it), so each part reads a similar
 *     share of the documentation;
 *   - **each part reads its own slice** of the documentation
 *     (`documentationPart`): its elements, and the statements whose lines lie
 *     in their lines or in the routine an element calls; a statement no part
 *     claims goes to the nearest part. The summary at the top — what the
 *     program does and does not do — is the whole program's in every part;
 *   - **the first part names the roles**, the others are asked to reuse them
 *     (`rolesOfLayer`), so the joined matrix keeps one small set of roles; the
 *     others then run `parallel` at a time;
 *   - **joined** by concatenation (`mergeBusinessLayerParts`): each part keeps
 *     only rows for its own business steps, and the first row of a step wins.
 *
 * The limits are assumptions until measured with a real model (see
 * `BUSINESS_LAYER_PART_LIMITS`). Pure: no React, no network.
 */

import type { DocAnchor, DocStatement, DocStep, ProcessDocumentation } from './process-documentation';
import { businessSopPrompt } from './business-sop-prompt';
import { businessStepOfElement, businessStepsOf, type BusinessStep } from './business-steps';
import { minutesWords, type DurationRange } from './transformation/duration-estimate';

export interface BusinessLayerPartLimits {
  /** Business steps one model answer writes at most. */
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
 * share of usable rows of one call over the SD reference, with the provider's
 * default thinking and with LOW (`GEMINI_THINKING_DOCUMENTATION_BUSINESS`,
 * `lib/model-thinking.ts`); then set the limits to what keeps the p90 well
 * inside one call's deadline, and `BUSINESS_CALL_P50_MS` / `P90_MS` below to
 * what was measured.
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
  /** The business step ids this part writes rows for, in process order. */
  stepIds: string[];
  /** Their names — for the screen ("Order check, Pricing"). */
  groupNames: string[];
}

export interface BusinessLayerPlan {
  /** One part: the whole program in one call. */
  whole: boolean;
  parts: BusinessLayerPart[];
  /** Business steps the layer covers in all. */
  steps: number;
  /** The whole program's prompt length — the measure beside the steps. */
  promptChars: number;
  /** The business steps, with the elements under each (`lib/business-steps.ts`). */
  businessSteps: BusinessStep[];
}

const EVENT = /^(?:start|end)\b|error boundary/i;

/** The elements a reader acts on: every element but start, end and error-boundary events. */
export function writableSteps(doc: ProcessDocumentation): DocStep[] {
  return doc.steps.filter((s) => !EVENT.test(s.kind));
}

/** The parts of the business layer of `doc` — one when it fits into one answer. */
export function planBusinessLayerParts(
  doc: ProcessDocumentation,
  limits: BusinessLayerPartLimits = BUSINESS_LAYER_PART_LIMITS,
  steps: readonly BusinessStep[] = businessStepsOf(doc),
): BusinessLayerPlan {
  const businessSteps = [...steps];
  const promptChars = businessSopPrompt(doc, undefined, businessSteps).length;
  const n = businessSteps.length;
  const wanted = Math.min(
    Math.max(1, limits.maxParts),
    Math.max(1, Math.ceil(n / Math.max(1, limits.maxStepsPerPart)), Math.ceil(promptChars / Math.max(1, limits.maxPromptChars))),
  );
  if (wanted <= 1 || n <= 1) {
    return { whole: true, steps: n, promptChars, businessSteps, parts: [{ index: 0, stepIds: businessSteps.map((s) => s.id), groupNames: [] }] };
  }
  // Never more than `maxParts`: a large program gets larger parts instead of more calls.
  const perPart = Math.max(limits.maxStepsPerPart, Math.ceil(n / Math.max(1, limits.maxParts)));
  const weight = (s: BusinessStep) => 1 + s.technical.length;
  const target = Math.ceil(businessSteps.reduce((sum, s) => sum + weight(s), 0) / wanted);
  const parts: BusinessLayerPart[] = [];
  let open: BusinessLayerPart = { index: 0, stepIds: [], groupNames: [] };
  let load = 0;
  for (const step of businessSteps) {
    const full = open.stepIds.length > 0 && (load + weight(step) > target || open.stepIds.length + 1 > perPart);
    // The last part takes what is left, so the plan stays within `wanted` parts.
    if (full && parts.length < wanted - 1) {
      parts.push(open);
      open = { index: parts.length, stepIds: [], groupNames: [] };
      load = 0;
    }
    open.stepIds.push(step.id);
    open.groupNames.push(step.name);
    load += weight(step);
  }
  if (open.stepIds.length) parts.push(open);
  parts.forEach((p, i) => { p.index = i; });
  return { whole: parts.length <= 1, steps: n, promptChars, businessSteps, parts };
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

/**
 * The part each element belongs to: the part of its business step; an event
 * the part of the element it is drawn in. An event of the main path belongs
 * to no part.
 */
function partOfElements(doc: ProcessDocumentation, plan: BusinessLayerPlan): Map<string, number> {
  const home = businessStepOfElement(plan.businessSteps);
  const partOfStep = new Map<string, number>();
  plan.parts.forEach((p) => p.stepIds.forEach((id) => partOfStep.set(id, p.index)));
  const byId = new Map(doc.steps.map((s) => [s.id, s]));
  const out = new Map<string, number>();
  for (const step of doc.steps) {
    let current: DocStep | undefined = step;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      const business = home.get(current.id);
      const part = business !== undefined ? partOfStep.get(business) : undefined;
      if (part !== undefined) {
        out.set(step.id, part);
        break;
      }
      current = current.level === null ? undefined : byId.get(current.level) ?? byId.get(current.level.split('__')[0]);
    }
  }
  return out;
}

/** The lines each part stands on: its elements' anchors and the routines they call. */
function partRanges(doc: ProcessDocumentation, plan: BusinessLayerPlan, source?: string | null): DocAnchor[][] {
  const routines = routineRanges(source);
  const partOf = partOfElements(doc, plan);
  const ranges: DocAnchor[][] = plan.parts.map(() => []);
  for (const step of doc.steps) {
    const i = partOf.get(step.id);
    if (i === undefined) continue;
    if (step.anchor) ranges[i].push(step.anchor);
    const routine = routines.get(step.technicalName.toUpperCase());
    if (routine) ranges[i].push(routine);
  }
  return ranges;
}

/**
 * The statements each part reads: those whose lines lie in its ranges, and a
 * statement no part claims goes to the nearest part (by lines), so nothing of
 * the program is lost from every prompt.
 */
export function statementsByPart(doc: ProcessDocumentation, plan: BusinessLayerPlan, source?: string | null): DocStatement[][] {
  const ranges = partRanges(doc, plan, source);
  const partOf = partOfElements(doc, plan);
  const out: DocStatement[][] = plan.parts.map(() => []);
  const ownStatement = new Map<string, number>();
  for (const step of doc.steps) {
    const i = partOf.get(step.id);
    if (i !== undefined && step.statementId && !ownStatement.has(step.statementId)) ownStatement.set(step.statementId, i);
  }
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
 * its own business steps with every element under them (the events drawn
 * inside them included) and its statements.
 */
export function documentationPart(
  doc: ProcessDocumentation,
  plan: BusinessLayerPlan,
  index: number,
  source?: string | null,
  statements: DocStatement[][] = statementsByPart(doc, plan, source),
): ProcessDocumentation {
  const partOf = partOfElements(doc, plan);
  const steps = doc.steps.filter((s) => partOf.get(s.id) === index);
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
  if (plan.whole) return businessSopPrompt(doc, undefined, plan.businessSteps);
  const part = plan.parts[index];
  const own = new Set(part.stepIds);
  return businessSopPrompt(documentationPart(doc, plan, index, source), {
    index,
    total: plan.parts.length,
    stepIds: part.stepIds,
    roles: index === 0 ? [] : roles,
  }, plan.businessSteps.filter((s) => own.has(s.id)));
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

/* ------------------------------------------------------------ the other parts */

/**
 * Writes parts 1..total-1, `parallel` at a time, after the first. On the first
 * failure no further part starts and `stop` runs (the page aborts the calls in
 * flight); the run still ends only once every worker has settled, so the lease
 * is not released while a sibling can still change part state or the answers.
 * The first failure is rethrown.
 */
export async function writeRemainingParts(
  total: number,
  parallel: number,
  write: (index: number) => Promise<unknown>,
  stop: () => void,
): Promise<void> {
  let next = 1;
  let failure: { err: unknown } | null = null;
  const worker = async () => {
    while (!failure && next < total) {
      const index = next++;
      await write(index);
    }
  };
  const count = Math.min(Math.max(1, Math.floor(parallel) || 1), total - 1);
  await Promise.all(Array.from({ length: Math.max(0, count) }, () => worker().catch((err: unknown) => {
    if (failure) return;
    failure = { err };
    stop();
  })));
  if (failure) throw (failure as { err: unknown }).err;
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
