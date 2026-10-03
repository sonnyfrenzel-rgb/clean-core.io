/**
 * The first look's build-up — mockup screen `s0`, `DESIGN.md` §5.1–5.2, ADR-013.
 *
 * *"The wow is content with a line anchor, not motion."* The code speaks
 * first: a line lights up where the engine set a process node (or touched a
 * table), every counter rises only with such a line, and the process grows
 * beside the code out of the lines that were lit. At the end the code steps
 * back and the business leads.
 *
 * This module is the content of that, as data — no React, no clock, no model:
 *
 *   - `buildUpEvents` turns the engine's own reading into the ordered list of
 *     lit lines. Nothing is invented: a node event is a skeleton node with its
 *     anchor, a data event is a table access with its line. A node without a
 *     line is not lit — there is no line to light;
 *   - `buildUpFrame` says what one moment of the build-up shows, given how far
 *     it has got. The counters are counts of the events shown so far, so a
 *     counter can only rise with a line that is on the screen.
 *
 * **The time budget** — at a pace a reader can follow (owner, 03.10.2026: "you
 * have to be able to follow everything at the right speed, not too fast";
 * ADR-066, superseding the 2.4 s of 01.10.2026): code read to 1.0 s, process
 * recognised to 3.8 s, names to 5.0 s, the rules to 6.2 s, what is not
 * determined to 7.4 s, the map from 7.4 s, the end state at 8.4 s. Every
 * moment shows the engine's own content — lit lines, grown nodes with their
 * anchors, the rules and the open points with theirs — so it is not a wait
 * without content. Skip and `prefers-reduced-motion` go straight to the end
 * state, which the component renders; this module is not asked.
 */
import type { ProcessSkeleton, SkeletonNode } from './abap/process-skeleton';
import type { TableDependency } from './abap/table-dependencies';
import { anchorLabel } from './first-look';

/** When each stage begins and when the end state takes over, in ms. */
export const BUILD_UP_BUDGET = Object.freeze({
  processFrom: 1000,
  namesFrom: 3800,
  rulesFrom: 5000,
  openFrom: 6200,
  mapFrom: 7400,
  endAt: 8400,
});

export type BuildUpStage =
  | 'code-read'
  | 'process-recognised'
  | 'business-language'
  | 'rules'
  | 'not-determined'
  | 'map';

/** The moment of the build-up at `elapsed` ms. */
export function buildUpStageAt(elapsed: number): BuildUpStage {
  const t = Math.max(0, elapsed);
  if (t < BUILD_UP_BUDGET.processFrom) return 'code-read';
  if (t < BUILD_UP_BUDGET.namesFrom) return 'process-recognised';
  if (t < BUILD_UP_BUDGET.rulesFrom) return 'business-language';
  if (t < BUILD_UP_BUDGET.openFrom) return 'rules';
  if (t < BUILD_UP_BUDGET.mapFrom) return 'not-determined';
  return 'map';
}

/** The order of the moments, for the step rail. */
export const BUILD_UP_STAGES: readonly BuildUpStage[] = Object.freeze([
  'code-read',
  'process-recognised',
  'business-language',
  'rules',
  'not-determined',
  'map',
]);

/** One lit line. */
export interface BuildUpEvent {
  line: number;
  kind: 'node' | 'data';
  /** Skeleton node id, for a node. */
  nodeId?: string;
  nodeKind?: SkeletonNode['kind'];
  /** The node's label as the source writes it, for a node. */
  label?: string;
  /** `L52-74`, for a node. */
  anchor?: string;
  /** The routine or event block the line stands in, upper-cased, or null. */
  container: string | null;
  /** The table, for a data event. */
  table?: string;
}

/** Node kinds that are drawn as a step or a decision. Ends and boundaries light nothing. */
const LIT_KINDS = new Set<SkeletonNode['kind']>([
  'start',
  'gateway',
  'parallel-gateway',
  'loop',
  'sub-process',
  'call-activity',
  'transaction',
  'call-opaque',
  'task',
  'service-task',
  'send-task',
  'user-task',
  'business-rule-task',
  'read',
  'write',
  'output',
]);

