import type { ProcessSkeleton, SkeletonNode } from './abap/process-skeleton';
import { plainLabels } from './abap/plain-language';
import { anchorLabel } from './first-look';

/**
 * The process as a numbered list of steps — `DESIGN.md` §5.7 ("Map and step
 * list are equal") for the two places a drawn map does not work: paper and the
 * printout of the workspace (§7.1, mockup s10), where *"if a level does not fit
 * the page width readably, the step list prints instead of the map — and says
 * so in one line."*
 *
 * Read off the skeleton the map is drawn from, in the order the flow runs:
 * every entry in the order ABAP runs its event blocks, each walked along its
 * flows, then the sub-processes they call. Every step carries its plain name
 * (`lib/abap/plain-language.ts`, deterministic, no model), its line anchor, and
 * — for a decision — the question with where each answer leads. Start and end
 * events are flow boilerplate and are not steps.
 */
export interface ProcessStep {
  n: number;
  id: string;
  kind: 'step' | 'decision' | 'outcome';
  /** The plain name; the code's own label when there is no better one. */
  name: string;
  /** The code's own label, when `name` is a plain rendering of it. */
  technical: string | null;
  anchor: string | null;
  /** For a decision: "yes → Reject request". */
  branches: string[];
}

const SKIPPED = new Set(['start', 'end']);
const DECISIONS = new Set(['gateway']);
const OUTCOMES = new Set(['end-error']);

export function processStepList(skeleton: ProcessSkeleton, source: string): ProcessStep[] {
  const nodes = Array.isArray(skeleton?.nodes) ? skeleton.nodes : [];
  const edges = Array.isArray(skeleton?.edges) ? skeleton.edges : [];
  if (nodes.length === 0) return [];
  const labels = plainLabels(skeleton, source);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outs = new Map<string, typeof edges>();
  for (const e of edges) {
    if (e.kind === 'loop-back') continue;
    outs.set(e.from, [...(outs.get(e.from) ?? []), e]);
  }

  // Entries first, in runtime order, then the sub-processes they open.
  const regions = [...(skeleton.regions ?? [])].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'entry' ? -1 : 1;
    return (a.runtimeRank ?? 0) - (b.runtimeRank ?? 0);
  });

  const order: SkeletonNode[] = [];
  const seen = new Set<string>();
  const walk = (start: string | null) => {
    if (!start) return;
    const stack = [start];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = byId.get(id);
      if (node) order.push(node);
      // Reversed onto the stack so the first flow is walked first.
      const next = (outs.get(id) ?? []).map((e) => e.to).reverse();
      stack.push(...next);
    }
  };
  for (const region of regions) {
    const startNode = nodes.find((n) => n.region === region.key && n.kind === 'start');
    walk(startNode?.id ?? region.entryNodeId);
  }
  // Anything the walk did not reach still exists; it goes last, in source order.
  for (const node of nodes) if (!seen.has(node.id)) order.push(node);

  const steps: ProcessStep[] = [];
  for (const node of order) {
    if (SKIPPED.has(node.kind) || node.label.trim() === '') continue;
    const plain = (labels.nodes.get(node.id) ?? '').trim();
    const name = plain.length >= 3 ? plain : node.label;
    const branches = DECISIONS.has(node.kind)
      ? (outs.get(node.id) ?? [])
          .filter((e) => e.kind !== 'boundary')
          .map((e) => {
            const arm = labels.flow(e) || (e.condition ? 'if met' : 'otherwise');
            const target = byId.get(e.to);
            const where = target ? (labels.nodes.get(target.id) || target.label || 'continue') : 'continue';
            return `${arm} → ${target && SKIPPED.has(target.kind) ? 'Done' : where}`;
          })
      : [];
    steps.push({
      n: steps.length + 1,
      id: node.id,
      kind: DECISIONS.has(node.kind) ? 'decision' : OUTCOMES.has(node.kind) ? 'outcome' : 'step',
      name,
      technical: name !== node.label ? node.label : null,
      anchor: node.anchor ? anchorLabel(node.anchor.lineStart, node.anchor.lineEnd) : null,
      branches: [...new Set(branches)],
    });
  }
  return steps;
}
