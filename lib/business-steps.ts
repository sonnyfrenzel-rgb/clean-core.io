/**
 * The business steps of a process — the level the SOP and the RACI are
 * written on (owner decision 16.10.2026, on the SD reference program of about
 * 1,850 lines: "SOP = 196 steps? not usable", "RACI not usable").
 *
 * Until then the business layer had one SOP card and one RACI row for every
 * element of the process map a reader could act on — `validate_selection`,
 * "Demo selected?", "For each raw", "No raw found?" — 196 of them for the SD
 * reference, each with a narrative, an exception and model-guessed roles. The
 * description of the same program lists 14 steps under "How it works": the
 * main path of the process description (`overview.path` of
 * `lib/process-document-build.ts`). Those are the business steps:
 *
 *   - **the steps** are the elements of the top level of the map, in the order
 *     a run takes them (`readingOrder`), without the events, the decision
 *     points and a bare list output (`WRITE`) — and, where the top level is
 *     one routine that holds everything, that routine's own steps one level
 *     up (the rule of the description, so the two lists agree);
 *   - **every other element** belongs to the business step it is drawn under
 *     (its sub-process chain), and an element drawn under none of them — a
 *     decision point of the main path, a bare output — to the business step
 *     before it in reading order (the first one when none precedes it). They
 *     are the step's technical steps: folded under it on the screen and in the
 *     files, complete underneath, never rows of their own.
 *
 * Pure: no React, no network, read from the stored documentation alone — the
 * page, the prompt, the parts and the stored layer read the same list.
 */

import { docStepName, type DocAnchor, type DocStep, type ProcessDocumentation } from './process-documentation';
import { readingOrder } from './process-documentation-path';

/** What a business layer written on this level says about itself (`level` of the stored layer). */
export const BUSINESS_STEP_LEVEL = 'business-step' as const;

/** One element folded under a business step. */
export interface TechnicalStep {
  id: string;
  /** The engine's plain name (the naming stage's where one is saved) — never only the id. */
  name: string;
  /** "Decision point", "Service step" … */
  kind: string;
  technicalName: string;
  anchor: DocAnchor | null;
  /** 1 directly under the business step, 2 one level further in … */
  depth: number;
}

export interface BusinessStep {
  /** The BPMN element id — the same id the map, the `.bpmn` file and the description use. */
  id: string;
  name: string;
  technicalName: string;
  anchor: DocAnchor | null;
  /** The elements under it, in reading order. */
  technical: TechnicalStep[];
}

const EVENT_KIND = /^(?:start|end)\b|^event$|error boundary/i;
const GATE_KIND = /^(?:decision point|parallel split)$/i;

const isEvent = (s: DocStep) => EVENT_KIND.test(s.kind);
const isGate = (s: DocStep) => GATE_KIND.test(s.kind);

/** The element a level names: the sub-process with that id (a nested level `outer__inner` falls back to `outer`). */
function parentOf(byId: ReadonlyMap<string, DocStep>, step: DocStep): DocStep | null {
  if (step.level === null) return null;
  return byId.get(step.level) ?? byId.get(step.level.split('__')[0]) ?? null;
}

/**
 * The ids of the business steps, in the order a run takes them — the list
 * "How it works" shows (`overview.path` of the process description).
 */
export function businessStepIds(doc: ProcessDocumentation): string[] {
  const byId = new Map(doc.steps.map((s) => [s.id, s]));
  const rank = new Map(readingOrder(doc.steps).map((id, i) => [id, i]));
  const stored = new Map(doc.steps.map((s, i) => [s.id, i]));
  let ids = doc.steps
    .filter((s) => s.level === null)
    .map((s) => s.id)
    .sort((a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER) || stored.get(a)! - stored.get(b)!);
  const childrenOf = (id: string) => doc.steps.filter((s) => s.level === id).map((s) => s.id);
  // A program whose top level is one routine would read as a single step: its own steps are taken up one level.
  for (let pass = 0; pass < 2; pass += 1) {
    const steps = ids.map((id) => byId.get(id)).filter((s): s is DocStep => !!s && !isEvent(s) && !isGate(s));
    const opener = steps.find((s) => childrenOf(s.id).length > 0);
    if (steps.length > 2 || !opener) break;
    const at = ids.indexOf(opener.id);
    ids = [...ids.slice(0, at), ...childrenOf(opener.id), ...ids.slice(at + 1)];
  }
  return ids.filter((id) => {
    const s = byId.get(id);
    return !!s && !isEvent(s) && !isGate(s) && s.technicalName.toUpperCase() !== 'WRITE';
  });
}

