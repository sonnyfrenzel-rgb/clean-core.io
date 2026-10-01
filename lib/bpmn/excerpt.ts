import type { ExportContainer, ExportFlow, ExportModel, ExportNode } from './model';
import { anchorText } from './layout';

/**
 * A business excerpt of a process — the first steps of its main line, with the
 * decisions inside them that lead to an outcome, on **one** plane.
 *
 * The full map keeps levels: the top plane names each routine, and a reader
 * opens one to see its decisions. That is right for working through a process
 * and wrong for a first look (landing mockup s0/s1, owner 01.10.2026): there
 * the reader wants "read the requisition — incomplete? reject — plant 1000? —
 * check the vendor — …" in one column. This builds exactly that, without a
 * model and without inventing anything:
 *
 * - the **main line** is the top plane's walk from its start, at each split the
 *   branch that does not end the process;
 * - every routine on it becomes one **step**, anchored with the routine's own
 *   range (`L60–75`) — the drill-down stays in the full map;
 * - inside a routine, every **decision with an exit** — a branch that reaches an
 *   early or error end through at most a few steps — is drawn after the step,
 *   with that exit to the right: the steps on it, then the end. Steps and ends
 *   of the same name are one element with every anchor (`L79, L232`);
 * - a decision of the top plane that only stops the run once a routine has
 *   already decided (`CHECK gv_rejected = abap_false`) is left out: the exit it
 *   stands for is already drawn at the decision that made it.
 *
 * Every element is an element of the model, with its anchor; the only new
 * things are the joins between consecutive steps, which follow the main line.
 */

export interface ExcerptOptions {
  /** How many steps of the main line. */
  steps?: number;
}

const MAX_EXIT_STEPS = 3;

