import type { DocStep } from '@/lib/process-documentation';

/**
 * The readable main path of the process documentation, in the order a run
 * takes it (CO review F02, 12.10.2026).
 *
 * The package's "How the process works" used to number the top-level steps in
 * the order the map stores its elements. That order is a depth-first drawing
 * order: the first branch of a decision is drawn to the end of the process,
 * and the second branch is appended after it. The CO close simulation read
 * "load demo data → simulate → export → display → authorize → read live
 * data", which tells a reader the authorization check and the live read run
 * after the result is shown. In the code they are the other branch of
 * `IF p_demo = gc_x`, before the shared calculation, and the export runs only
 * when `p_csv` is set.
 *
 * This module walks the stored successors (`DocStep.next`) instead, so a
 * stored documentation renders correctly without being read again, and the
 * map, its layout and the `.bpmn` file are untouched. At every split:
 *
 *   - an arm that leads back to the split is a repetition;
 *   - an arm that shares nothing with the main arm leaves the process (an
 *     error exit) — shown only when it holds steps, and said to end the run;
 *   - a decision whose other arm goes straight to the end of the level is a
 *     check (`CHECK`, `IF … EXIT`): the path goes on at the same depth, as
 *     after any check that ends the run — the check stands under the rules;
 *   - an arm whose first element is reachable from another arm is skipped by
 *     that other arm — the other arm is optional ("only when …");
 *   - arms left over are alternatives, shown side by side up to the first
 *     element they all reach again (the join), where the main path goes on.
 *
 * Every listed step still appears exactly once: a step no start reaches is
 * appended at the end, in the stored order, as before.
 *
 * Pure: no engine import, no DOM — `lib/process-documentation.ts` is read by
 * the dashboard and the delivery page.
 */

export type PathItem =
  | { kind: 'step'; step: DocStep }
  /** A segment that runs only when `when` holds, then the path goes on. */
  | { kind: 'optional'; split: DocStep; when: string; items: PathItem[] }
  /** A segment that runs only when `when` holds, after which the run ends. */
  | { kind: 'exit'; split: DocStep; when: string; items: PathItem[] }
  /** A segment the run repeats while `when` holds. */
  | { kind: 'repeat'; split: DocStep; when: string; items: PathItem[] }
  /** Two or more alternatives (or, for a parallel split, branches that run side by side). */
  | { kind: 'choice'; split: DocStep; parallel: boolean; arms: Array<{ when: string; items: PathItem[] }> };

const isEvent = (s: DocStep) => /^(?:start|end)\b/i.test(s.kind);
const isGate = (s: DocStep) => /decision/i.test(s.kind);
/** The steps the main path lists — the same selection the rendering has always made. */
export const isListedStep = (s: DocStep) => !isEvent(s) && !isGate(s);

interface Arm {
  to: string;
  when: string;
}