/**
 * The business steps with their technical steps underneath. `pathIds` is the
 * description's main path when the caller has it (the page does), so the list
 * is exactly the one "How it works" shows; without it the same rule is read
 * from the documentation (`businessStepIds`).
 */
export function businessStepsOf(doc: ProcessDocumentation, pathIds?: readonly string[] | null): BusinessStep[] {
  const byId = new Map(doc.steps.map((s) => [s.id, s]));
  const ids = (pathIds && pathIds.length ? pathIds : businessStepIds(doc)).filter((id, i, all) => byId.has(id) && all.indexOf(id) === i);
  if (ids.length === 0) return [];
  const business = new Set(ids);

  // The reading order of every element: the top level as a run takes it, each element followed by what it opens.
  const rank = new Map(readingOrder(doc.steps).map((id, i) => [id, i]));
  const stored = new Map(doc.steps.map((s, i) => [s.id, i]));
  const children = new Map<string, DocStep[]>();
  const top: DocStep[] = [];
  for (const s of doc.steps) {
    const parent = parentOf(byId, s);
    if (!parent || parent.id === s.id) top.push(s);
    else children.set(parent.id, [...(children.get(parent.id) ?? []), s]);
  }
  top.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER) || stored.get(a.id)! - stored.get(b.id)!);
  const order: Array<{ step: DocStep; depth: number }> = [];
  const seen = new Set<string>();
  const walk = (s: DocStep, depth: number) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    order.push({ step: s, depth });
    for (const c of children.get(s.id) ?? []) walk(c, depth + 1);
  };
  for (const s of top) walk(s, 0);
  for (const s of doc.steps) walk(s, 0);

  // The home of an element: the business step it is drawn under, and how far down.
  const homeOf = (s: DocStep): { id: string; depth: number } | null => {
    let current: DocStep | null = s;
    let depth = 0;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      if (business.has(current.id)) return { id: current.id, depth };
      visited.add(current.id);
      current = parentOf(byId, current);
      depth += 1;
    }
    return null;
  };

  const technical = new Map<string, TechnicalStep[]>(ids.map((id) => [id, []]));
  const pending: TechnicalStep[] = [];
  let last: string | null = null;
  for (const { step } of order) {
    const home = homeOf(step);
    if (home && home.depth === 0) {
      last = step.id;
      // What stood before the first business step belongs to it.
      if (pending.length) technical.get(step.id)!.unshift(...pending.splice(0));
      continue;
    }
    if (isEvent(step)) continue;
    const entry: TechnicalStep = {
      id: step.id,
      name: docStepName(step),
      kind: step.kind,
      technicalName: step.technicalName,
      anchor: step.anchor ? { lineStart: step.anchor.lineStart, lineEnd: step.anchor.lineEnd } : null,
      depth: home ? home.depth : 1,
    };
    const target = home?.id ?? last;
    if (target) technical.get(target)!.push(entry);
    else pending.push(entry);
  }
  if (pending.length) technical.get(ids[0])!.unshift(...pending);

  return ids.map((id) => {
    const s = byId.get(id)!;
    return {
      id,
      name: docStepName(s),
      technicalName: s.technicalName,
      anchor: s.anchor ? { lineStart: s.anchor.lineStart, lineEnd: s.anchor.lineEnd } : null,
      technical: technical.get(id) ?? [],
    };
  });
}

/** The element id → the business step it belongs to (a business step to itself). */
export function businessStepOfElement(steps: readonly BusinessStep[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of steps) {
    out.set(s.id, s.id);
    for (const t of s.technical) if (!out.has(t.id)) out.set(t.id, s.id);
  }
  return out;
}
