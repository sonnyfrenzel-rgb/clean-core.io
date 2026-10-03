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
 *   - `buildUpFrame` and `excerptFrame` say what one moment of the build-up
 *     shows, given how far it has got. The counters are counts of the lines
 *     lit so far, so a counter can only rise with a line that is on the screen.
 *
 * **The time budget** (owner, 03.10.2026: "the first steps must take a bit
 * longer and create more wow … so that a first-time user sees everything that
 * happens — but not too long either"; amends ADR-072, superseding its 8.4 s of
 * the same day). Six steps, one headline each, about 20 s in all:
 *
 *   | step                | from   | lasts | what moves                               |
 *   |---------------------|--------|-------|------------------------------------------|
 *   | code read           | 0.0 s  | 2.5 s | the reading line runs through the source |
 *   | process recognised  | 2.5 s  | 6.0 s | nodes grow out of their lines, one by one|
 *   | business language   | 8.5 s  | 2.5 s | the names change once                    |
 *   | rules in the code   | 11.0 s | 3.5 s | each rule lights at its line, collected  |
 *   | not determined      | 14.5 s | 3.0 s | each open point marked at its line       |
 *   | map                 | 17.5 s | 2.5 s | the numbered story, the map settles       |
 *
 * Why 20 s and not 8 or 30: a headline of four to nine words takes a first-time
 * reader about two seconds to read, and then the eye wants a moment on what it
 * announced — so no step is shorter than `BUILD_UP_MIN_STEP` (2.5 s), and the
 * six steps alone need about 15 s. The process step is the one that carries the
 * engine's work: on a rich source (Z_MM_PO_APPROVAL, a dozen nodes on its main
 * line) six seconds give each node about 0.45 s to grow while its line is lit
 * — the slowest pace at which the growth still reads as one movement rather
 * than a slide show — and on a small one (Z_SALES_ORDER_CREATOR) about a
 * second. Past 25 s the first look starts to feel like a wait (the owner's "not
 * too long"); `BUILD_UP_WINDOW` holds the total inside 15–25 s. The longer
 * build-up also covers most of the model's latency when the start writes the
 * narrative, so the honest wait at the end is rarer.
 *
 * Every moment shows the engine's own content — lit lines, grown nodes with
 * their anchors, the rules and the open points with theirs — so it is not a
 * wait without content. Skip and `prefers-reduced-motion` go straight to the
 * end state, which the component renders; this module is not asked. Pause
 * stops the clock (`FirstLook.tsx`), so nothing here knows about it.
 */
import type { ProcessSkeleton, SkeletonNode } from './abap/process-skeleton';
import type { TableDependency } from './abap/table-dependencies';
import { START_NARRATIVE_CEILING_MS } from './model-stages';
import { anchorLabel } from './first-look';

/** When each stage begins and when the end state takes over, in ms. */
export const BUILD_UP_BUDGET = Object.freeze({
  processFrom: 2500,
  namesFrom: 8500,
  rulesFrom: 11000,
  openFrom: 14500,
  mapFrom: 17500,
  endAt: 20000,
});

/** The window the whole build-up has to stay inside (owner, 03.10.2026). */
export const BUILD_UP_WINDOW = Object.freeze({ min: 15000, max: 25000 });

/** No step stands for less: one headline read, and a moment on what it shows. */
export const BUILD_UP_MIN_STEP = 2500;

/**
 * How long the end of the reading line's run and of the growth stand still
 * before the next step, so the reader sees the finished count and the whole
 * process for a moment.
 */
const READ_HOLD = 400;
const GROW_HOLD = 800;

/** How long a node takes to grow in (opacity and scale), in ms. */
export const BUILD_UP_GROW_MS = 420;

/**
 * How long the last moment holds for a start run that is still being signed,
 * counted from `endAt`. The signing starts with the build-up, so by `endAt` it
 * has had 20 s already; 8 s more is the cap for a slow server, after which the
 * end state stands and the map's place says what is still being signed.
 */
export const BUILD_UP_MAP_WAIT = 8000;

/**
 * The same hold when the start writes the narrative first (owner decision
 * 03.10.2026). The model is asked at the build-up's first moment and the start
 * stops waiting for it at `START_NARRATIVE_CEILING_MS`, counted from then — so
 * after `endAt` the build-up holds the rest of that ceiling and then the
 * signing, never the whole ceiling a second time.
 */
export const BUILD_UP_MAP_WAIT_WITH_MODEL =
  Math.max(0, START_NARRATIVE_CEILING_MS - BUILD_UP_BUDGET.endAt) + BUILD_UP_MAP_WAIT;

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

/** When each stage begins and ends, in ms. */
export function buildUpStageSpan(stage: BuildUpStage): { from: number; to: number } {
  const b = BUILD_UP_BUDGET;
  switch (stage) {
    case 'code-read':
      return { from: 0, to: b.processFrom };
    case 'process-recognised':
      return { from: b.processFrom, to: b.namesFrom };
    case 'business-language':
      return { from: b.namesFrom, to: b.rulesFrom };
    case 'rules':
      return { from: b.rulesFrom, to: b.openFrom };
    case 'not-determined':
      return { from: b.openFrom, to: b.mapFrom };
    case 'map':
      return { from: b.mapFrom, to: b.endAt };
  }
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Ease in and out — the reading line starts and stops gently. */
function ease(x: number): number {
  const p = clamp01(x);
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** How far the reading line has run through the source, 0 to 1. */
export function readProgress(elapsed: number): number {
  return ease(Math.max(0, elapsed) / (BUILD_UP_BUDGET.processFrom - READ_HOLD));
}

/** How far the process has grown, 0 to 1 — 0 before the process step. */
export function growProgress(elapsed: number): number {
  const b = BUILD_UP_BUDGET;
  if (elapsed < b.processFrom) return 0;
  return clamp01((elapsed - b.processFrom) / (b.namesFrom - GROW_HOLD - b.processFrom));
}

/** How many of `count` grown nodes stand at `elapsed` — at least one once the step began. */
export function grownCount(count: number, elapsed: number): number {
  if (count === 0 || elapsed < BUILD_UP_BUDGET.processFrom) return 0;
  return Math.max(1, Math.ceil(growProgress(elapsed) * count));
}

/** When the `index`-th node (0-based) of `count` began to grow, in ms. */
export function grewAt(index: number, count: number): number {
  const b = BUILD_UP_BUDGET;
  if (count === 0) return b.processFrom;
  return b.processFrom + (index / count) * (b.namesFrom - GROW_HOLD - b.processFrom);
}

/**
 * How many of `count` items a collecting step (the rules, the open points) has
 * revealed at `elapsed`: one after another over the first two thirds of the
 * step, so the last one still stands for a while with the whole list; at least
 * one once the step began, all of them after it.
 */
export function revealedCount(count: number, stage: 'rules' | 'not-determined', elapsed: number): number {
  const { from, to } = buildUpStageSpan(stage);
  if (count === 0 || elapsed < from) return 0;
  if (elapsed >= to) return count;
  const p = clamp01((elapsed - from) / ((to - from) * (2 / 3)));
  return Math.max(1, Math.ceil(p * count));
}

/**
 * How many of the story's `count` numbered steps the last step shows at
 * `elapsed`: one after another over its first 1.6 s, so the reader can follow
 * them in order and still sees the whole story before the end state takes
 * over with the same story.
 */
export function storyRevealed(count: number, elapsed: number): number {
  const b = BUILD_UP_BUDGET;
  if (count === 0 || elapsed < b.mapFrom) return 0;
  return Math.max(1, Math.ceil(clamp01((elapsed - b.mapFrom) / 1600) * count));
}

/** How far the map has settled into its whole view, 0 to 1 — 0 before the map step. */
export function settleProgress(elapsed: number): number {
  const b = BUILD_UP_BUDGET;
  if (elapsed < b.mapFrom) return 0;
  return ease((elapsed - b.mapFrom) / 900);
}

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
  /** The lit events, in source order. Every counter below is a count of these. */
  lit: BuildUpEvent[];
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

function countersOf(lit: readonly BuildUpEvent[], line: number): BuildUpFrame['counters'] {
  const tables = new Set(lit.filter((e) => e.kind === 'data').map((e) => e.table));
  const nodes = lit.filter((e) => e.kind === 'node');
  return {
    line,
    tables: tables.size,
    nodes: nodes.length,
    decisions: nodes.filter((e) => e.nodeKind === 'gateway').length,
  };
}

/** The line the reading line has reached at `elapsed`, in a source of `totalLines`. */
export function readingLineAt(elapsed: number, totalLines: number): number {
  if (totalLines <= 0) return 0;
  return Math.max(1, Math.round(readProgress(elapsed) * totalLines));
}

/**
 * What the build-up shows at `elapsed` ms, when there is no excerpt to grow.
 *
 * Step 1 runs the reading line through the source and lights the table
 * accesses it passes; step 2 lights the process nodes one by one, in source
 * order. From `namesFrom` every event is lit and the names change once; the
 * rules, the open points and the map follow, and at `endAt` the component
 * hands over to the end state.
 */
export function buildUpFrame(events: readonly BuildUpEvent[], elapsed: number, totalLines?: number): BuildUpFrame {
  const t = Math.max(0, elapsed);
  const stage = buildUpStageAt(t);
  const total = totalLines ?? events.reduce((m, e) => Math.max(m, e.line), 0);
  const line = readingLineAt(t, total);
  const nodeEvents = events.filter((e) => e.kind === 'node');
  const grown = new Set(nodeEvents.slice(0, grownCount(nodeEvents.length, t)));
  const lit = events.filter((e) => (e.kind === 'data' ? e.line <= line : grown.has(e)));
  const newestNode = nodeEvents[grown.size - 1] ?? null;
  const lastData = [...lit].reverse().find((e) => e.kind === 'data') ?? null;
  return {
    stage,
    shown: lit.length,
    lit,
    current: newestNode ?? lastData,
    counters: countersOf(lit, line),
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
  /** True while the newest node is still growing in — its line is lit strongest. */
  fresh: boolean;
  /** The line the code panel centres: the reading line in step 1, the newest node's line in step 2. */
  focusLine: number;
}

/**
 * The build-up when there is an excerpt to grow (moment 2 of `s0`).
 *
 * Step 1: the reading line runs through the source, and each table access it
 * passes lights up. Step 2: the excerpt's nodes appear one by one, in the order
 * the excerpt walks them, the code centred on the line each one grows out of;
 * the node counter counts every process line of the source up to the furthest
 * node line grown so far — so it never falls when the main line jumps back
 * into a routine, and only rises with a line.
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
  const line = readingLineAt(t, totalLines);
  const grown = grownCount(n, t);
  let reached = 0;
  for (let i = 0; i < grown; i += 1) reached = Math.max(reached, nodeLines[i] ?? 0);
  if (growProgress(t) >= 1) reached = totalLines;
  const lit = events.filter((e) => (e.kind === 'data' ? e.line <= line : e.line <= reached));
  const newestLine = grown > 0 ? (nodeLines[grown - 1] ?? reached) : null;
  const focusLine = newestLine ?? line;
  const current =
    (newestLine !== null ? events.find((e) => e.line === newestLine) : null) ?? lit[lit.length - 1] ?? null;
  return {
    stage,
    shown: lit.length,
    lit,
    current,
    counters: countersOf(lit, Math.min(line, totalLines)),
    named: t >= BUILD_UP_BUDGET.namesFrom,
    grown,
    fresh: grown > 0 && growProgress(t) < 1 && t - grewAt(grown - 1, n) < BUILD_UP_GROW_MS,
    focusLine: Math.max(1, focusLine),
  };
}
