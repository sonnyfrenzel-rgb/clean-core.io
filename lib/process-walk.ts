/**
 * "Walk through the process" — the Business view's way to answer, step by step,
 * whether the business still needs each part of the old process (owner,
 * 03.10.2026: "How can I confirm or prove process parts in the Business part
 * at all? If I as a business user can do something here, there must also be a
 * way to do it.").
 *
 * The answers are the ones the process-states route already stores per
 * element (Keep · Change deliberately · Drop · Clarify, roadmap 3.5) — the same
 * need revision the rules are answered in. Nothing new is stored here, nothing
 * goes on the signed run, and an answer is the account's self-declaration, as
 * everywhere. This module only says **in which order** the steps are walked
 * and **how many** have an answer.
 *
 * The order is the main path of the map (`mainPath`, `DESIGN.md` §5.9), depth
 * first: a step that opens a level of its own is followed by that level's main
 * path, so the walk reads the process the way the map tells it. Events are not
 * steps; decision points are, because "does the business still need this
 * check?" is the question a process owner can answer.
 *
 * Pure: no React, no network.
 */
import { buildNavigation, mainPath } from './process-navigation';
import { isDecisionTag, type ProcessMapModel } from './process-map';
import { isConfirmedState } from './rules-editor';
import type { ProcessStateView, StateEntry } from './process-states';

/** The latest answer per element subject — the element twin of `ruleEntries`. */
export function elementEntries(view: ProcessStateView | null): Record<string, StateEntry> {
  const out: Record<string, StateEntry> = {};
  if (!view) return out;
  const elements = new Set(view.subjects.filter((s) => s.kind === 'element').map((s) => s.subject));
  for (const entry of view.entries) {
    if (entry.kind !== 'element' || !elements.has(entry.subject)) continue;
    const held = out[entry.subject];
    if (!held || entry.revision > held.revision) out[entry.subject] = entry;
  }
  return out;
}

/**
 * The walk: element ids along the main path, depth first, without events and
 * — when the route's subjects are known — only the elements an answer can be
 * stored for.
 */
export function walkOrder(model: ProcessMapModel, subjects: ReadonlySet<string> | null): string[] {
  const nav = buildNavigation(model);
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const out: string[] = [];
  const seenPlanes = new Set<string | null>();
  const visit = (plane: string | null) => {
    if (seenPlanes.has(plane)) return;
    seenPlanes.add(plane);
    for (const id of mainPath(model, nav, plane)) {
      const element = byId.get(id);
      if (!element) continue;
      if (!element.event && (!subjects || subjects.has(id)) && !out.includes(id)) out.push(id);
      if (element.opensPlane) visit(element.opensPlane);
    }
  };
  visit(null);
  // Every decision point is asked, also one that stands off the main path
  // (inside a branch, or in a level only a branch opens): the decision counts
  // the decision points without an answer (ADR-085), so the walk that answers
  // them must reach each one. They follow the main path in the map's order.
  for (const element of model.elements) {
    if (isDecisionTag(element.tag) && !element.event && (!subjects || subjects.has(element.id)) && !out.includes(element.id)) {
      out.push(element.id);
    }
  }
  return out;
}

/** How far the walk is: answered (Keep, Change, Drop — a Clarify stays open), of all, and where to resume. */
export function walkProgress(
  order: readonly string[],
  entries: Record<string, StateEntry>,
): { answered: number; total: number; resumeAt: number } {
  const done = (id: string) => !!entries[id] && isConfirmedState(entries[id].state);
  const answered = order.filter(done).length;
  const first = order.findIndex((id) => !done(id));
  return { answered, total: order.length, resumeAt: first < 0 ? 0 : first };
}