/** The lines the build-up lights, in source order. */
export function buildUpEvents(
  access: readonly TableDependency[] | null,
  skeleton: ProcessSkeleton | null,
): BuildUpEvent[] {
  const out: BuildUpEvent[] = [];
  const seen = new Set<string>();
  for (const node of skeleton?.nodes ?? []) {
    if (!node.anchor || !LIT_KINDS.has(node.kind)) continue;
    // A sub-process plane starts at its FORM line; the call site already lit it.
    if (node.kind === 'start' && node.detail?.subProcess === true) continue;
    const key = `n${node.anchor.lineStart}|${node.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      line: node.anchor.lineStart,
      kind: 'node',
      nodeId: node.id,
      nodeKind: node.kind,
      label: node.label,
      anchor: anchorLabel(node.anchor.lineStart, node.anchor.lineEnd),
      container: node.container,
    });
  }
  for (const dep of access ?? []) {
    const key = `d${dep.line}|${dep.table}`;
    if (dep.access !== 'read' && dep.access !== 'write') continue;
    if (seen.has(key) || typeof dep.line !== 'number') continue;
    seen.add(key);
    out.push({ line: dep.line, kind: 'data', table: dep.table, container: null });
  }
  return out.sort((a, b) => a.line - b.line || (a.kind === b.kind ? 0 : a.kind === 'node' ? -1 : 1));
}

export interface BuildUpFrame {
  stage: BuildUpStage;
  /** How many events are lit. */
  shown: number;
  /** The event being read right now, or null before the first. */
  current: BuildUpEvent | null;
  counters: {
    /** The line the reading has reached. */
    line: number;
    tables: number;
    nodes: number;
    decisions: number;
  };
  /** True once names may replace the technical labels (stage 3). */
  named: boolean;
}

/**
 * What the build-up shows at `elapsed` ms.
 *
 * The events are spread over code read and process recognised together (0 to
 * `namesFrom`), so the lines light up in the order the source has them and the
 * process grows in that order. From `namesFrom` every event is lit and the
 * names change once; the rules, the open points and the map follow, and at
 * `endAt` the component hands over to the end state.
 */
export function buildUpFrame(events: readonly BuildUpEvent[], elapsed: number): BuildUpFrame {
  const t = Math.max(0, elapsed);
  const stage = buildUpStageAt(t);
  const progress = Math.min(1, t / BUILD_UP_BUDGET.namesFrom);
  const shown = events.length === 0 ? 0 : Math.max(1, Math.ceil(progress * events.length));
  const lit = events.slice(0, shown);
  const tables = new Set(lit.filter((e) => e.kind === 'data').map((e) => e.table));
  const nodes = lit.filter((e) => e.kind === 'node');
  return {
    stage,
    shown,
    current: lit[lit.length - 1] ?? null,
    counters: {
      line: lit[lit.length - 1]?.line ?? 0,
      tables: tables.size,
      nodes: nodes.length,
      decisions: nodes.filter((e) => e.nodeKind === 'gateway').length,
    },
    named: t >= BUILD_UP_BUDGET.namesFrom,
  };
}

/** The lines around `line` the code panel shows: `before` above, `after` below, within the source. */
export function codeWindow(total: number, line: number, before = 7, after = 4): { from: number; to: number } {
  if (total <= 0) return { from: 1, to: 0 };
  const centre = Math.min(Math.max(1, line), total);
  let from = Math.max(1, centre - before);
  const to = Math.min(total, from + before + after);
  from = Math.max(1, to - before - after);
  return { from, to };
}

/** A frame driven by the growing excerpt: which of its nodes stand, and the line being read. */
export interface ExcerptFrame extends BuildUpFrame {
  /** How many excerpt nodes have grown. */
  grown: number;
  /** True for the first 200 ms after the newest node grew — its line is lit strongest, then fades. */
  fresh: boolean;
}

/**
 * The build-up when there is an excerpt to grow (moment 2 of `s0`): its nodes
 * appear one by one over the budget in the order the excerpt walks them, the
 * code shows the line each one grew out of, and the counters count every lit
 * line of the source up to the furthest line read so far — so they never fall
 * when the main line jumps back into a routine, and only rise with a line.
 */
export function excerptFrame(
  events: readonly BuildUpEvent[],
  nodeLines: readonly (number | null)[],
  elapsed: number,
  totalLines: number,
): ExcerptFrame {
  const t = Math.max(0, elapsed);
  const stage = buildUpStageAt(t);
  const n = nodeLines.length;
  const progress = Math.min(1, t / BUILD_UP_BUDGET.namesFrom);
  const grown = n === 0 ? 0 : Math.max(1, Math.ceil(progress * n));
  let reached = 0;
  for (let i = 0; i < grown; i += 1) reached = Math.max(reached, nodeLines[i] ?? 0);
  if (progress >= 1) reached = totalLines;
  const lit = events.filter((e) => e.line <= reached);
  const tables = new Set(lit.filter((e) => e.kind === 'data').map((e) => e.table));
  const nodes = lit.filter((e) => e.kind === 'node');
  const currentLine = nodeLines[grown - 1] ?? reached;
  const current = events.find((e) => e.line === currentLine) ?? lit[lit.length - 1] ?? null;
  const grewAt = n === 0 ? 0 : ((grown - 1) / n) * BUILD_UP_BUDGET.namesFrom;
  return {
    stage,
    shown: lit.length,
    current,
    counters: {
      line: Math.min(reached, totalLines),
      tables: tables.size,
      nodes: nodes.length,
      decisions: nodes.filter((e) => e.nodeKind === 'gateway').length,
    },
    named: t >= BUILD_UP_BUDGET.namesFrom,
    grown,
    fresh: progress < 1 && t - grewAt < 200,
  };
}