function walkTopLevel(steps: readonly DocStep[]): { items: PathItem[]; order: string[] } {
  const top = steps.filter((s) => s.level === null);
  const byId = new Map(top.map((s) => [s.id, s]));
  const succ = (id: string): Arm[] => {
    const out: Arm[] = [];
    for (const flow of byId.get(id)?.next ?? []) {
      if (!byId.has(flow.to) || flow.to === id) continue;
      const held = out.find((a) => a.to === flow.to);
      // Two flows to one element are one arm; their conditions are alternatives.
      if (held) held.when = held.when && flow.condition ? `${held.when} OR ${flow.condition}` : '';
      else out.push({ to: flow.to, when: flow.condition });
    }
    return out;
  };

  // What an element reaches without passing an element the current walk stops
  // at: inside a loop the head is a stop, and a decision in the body must not
  // see the whole loop again through it.
  const reachCache = new WeakMap<ReadonlySet<string>, Map<string, Set<string>>>();
  const reach = (from: string, stop: ReadonlySet<string>): Set<string> => {
    let cache = reachCache.get(stop);
    if (!cache) {
      cache = new Map();
      reachCache.set(stop, cache);
    }
    const cached = cache.get(from);
    if (cached) return cached;
    const seen = new Set<string>();
    const queue = [from];
    while (queue.length) {
      const at = queue.pop() as string;
      if (seen.has(at)) continue;
      seen.add(at);
      if (stop.has(at)) continue;
      for (const a of succ(at)) if (!seen.has(a.to)) queue.push(a.to);
    }
    cache.set(from, seen);
    return seen;
  };
  /** BFS distance from `from` to every element it reaches, stopping where `reach` stops. */
  const distances = (from: string, stop: ReadonlySet<string>): Map<string, number> => {
    const d = new Map<string, number>([[from, 0]]);
    const queue = [from];
    for (let i = 0; i < queue.length; i += 1) {
      const at = queue[i];
      if (stop.has(at)) continue;
      for (const a of succ(at)) {
        if (d.has(a.to)) continue;
        d.set(a.to, (d.get(at) as number) + 1);
        queue.push(a.to);
      }
    }
    return d;
  };
  /** An arm the code writes without a condition, said as the negation of its siblings' conditions. */
  const whenOf = (arm: Arm, siblings: readonly Arm[]): string => {
    if (arm.when) return arm.when;
    const others = siblings.filter((a) => a !== arm).map((a) => a.when);
    return others.length > 0 && others.every(Boolean) ? `NOT ( ${others.join(' OR ')} )` : '';
  };

  const visited = new Set<string>();
  const hasStep = (items: PathItem[]): boolean => items.some((i) => i.kind === 'step'
    || ('items' in i && hasStep(i.items))
    || (i.kind === 'choice' && i.arms.some((a) => hasStep(a.items))));

  const walk = (start: string | undefined, stop: ReadonlySet<string>): PathItem[] => {
    const items: PathItem[] = [];
    let at = start;
    while (at !== undefined && !stop.has(at) && !visited.has(at)) {
      const node = byId.get(at) as DocStep;
      visited.add(at);
      if (isListedStep(node)) items.push({ kind: 'step', step: node });
      let arms = succ(at);
      if (arms.length <= 1) {
        at = arms[0]?.to;
        continue;
      }
      const splitId: string = at;
      at = undefined;

      // Repetition: the arm comes back to the split.
      const loops = arms.filter((a) => reach(a.to, stop).has(splitId));
      for (const arm of loops) {
        const inner = walk(arm.to, new Set([...stop, splitId]));
        if (hasStep(inner)) items.push({ kind: 'repeat', split: node, when: arm.when, items: inner });
      }
      arms = arms.filter((a) => !loops.includes(a));
      if (arms.length === 0) break;

      // Exits: arms that share nothing with the main arm — the one that reaches
      // the level's normal end, and of those the one reaching the most. Size
      // alone ties on `IF test_run. MESSAGE … RETURN. ENDIF. CALL …`, and the
      // early return would become the main path.
      const normal = (a: Arm) => [...reach(a.to, stop)].some((id) => /^end\b(?!.*early)/i.test(byId.get(id)?.kind ?? ''));
      const score = (a: Arm) => (normal(a) ? top.length + 1 : 0) + reach(a.to, stop).size;
      const main = arms.reduce((best, a) => (score(a) > score(best) ? a : best), arms[0]);
      const mainReach = reach(main.to, stop);
      const exits = arms.filter((a) => a !== main && [...reach(a.to, stop)].every((x) => !mainReach.has(x)));
      for (const arm of exits) {
        const inner = walk(arm.to, stop);
        if (hasStep(inner)) items.push({ kind: 'exit', split: node, when: whenOf(arm, arms), items: inner });
      }
      arms = arms.filter((a) => !exits.includes(a));

      // A check that ends the level when it fails (`CHECK`, `IF … EXIT`) and
      // draws its exit into the level's own end: the path goes on at the same
      // depth, as it does after a check whose exit has an end of its own —
      // nesting everything after it as "optional" would bury the main path one
      // level deeper at every check. The check stands under the rules.
      if (arms.length === 2 && isGate(node)) {
        const end = arms.find((a) => /^end\b/i.test(byId.get(a.to)?.kind ?? ''));
        const go = arms.find((a) => a !== end);
        if (end && go && reach(go.to, stop).has(end.to)) {
          at = go.to;
          continue;
        }
      }

      // Alternatives that one arm skips together (SD review, 12.10.2026): a
      // `CASE` without `WHEN OTHERS` — radio buttons, `CASE 'X'. WHEN r_alv. …
      // WHEN r_dynp. … WHEN r_file. … ENDCASE.` — has a default arm that goes
      // straight to the element after `ENDCASE`. Each `WHEN` arm reaches that
      // element, so each was skipped by the default arm and read as its own
      // optional step, one after the other: list, then screen, then file. When
      // two or more arms are skipped by the same arm and none of them reaches
      // another's first element, they are one choice of alternatives, and the
      // skipping arm makes the whole choice optional ("or none of them").
      if (arms.length > 2 && !/parallel/i.test(node.kind)) {
        let skipper: Arm | undefined;
        let group: Arm[] = [];
        for (const b of arms) {
          const skipped = arms.filter((a) => a !== b && reach(a.to, stop).has(b.to));
          const independent = skipped.filter((a) => skipped.every((c) => c === a || !reach(a.to, stop).has(c.to)));
          if (independent.length >= 2 && independent.length === skipped.length && independent.length > group.length) {
            skipper = b;
            group = independent;
          }
        }
        if (skipper && group.length >= 2) {
          const rest = arms.filter((a) => !group.includes(a));
          const until = new Set([...stop, ...rest.map((a) => a.to)]);
          const choiceArms = group.map((a) => ({ when: whenOf(a, arms), items: walk(a.to, until) }));
          if (choiceArms.some((a) => hasStep(a.items))) {
            const when = choiceArms.every((a) => a.when) ? choiceArms.map((a) => a.when).join(' OR ') : '';
            items.push({ kind: 'optional', split: node, when, items: [{ kind: 'choice', split: node, parallel: false, arms: choiceArms }] });
          }
          arms = rest;
        }
      }

      // Optional segments: an arm that another arm's first element skips.
      while (arms.length > 1 && !/parallel/i.test(node.kind)) {
        const optional = arms.find((a) => arms.some((b) => b !== a && reach(a.to, stop).has(b.to)));
        if (!optional) break;
        const rest = arms.filter((a) => a !== optional);
        const inner = walk(optional.to, new Set([...stop, ...rest.map((a) => a.to)]));
        if (hasStep(inner)) items.push({ kind: 'optional', split: node, when: whenOf(optional, arms), items: inner });
        arms = rest;
      }

      if (arms.length === 1) {
        at = arms[0].to;
        continue;
      }

      // Alternatives up to the first element all of them reach again.
      const dist = arms.map((a) => distances(a.to, stop));
      let join: string | undefined;
      let best = Infinity;
      for (const id of top.map((s) => s.id)) {
        if (!dist.every((d) => d.has(id))) continue;
        const far = Math.max(...dist.map((d) => d.get(id) as number));
        if (far < best) {
          best = far;
          join = id;
        }
      }
      const until = join ? new Set([...stop, join]) : stop;
      const choiceArms = arms.map((a) => ({ when: a.when, items: walk(a.to, until) }));
      if (choiceArms.some((a) => hasStep(a.items))) {
        items.push({ kind: 'choice', split: node, parallel: /parallel/i.test(node.kind), arms: choiceArms });
      }
      at = join;
    }
    return items;
  };

  const out: PathItem[] = [];
  const hasPredecessor = new Set(top.flatMap((s) => succ(s.id).map((a) => a.to)));
  const roots = [
    ...top.filter((s) => /^start\b/i.test(s.kind)),
    ...top.filter((s) => !/^start\b/i.test(s.kind) && !hasPredecessor.has(s.id)),
  ];
  for (const root of roots) out.push(...walk(root.id, new Set()));
  // A listed step no start reaches keeps its place in the document.
  for (const s of top) if (isListedStep(s) && !visited.has(s.id)) out.push(...walk(s.id, new Set()));
  // Every top-level element in the order the walk met it — a decision before
  // its arms, one arm complete before the next — and the rest in stored order.
  const order = [...visited, ...top.map((s) => s.id).filter((id) => !visited.has(id))];
  return { items: out, order };
}

/** The main path of the top level, as nested items. */
export function readingPath(steps: readonly DocStep[]): PathItem[] {
  return walkTopLevel(steps).items;
}

/**
 * The ids of the top-level elements in the order a run meets them — the
 * order of `readingPath`, with the decisions and events in their places. The
 * business SOP orders its main path by it, so the two documents agree (CO
 * review F02, 12.10.2026).
 */
export function readingOrder(steps: readonly DocStep[]): string[] {
  return walkTopLevel(steps).order;
}