export function businessExcerpt(model: ExportModel, options: ExcerptOptions = {}): ExportModel {
  const limit = options.steps ?? 5;
  const root = model.root;
  const byId = new Map(model.containers.flatMap((c) => c.nodes).map((n) => [n.id, n]));
  const outOf = (c: ExportContainer, id: string) => c.flows.filter((f) => f.sourceId === id);
  const isEnd = (n: ExportNode | undefined) => !!n && n.tag === 'endEvent';
  const isExitEnd = (n: ExportNode | undefined) => !!n && n.tag === 'endEvent' && (n.error || n.source.detail?.early === true);

  const nodes: ExportNode[] = [];
  const flows: ExportFlow[] = [];
  const merged = new Map<string, ExportNode>();
  /** A decision's way on, whose label goes on the join drawn after it. */
  const pendingLabel = new Map<string, ExportFlow>();
  const anchors = new Map<string, string[]>();
  let flowCount = 0;
  const copy = (n: ExportNode, patch: Partial<ExportNode> = {}): ExportNode => {
    const c: ExportNode = { ...n, ...patch, incoming: [], outgoing: [], inner: undefined, attachedTo: undefined, band: 0 };
    nodes.push(c);
    return c;
  };
  const join = (from: ExportNode, to: ExportNode, template?: ExportFlow) => {
    // Two exits through one shared step need its way on only once.
    if (!template && flows.some((f) => f.sourceId === from.id && f.targetId === to.id)) return;
    const id = `ex-fl-${(flowCount += 1)}`;
    const f: ExportFlow = {
      id,
      sourceId: from.id,
      targetId: to.id,
      condition: template?.condition ?? '',
      label: template ? (template.label ?? template.condition) : undefined,
      edge: template?.edge ?? { from: from.source.id, to: to.source.id, kind: 'sequence', condition: '' },
      back: false,
    };
    flows.push(f);
    from.outgoing.push(id);
    to.incoming.push(id);
  };
  /** One element per name on the exits; every place it stands for in its anchor. */
  /**
   * Outcomes of one kind are one end: "Rejected: no material" and "Rejected:
   * release indicator set" become "Rejected" with both anchors — the decisions
   * before it say why, each with its own line. An end with no kind word before
   * a colon stays as it is.
   */
  const outcomeKind = (name: string) => (name.includes(':') ? name.slice(0, name.indexOf(':')).trim() : name);
  const shared = (n: ExportNode, leadsTo?: string): ExportNode => {
    const isEndNode = n.tag === 'endEvent';
    // A step is shared only with a step that leads to the same kind of outcome.
    const key = isEndNode ? `end|${outcomeKind(n.name)}|${n.error}` : `${n.tag}|${n.name}|${outcomeKind(leadsTo ?? '')}`;
    const anchor = anchorText(n.source.anchor);
    const known = merged.get(key);
    if (known) {
      const list = anchors.get(key) as string[];
      if (anchor && !list.includes(anchor)) list.push(anchor);
      known.anchorLabel = list.join(', ');
      if (isEndNode && known.name !== n.name) known.name = outcomeKind(n.name);
      return known;
    }
    const c = copy(n, { id: `ex-${n.id}` });
    merged.set(key, c);
    anchors.set(key, anchor ? [anchor] : []);
    return c;
  };

  // ---- the main line of the top plane ----
  const band = root.bands[0];
  const start = band?.entryId ? byId.get(band.entryId) : undefined;
  if (!start) return { ...model, containers: [model.root] };
  let last = copy(start, { id: `ex-${start.id}` });
  let steps = 0;
  let cur: ExportNode | undefined = start;
  const seen = new Set<string>();
  while (cur && steps < limit && !seen.has(cur.id)) {
    seen.add(cur.id);
    const outs = outOf(root, cur.id);
    // On along the branch that does not end the process.
    const next: ExportFlow | undefined = outs.find((f) => !isEnd(byId.get(f.targetId)) && !f.back) ?? outs[0];
    if (!next) break;
    const n = byId.get(next.targetId);
    if (!n || isEnd(n)) break;
    cur = n;
    if (n.tag.endsWith('Gateway') || n.tag.endsWith('Event')) continue;

    const routineRange = n.inner ? rangeOf(n.inner, byId) : null;
    const step = copy(n, { id: `ex-${n.id}`, tag: n.tag === 'subProcess' ? 'task' : n.tag, anchorLabel: routineRange ?? undefined });
    join(last, step);
    last = step;
    steps += 1;

    // ---- decisions inside the routine that lead to an exit ----
    if (!n.inner) continue;
    const inner = n.inner;
    for (const g of inner.nodes) {
      if (g.tag !== 'exclusiveGateway') continue;
      const exits: Array<{ flow: ExportFlow; path: ExportNode[]; end: ExportNode }> = [];
      let stay: ExportFlow | undefined;
      for (const f of outOf(inner, g.id)) {
        const path: ExportNode[] = [];
        let at = byId.get(f.targetId);
        while (at && !isEnd(at) && path.length < MAX_EXIT_STEPS && !at.tag.endsWith('Gateway')) {
          path.push(at);
          at = byId.get(outOf(inner, at.id)[0]?.targetId ?? '');
        }
        if (isExitEnd(at)) exits.push({ flow: f, path, end: at as ExportNode });
        else stay ??= f;
      }
      if (!exits.length || !stay) continue;
      const decision = copy(g, { id: `ex-${g.id}` });
      join(last, decision);
      for (const exit of exits) {
        let from = decision;
        let template: ExportFlow | undefined = exit.flow;
        for (const p of exit.path) {
          const s = shared(p, exit.end.name);
          join(from, s, template);
          template = undefined;
          from = s;
        }
        join(from, shared(exit.end), template);
      }
      // The way on is the decision's other branch; it carries its label.
      pendingLabel.set(decision.id, stay);
      last = decision;
    }
  }
  // Labels of the ways on, now that their targets exist.
  for (const f of flows) {
    const stay = pendingLabel.get(f.sourceId);
    if (stay && !f.label && !f.condition) {
      f.label = stay.label ?? stay.condition;
      f.condition = stay.condition;
    }
  }

  const container: ExportContainer = {
    id: 'excerpt',
    tag: 'process',
    // The main line ends at its last step: the layout keeps that line straight
    // and sends every exit to the side.
    bands: [{ key: 'excerpt', anchorId: 'excerpt', nodeIds: nodes.map((n) => n.id), entryId: nodes[0]?.id ?? null, endId: last.id }],
    nodes,
    flows,
    storeRefs: [],
    dataAssociations: [],
    annotations: [],
  };
  return { root: container, containers: [container], lanes: [], stores: [], pools: [], messages: [], droppedEdges: 0 };
}

/** `L60–75`: from a routine's start event to its end event. */
function rangeOf(inner: ExportContainer, byId: Map<string, ExportNode>): string | null {
  const band = inner.bands[0];
  const first = band?.entryId ? byId.get(band.entryId)?.source.anchor : null;
  const end = band?.endId ? byId.get(band.endId)?.source.anchor : null;
  if (!first || !end) return null;
  return first.lineStart === end.lineEnd ? `L${first.lineStart}` : `L${first.lineStart}–${end.lineEnd}`;
}
