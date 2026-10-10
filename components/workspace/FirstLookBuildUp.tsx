'use client';

import React, { useMemo } from 'react';
import { Check, CircleHelp, FileCode2, Languages, Map as MapIcon, Pause, Play, Scale, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import StartNarrativeWait from './StartNarrativeWait';
import { cn } from '@/lib/utils';
import { countSourceLines } from '@/lib/source-lines';
import { tokenizeAbapLine } from '@/lib/process-map';
import { plainLabels } from '@/lib/abap/plain-language';
import type { ProcessSkeleton } from '@/lib/abap/process-skeleton';
import type { TableDependency } from '@/lib/abap/table-dependencies';
import type { NamedProcess } from '@/lib/process-naming';
import {
  BUILD_UP_BUDGET,
  BUILD_UP_GROW_MS,
  BUILD_UP_STAGES,
  buildUpEvents,
  buildUpFrame,
  excerptFrame,
  grewAt,
  revealedCount,
  settleProgress,
  storyRevealed,
  type BuildUpEvent,
  type BuildUpStage,
} from '@/lib/first-look-buildup';
import { firstLookExcerpt, type ExcerptDrawing, type ExcerptNode } from '@/lib/first-look-excerpt';
import type { BusinessCard } from '@/lib/business-card';
import type { ProcessStory } from '@/lib/process-story';
import {
  wt,
  buildUpCounter,
  buildUpGrowsOut,
  buildUpHeadOpen,
  buildUpHeadRead,
  buildUpHeadRules,
  buildUpMore,
  buildUpMoreNames,
  buildUpRailOpen,
  buildUpRailProcess,
  buildUpRailRead,
  buildUpRailRules,
  buildUpStageLabel,
  bizStoryWithin,
  firstLookOpenGroup,
} from '@/lib/workspace-messages';

/**
 * The build-up of the first look — mockup screen `s0`, paced so a first-time
 * reader can follow it (ADR-072, amended 03.10.2026: "more wow, but the user
 * is somewhat overwhelmed today").
 *
 * **One focal point per step.** Each step says one headline — the one thing it
 * means for the reader — and moves one thing:
 *
 *   1. *Reading your 668 lines…* — the reading line runs through the source,
 *      the line counter follows it, each table access it passes lights grey;
 *   2. *Finding the process in the code…* — the code centres on the line a
 *      node stands on, the line lights blue, and the node grows in on the map
 *      beside it with its anchor; the flows join it once both ends stand;
 *   3. *Each step, in plain words* — the names change once, on the map;
 *   4. *n business rules are hard-coded* — each rule lights at its line in the
 *      code and joins a list over the dimmed map;
 *   5. *n points the engine cannot judge — shown, not hidden* — the same, for
 *      the open points, marked as not determined;
 *   6. *Your process, every step tied to its line* — the code gives way to the
 *      process as numbered steps in plain words, each with its line — the
 *      story the Business view opens on (`lib/process-story.ts`) — and the
 *      whole map settles into view beside it.
 *
 * The step strip is six icons on a progress line; the labels and what each step
 * found are there for a screen reader and on hover, not as text over the code.
 * Counters are one quiet line under the headline. The headline is the one live
 * region, so a screen reader hears each step once, never the counters.
 *
 * Motion is transform and opacity only, driven by the parent's clock, so the
 * movement is the same frame for frame on every machine and stops when the
 * reader pauses. Reduced motion and Skip never reach this component: the
 * parent renders the end state instead.
 *
 * Every number and every label here is the engine's (`lib/first-look-buildup.ts`,
 * `lib/first-look-excerpt.ts`, `lib/business-card.ts`); the component only
 * paints a frame.
 */

const TOKEN_CLASS: Record<string, string> = {
  keyword: 'text-cc-code-keyword',
  literal: 'text-cc-code-literal',
  name: 'text-cc-code-name',
  comment: 'text-cc-code-muted',
  plain: 'text-cc-code-ink',
};

/** One node of the excerpt, in the tokens of the workspace. */
function ExcerptShape({
  node,
  named,
  newest,
  growth = 1,
}: {
  node: ExcerptNode;
  named: boolean;
  newest: boolean;
  /** 0 to 1: how far the node has grown in — its opacity and its scale. */
  growth?: number;
}) {
  const { x, y, width, height } = node.box;
  const stroke = newest ? 'stroke-cc-information' : 'stroke-cc-information-border';
  const sw = newest ? 2 : 1.5;
  const name = named ? node.name : node.technicalName;
  const isEvent = node.tag.endsWith('Event');
  const isGateway = node.tag.endsWith('Gateway');
  const cx = x + width / 2;
  const cy = y + height / 2;
  let shape: React.ReactNode;
  if (isEvent) {
    shape = (
      <circle
        cx={cx}
        cy={cy}
        r={Math.min(width, height) / 2}
        strokeWidth={node.tag === 'endEvent' ? 3 : sw}
        className={cn('fill-cc-surface', node.error ? 'stroke-cc-error' : node.tag === 'endEvent' ? 'stroke-cc-ink' : stroke)}
      />
    );
  } else if (isGateway) {
    shape = (
      <path
        d={`M${cx} ${y} L${x + width} ${cy} L${cx} ${y + height} L${x} ${cy} Z`}
        strokeWidth={sw}
        className={cn('fill-cc-information-bg', stroke)}
      />
    );
  } else {
    shape = <rect x={x} y={y} width={width} height={height} rx={6} strokeWidth={sw} className={cn('fill-cc-information-bg', stroke)} />;
  }
  // Inside an activity: the plain name as the layout wrapped it, or the token
  // of the source on one line (moments 1–2); outside an event or a gateway: the
  // label the layout placed.
  const lines = isEvent || isGateway ? node.label?.lines ?? [name] : named ? node.inside ?? [name] : [name];
  const labelBox = isEvent || isGateway ? node.label?.box ?? { x: x + width + 6, y, width: 160, height } : node.box;
  const centred = !(isEvent || isGateway) || !!node.label;
  const tx = centred ? labelBox.x + labelBox.width / 2 : labelBox.x;
  const ty0 = isEvent || isGateway ? labelBox.y + 11 : cy - ((lines.length - 1) * 14) / 2 - (node.anchor ? 4 : -4);
  const grown = growth >= 1;
  return (
    <g
      data-first-look-node={node.tag}
      style={
        grown
          ? undefined
          : {
              opacity: growth,
              transform: `scale(${0.8 + 0.2 * growth})`,
              transformBox: 'fill-box',
              transformOrigin: 'center',
            }
      }
    >
      {shape}
      {lines.map((line, i) => (
        <text
          key={i}
          x={tx}
          y={ty0 + i * 14}
          textAnchor={centred ? 'middle' : 'start'}
          fontSize={12}
          className={cn('fill-cc-ink font-semibold', !named && 'font-cc-mono')}
        >
          {line.length > 34 ? `${line.slice(0, 33)}…` : line}
        </text>
      ))}
      {node.anchor ? (
        <text
          x={tx}
          y={ty0 + lines.length * 14}
          textAnchor={centred ? 'middle' : 'start'}
          fontSize={11}
          className="fill-cc-ink-muted font-cc-mono"
        >
          {node.anchor}
        </text>
      ) : null}
    </g>
  );
}

/** How tall the window onto the growing excerpt is; the drawing keeps its own scale inside it. */
const EXCERPT_VIEW = 440;

/** The end state shrinks the drawing no further: 12 px names stay 11 px. */
const EXCERPT_MIN_SCALE = 0.92;

/**
 * The drawing itself — also the process picture of the end state
 * (`FirstLook.tsx`), so the process a reader watched grow is the one that stays.
 */
export function ExcerptSvg({
  drawing,
  grown,
  named,
  label = wt('buildUp.processLabel'),
  fit = false,
  growth,
  settle = 0,
}: {
  drawing: ExcerptDrawing;
  grown: number;
  named: boolean;
  label?: string;
  /**
   * The end state: the whole drawing at the width of its card — never wider
   * than the layout's own scale, never narrower than `EXCERPT_MIN_SCALE`, so a
   * label stays readable. No window: the card around it scrolls a drawing taller
   * than it has room for (`FirstLook.tsx`), and a narrow column scrolls it
   * sideways. Fitting the height instead shrank a five-step main line to half
   * its size, 6 px labels in a column with room to spare (owner 10.10.2026).
   */
  fit?: boolean;
  /** The build-up only: how far node `index` has grown in, 0 to 1. Absent, every node stands. */
  growth?: (index: number) => number;
  /**
   * The build-up only: 0 to 1, how far the drawing has settled from the window
   * that followed the growth into the whole drawing — by transform, so the
   * layout around it does not move.
   */
  settle?: number;
}) {
  // Its own marker id: an id shared by two drawings on one page points the
  // second drawing's arrows at the first one's marker.
  const arrow = `fl-arrow-${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const shown = drawing.nodes.slice(0, grown);
  const index = new Map(shown.map((n, i) => [n.id, i]));
  const newestNode = drawing.nodes[grown - 1] ?? null;
  const newest = newestNode?.id ?? null;
  const { frame } = drawing;
  // Drawn at the layout's own scale, so a 12 px label stays 12 px; the window
  // follows the newest node down the page as the process grows.
  const bottom = newestNode ? newestNode.box.y + newestNode.box.height + 48 - frame.y : 0;
  // From the names on, the whole process is there and the reader starts at its top.
  const follow = named || fit ? 0 : Math.max(0, Math.min(bottom - EXCERPT_VIEW, frame.height - EXCERPT_VIEW));
  const fitScale = Math.min(1, EXCERPT_VIEW / Math.max(1, frame.height));
  const scale = 1 + (fitScale - 1) * settle;
  const offset = follow * (1 - settle);
  const growing = (i: number) => (growth ? growth(i) : 1);
  const svg = (
    <svg
      data-first-look-excerpt=""
      data-first-look-excerpt-fit={fit ? 'width' : undefined}
      viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
      width={Math.round(frame.width)}
      height={Math.round(frame.height)}
      role="img"
      aria-label={label}
      className={cn(
        'mx-auto block h-auto',
        fit ? null : 'max-w-full',
        // A settle is driven frame by frame; a transition would only lag it.
        fit || (settle > 0 && settle < 1) ? null : 'motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out',
      )}
      style={
        fit
          ? {
              width: '100%',
              maxWidth: Math.round(frame.width),
              minWidth: Math.round(frame.width * EXCERPT_MIN_SCALE),
            }
          : {
              transform: `translateY(${-offset}px) scale(${scale})`,
              transformOrigin: 'top center',
            }
      }
    >
      <defs>
        <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" className="fill-cc-ink-muted" />
        </marker>
      </defs>
      {drawing.flows
        .filter((f) => index.has(f.from) && index.has(f.to))
        .map((f) => {
          const g = Math.min(growing(index.get(f.from)!), growing(index.get(f.to)!));
          return (
            <g key={f.id} style={g < 1 ? { opacity: g } : undefined}>
              <polyline
                points={f.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                strokeWidth={1.5}
                markerEnd={`url(#${arrow})`}
                className="stroke-cc-ink-muted"
              />
              {named && f.label
                ? f.label.lines.map((l, i) => (
                    <text
                      key={i}
                      x={f.label!.box.x + f.label!.box.width / 2}
                      y={f.label!.box.y + 11 + i * 13}
                      textAnchor="middle"
                      fontSize={11}
                      className="fill-cc-ink-muted"
                    >
                      {l}
                    </text>
                  ))
                : null}
            </g>
          );
        })}
      {shown.map((n, i) => (
        <ExcerptShape key={n.id} node={n} named={named} newest={n.id === newest && !named} growth={growing(i)} />
      ))}
    </svg>
  );
  // The end state has no window: the card it stands in decides the height.
  if (fit) return svg;
  return (
    <div className="overflow-hidden" style={{ maxHeight: EXCERPT_VIEW }}>
      {svg}
    </div>
  );
}

/**
 * What the map moment says, from the start run's phase (ADR-072). `writing` is
 * the start with the model on, while the narrative is being written (owner
 * decision 03.10.2026); `running` is the signing itself.
 */
export type BuildUpMapState = 'drawn' | 'writing' | 'running' | 'failed' | 'unsigned';

/** The start's wait for the narrative: since when, and the way not to wait. */
export interface BuildUpNarrative {
  /** `Date.now()` when the wait began; null when nothing is being written. */
  since: number | null;
  onContinue: () => void;
  /** True when this start asked the model — the map moment then says so. */
  withModel: boolean;
}

/** The pause of the build-up's clock, which the parent owns. */
export interface BuildUpPause {
  paused: boolean;
  onToggle: () => void;
}

const STAGE_ICON: Record<BuildUpStage, LucideIcon> = {
  'code-read': FileCode2,
  'process-recognised': Workflow,
  'business-language': Languages,
  rules: Scale,
  'not-determined': CircleHelp,
  map: MapIcon,
};

/** One step of the strip: an icon, its name and result for a screen reader and on hover. */
function RailStep({
  stage,
  state,
  result,
}: {
  stage: BuildUpStage;
  state: 'done' | 'current' | 'pending';
  result: string | null;
}) {
  const Icon = state === 'done' ? Check : STAGE_ICON[stage];
  const said = state !== 'pending' && result ? `${buildUpStageLabel(stage)}: ${result}` : buildUpStageLabel(stage);
  return (
    <li
      data-first-look-rail-step={stage}
      data-state={state}
      aria-current={state === 'current' ? 'step' : undefined}
      title={said}
      className="flex shrink-0 items-center"
    >
      <span
        aria-hidden={true}
        className={cn(
          'grid h-7 w-7 place-items-center rounded-full border motion-safe:transition-opacity motion-safe:duration-300',
          state === 'current' && 'border-cc-ink bg-cc-ink text-cc-on-dark',
          state === 'done' && 'border-cc-success-border bg-cc-success-bg text-cc-success',
          state === 'pending' && 'border-cc-line bg-cc-surface text-cc-ink-muted opacity-60',
        )}
      >
        <Icon size={14} />
      </span>
      <span className="sr-only">
        {buildUpStageLabel(stage)}
        {state !== 'pending' && result ? (
          <span data-first-look-rail-result="">
            {': '}
            {result}
          </span>
        ) : null}
      </span>
    </li>
  );
}

/** How a line of the code panel is marked. */
type LineMark = 'node' | 'data' | 'rule' | 'open' | null;

/** The height of one code line, px — `leading-5`. */
const LINE_H = 20;

const MARK_CLASS: Record<Exclude<LineMark, null>, string> = {
  node: 'bg-cc-code-hl shadow-[inset_3px_0_0_var(--cc-code-hl-bar)]',
  data: 'bg-cc-code-ink/10 shadow-[inset_3px_0_0_var(--cc-code-muted)]',
  rule: 'bg-cc-warning-mark/30 shadow-[inset_3px_0_0_var(--cc-warning-line)]',
  open: 'bg-cc-code-ink/10 outline-1 -outline-offset-1 outline-dashed outline-cc-code-muted',
};

/** One line of the source. Memoised: while the panel scrolls, only a line whose mark changes repaints. */
const CodeLine = React.memo(function CodeLine({ n, text, mark }: { n: number; text: string; mark: LineMark }) {
  const tokens = useMemo(() => tokenizeAbapLine(text), [text]);
  return (
    <span data-first-look-line={mark ?? 'plain'} data-line={n} className="relative block h-5 pr-3 whitespace-pre">
      {/* The mark fades in and out on opacity — the line's text never moves. */}
      <span
        aria-hidden={true}
        className={cn(
          'absolute inset-0 rounded-[4px] motion-safe:transition-opacity motion-safe:duration-300',
          mark ? MARK_CLASS[mark] : null,
        )}
        style={{ opacity: mark ? 1 : 0 }}
      />
      <span className="relative mr-3 inline-block w-8 text-right text-cc-code-muted select-none">{n}</span>
      {tokens.map((token, i) => (
        <span key={i} className={cn('relative', TOKEN_CLASS[token.kind])}>
          {token.text}
        </span>
      ))}
    </span>
  );
});

/**
 * The code: a window onto the real source that glides to the line in focus.
 * A fixed band at 40 % of the height marks the focus; the source moves under
 * it by transform. Only a slice of lines around the focus is rendered, in
 * steps of 40, so the slice changes rarely and a long source stays cheap.
 */
function CodePanel({
  lines,
  total,
  focus,
  marks,
  gliding,
  strong,
  dimmed,
  caption,
}: {
  lines: readonly string[];
  total: number;
  focus: number;
  marks: ReadonlyMap<number, Exclude<LineMark, null>>;
  /** True when the focus jumps (a node, a rule) — the source glides there; false while the reading line runs. */
  gliding: boolean;
  /** True while a node is growing out of the focused line. */
  strong: boolean;
  /** True when the focus of the step is elsewhere — the code steps back. */
  dimmed: boolean;
  caption: string;
}) {
  const centre = Math.min(Math.max(1, focus), Math.max(1, total));
  const base = Math.floor(centre / 40) * 40;
  const from = Math.max(1, base - 40);
  const to = Math.min(total, base + 80);
  return (
    <div
      data-first-look-code-panel=""
      className={cn(
        'relative flex h-[200px] min-w-0 flex-col overflow-hidden rounded-cc-card bg-cc-code-bg md:h-[440px] motion-safe:transition-opacity motion-safe:duration-500',
        dimmed && 'opacity-50',
      )}
    >
      <span data-first-look-reading="" className="relative z-10 truncate bg-cc-code-bg px-3 pt-2 pb-1 font-cc-mono text-[11px] font-medium text-cc-code-muted">
        {caption}
      </span>
      <div className="relative min-h-0 flex-1">
        <span
          aria-hidden={true}
          className={cn(
            'absolute inset-x-0 top-[40%] h-5 bg-cc-information/25 shadow-[inset_3px_0_0_var(--cc-code-hl-bar)] motion-safe:transition-opacity motion-safe:duration-200',
          )}
          style={{ opacity: strong ? 1 : 0.6 }}
        />
        <pre
          aria-label={wt('buildUp.codeLabel')}
          className={cn(
            'absolute inset-x-0 top-[40%] m-0 px-3 font-cc-mono text-[12px] leading-5 text-cc-code-ink',
            gliding && 'motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out',
          )}
          style={{ transform: `translateY(${-(centre - 1) * LINE_H}px)` }}
        >
          <code>
            <span aria-hidden={true} className="block" style={{ height: (from - 1) * LINE_H }} />
            {Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i).map((n) => (
              <CodeLine key={n} n={n} text={lines[n - 1] ?? ''} mark={marks.get(n) ?? null} />
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}

/**
 * The last step: the process as the numbered story the Business view opens on,
 * each step with its line, appearing one after another where the code stood —
 * the code steps back and the business leads (mockup `s0`).
 */
function StoryPanel({ story, shown }: { story: ProcessStory; shown: number }) {
  return (
    <ol
      data-first-look-story=""
      data-steps={story.steps.length}
      className="m-0 flex min-w-0 list-none flex-col gap-2 overflow-hidden rounded-cc-card border border-cc-line bg-cc-surface p-3 md:h-[440px]"
    >
      {story.steps.map((step, i) => (
        <li
          key={`${step.nodeId}-${i}`}
          className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3 motion-safe:transition-opacity motion-safe:duration-300"
          style={{ opacity: i < shown ? 1 : 0 }}
          aria-hidden={i < shown ? undefined : true}
        >
          <span
            aria-hidden={true}
            className="inline-flex size-7 items-center justify-center rounded-full bg-cc-surface-muted text-[13px] font-bold text-cc-ink"
          >
            {i + 1}
          </span>
          <p className="m-0 flex min-w-0 flex-wrap items-baseline gap-x-2 pt-1 text-[14px] leading-snug font-semibold text-cc-ink">
            <span className="min-w-0 break-words">
              {step.within ? `${bizStoryWithin(step.within)} ` : null}
              {step.text}
            </span>
            {step.anchor ? <span className="font-cc-mono text-[11px] font-medium text-cc-ink-muted">{step.anchor}</span> : null}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** "L52-74" → 52. */
function lineOf(anchor: string | null | undefined): number | null {
  const m = anchor ? /^L(\d+)/.exec(anchor) : null;
  return m ? Number(m[1]) : null;
}

export default function FirstLookBuildUp({
  source,
  sourceName,
  access,
  skeleton,
  named,
  elapsed,
  onSkip,
  card = null,
  map = 'unsigned',
  narrative = null,
  pause = null,
  story = null,
}: {
  source: string;
  sourceName: string;
  access: readonly TableDependency[] | null;
  skeleton: ProcessSkeleton | null;
  named: NamedProcess | null;
  elapsed: number;
  onSkip: () => void;
  /**
   * The answer the end state will show — the rules and the open points the
   * fourth and fifth moments name, each with its line. `null` while the
   * engine has not returned it; those moments then say what is being read.
   */
  card?: BusinessCard | null;
  /** Where the full map stands: drawn from a signed run, being signed, refused, or not signed. */
  map?: BuildUpMapState;
  /** The start's narrative, when the model is on. */
  narrative?: BuildUpNarrative | null;
  /** Pause and continue, when the parent's clock can be paused. */
  pause?: BuildUpPause | null;
  /** The process as numbered steps — the last step lands on it; null while the engine has not returned it. */
  story?: ProcessStory | null;
}) {
  const withModel = narrative?.withModel === true;
  const lines = useMemo(() => source.split(/\r\n|\r|\n/), [source]);
  // The count an editor shows: the final newline ends the last line and adds
  // no empty one (lib/source-lines.ts). `lines` above still indexes them.
  const totalLines = useMemo(() => countSourceLines(source), [source]);
  const events = useMemo(() => buildUpEvents(access, skeleton), [access, skeleton]);
  const drawing = useMemo(() => firstLookExcerpt(skeleton, source), [skeleton, source]);
  const nodeLines = useMemo(() => drawing.nodes.map((n) => n.line), [drawing]);
  const withExcerpt = drawing.nodes.length > 0;
  const frame = withExcerpt
    ? excerptFrame(events, nodeLines, elapsed, totalLines)
    : (() => {
        const f = buildUpFrame(events, elapsed, totalLines);
        return { ...f, grown: 0, fresh: false, focusLine: f.current?.line ?? f.counters.line };
      })();

  // Plain names for the fallback list: the stored business names where a
  // naming exists (Model proposal), otherwise the engine's plain wording.
  const proposed = named?.state === 'named' && named.counts.named > 0;
  const names = useMemo(() => {
    const out = new Map<string, string>();
    if (!skeleton) return out;
    if (proposed && named) {
      for (const node of named.nodes) if (node.businessName) out.set(node.id, node.businessName);
    } else {
      for (const [id, label] of plainLabels(skeleton, source).nodes) if (label && label.trim()) out.set(id, label);
    }
    return out;
  }, [skeleton, named, proposed, source]);

  const stage: BuildUpStage = frame.stage;
  const stageIndex = BUILD_UP_STAGES.indexOf(stage);
  const over = elapsed >= BUILD_UP_BUDGET.endAt;
  const paused = pause?.paused === true;

  // The rules and the open points, revealed one after another in their steps.
  // The decisive rules first — the ones the end state's headline names — then
  // the rest in source order; four are named, the others counted.
  const rules = card
    ? [...card.featured, ...card.rules.filter((r) => !card.featured.some((f) => f.id === r.id))]
    : [];
  const groups = card?.open.groups ?? [];
  const rulesShown = stage === 'rules' ? revealedCount(Math.min(rules.length, 4), 'rules', elapsed) : 0;
  const groupsShown = stage === 'not-determined' ? revealedCount(Math.min(groups.length, 4), 'not-determined', elapsed) : 0;

  // What the code marks, step by step: the tables and the process lines while
  // they are found, then only the rules, then only the open points.
  const marks = new Map<number, Exclude<LineMark, null>>();
  let focus = frame.focusLine;
  if (stage === 'rules') {
    for (const rule of rules.slice(0, rulesShown)) {
      const n = lineOf(rule.anchors[0]);
      if (n) {
        marks.set(n, 'rule');
        focus = n;
      }
    }
  } else if (stage === 'not-determined') {
    for (const group of groups.slice(0, groupsShown)) {
      for (const a of group.anchors) {
        const n = lineOf(a);
        if (n) {
          marks.set(n, 'open');
          focus = n;
        }
      }
      const first = lineOf(group.anchors[0]);
      if (first) focus = first;
    }
  } else {
    for (const e of frame.lit) if (e.kind === 'data') marks.set(e.line, 'data');
    for (const e of frame.lit) if (e.kind === 'node') marks.set(e.line, 'node');
  }

  const grownNodes = withExcerpt ? drawing.nodes.slice(0, frame.grown) : [];
  const newest = grownNodes[grownNodes.length - 1] ?? null;
  const swaps = withExcerpt
    ? drawing.nodes.filter((n) => n.name !== n.technicalName)
    : events.filter((e) => e.kind === 'node' && names.has(e.nodeId ?? '') && names.get(e.nodeId ?? '') !== e.label);
  const fallbackVisible: BuildUpEvent[] = withExcerpt ? [] : frame.lit.filter((e) => e.kind === 'node').slice(-8);
  const growth = (i: number) => Math.min(1, Math.max(0, (elapsed - grewAt(i, drawing.nodes.length)) / BUILD_UP_GROW_MS));

  // What each step found — the engine's numbers, said once the step has been
  // reached, never before.
  const ruleCount = card ? card.rules.length : null;
  const openCount = card ? (card.open.noSource ? null : card.open.count) : null;
  const mapStatus =
    map === 'drawn'
      ? withModel
        ? wt('buildUp.statusDrawnModel')
        : wt('buildUp.statusDrawn')
      : map === 'running' || map === 'writing'
        ? withModel
          ? wt('buildUp.statusRunningModel')
          : wt('buildUp.statusRunning')
        : map === 'failed'
          ? wt('buildUp.statusFailed')
          : wt('buildUp.statusUnsigned');
  const results: Record<BuildUpStage, string | null> = {
    'code-read': buildUpRailRead(totalLines, frame.counters.tables),
    'process-recognised': buildUpRailProcess(frame.counters.nodes, frame.counters.decisions),
    'business-language': proposed ? wt('buildUp.railNamesProposed') : wt('buildUp.railNamesPlain'),
    rules: ruleCount === null ? null : buildUpRailRules(ruleCount),
    'not-determined': openCount === null ? null : buildUpRailOpen(openCount),
    map:
      map === 'drawn'
        ? wt('buildUp.railMapDrawn')
        : map === 'writing'
          ? wt('buildUp.railMapWriting')
          : map === 'running'
            ? wt('buildUp.railMapRunning')
            : map === 'failed'
              ? wt('buildUp.railMapFailed')
              : wt('buildUp.railMapUnsigned'),
  };

  // The one sentence each step says.
  const headline =
    stage === 'code-read'
      ? buildUpHeadRead(totalLines)
      : stage === 'process-recognised'
        ? wt('buildUp.headProcess')
        : stage === 'business-language'
          ? proposed
            ? wt('buildUp.headNamesProposed')
            : wt('buildUp.headNames')
          : stage === 'rules'
            ? ruleCount === null
              ? wt('buildUp.headRulesReading')
              : buildUpHeadRules(ruleCount)
            : stage === 'not-determined'
              ? openCount === null
                ? wt('buildUp.headOpenReading')
                : buildUpHeadOpen(openCount)
              : wt('buildUp.headMap');

  const progress = Math.min(1, elapsed / BUILD_UP_BUDGET.endAt);
  // A collecting step dims the map only when it has something to gather over
  // it; with no rule or no open point the process stays in plain sight.
  const collecting = (stage === 'rules' && rulesShown > 0) || (stage === 'not-determined' && groupsShown > 0);
  const waitingForNarrative = over && map === 'writing' && narrative?.since != null;
  const storySteps = story?.steps.length ?? 0;
  const storyShown = stage === 'map' && storySteps > 0 ? storyRevealed(storySteps, elapsed) : 0;

  return (
    <div data-first-look-buildup={stage} data-paused={paused ? 'true' : 'false'} className="flex min-w-0 flex-col gap-4">
      {/* The steps, as icons on a progress line, and the two ways out of the pace. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <ol data-first-look-rail="" aria-label={wt('buildUp.railLabel')} className="m-0 flex list-none items-center justify-between gap-2 p-0">
            {BUILD_UP_STAGES.map((s, i) => (
              <RailStep key={s} stage={s} state={i < stageIndex ? 'done' : i === stageIndex ? 'current' : 'pending'} result={results[s]} />
            ))}
          </ol>
          <div aria-hidden={true} className="mt-2 h-1 overflow-hidden rounded-full bg-cc-line">
            <div
              data-first-look-progress={Math.round(progress * 100)}
              className="h-full origin-left rounded-full bg-cc-ink"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
        </div>
        <span className="ml-auto flex items-center gap-2">
          {pause && !over ? (
            <CcButton
              onClick={pause.onToggle}
              data-first-look-pause={paused ? 'paused' : 'playing'}
              icon={paused ? <Play size={16} aria-hidden={true} /> : <Pause size={16} aria-hidden={true} />}
            >
              {paused ? wt('buildUp.continue') : wt('buildUp.pause')}
            </CcButton>
          ) : null}
          <CcButton onClick={onSkip} data-first-look-skip="">
            {wt('firstLook.skip')}
          </CcButton>
        </span>
      </div>

      {/* The one headline — the build-up's one live region: it changes once
          per step, never with the counters. */}
      <div className="flex min-h-[64px] flex-col gap-1">
        <h2
          data-first-look-stage=""
          aria-live="polite"
          aria-atomic={true}
          className="m-0 text-[22px] leading-tight font-bold tracking-tight text-cc-ink"
        >
          {headline}
        </h2>
        {stage === 'code-read' || stage === 'process-recognised' ? (
          <p data-first-look-counters="" className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-medium text-cc-ink-muted">
            {stage === 'code-read' ? (
              <>
                <span>{buildUpCounter('lines', frame.counters.line, totalLines)}</span>
                <span>{buildUpCounter('tables', frame.counters.tables)}</span>
              </>
            ) : (
              <>
                <span>{buildUpCounter('nodes', frame.counters.nodes)}</span>
                <span>{buildUpCounter('decisions', frame.counters.decisions)}</span>
                {newest?.anchor ? <span className="font-cc-mono">{buildUpGrowsOut(newest.anchor)}</span> : null}
              </>
            )}
          </p>
        ) : null}
        {stage === 'business-language' ? (
          <p data-first-look-swaps="" className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-cc-ink">
            {proposed ? (
              <CcProvenanceChip value="proposed" note={wt('buildUp.names')} />
            ) : (
              <CcProvenanceChip value="reconstructed" note={wt('buildUp.plainNames')} />
            )}
            {swaps.slice(0, 1).map((s) => {
              const technical = 'technicalName' in s ? s.technicalName : s.label;
              const plain = 'technicalName' in s ? s.name : (names.get(s.nodeId ?? '') ?? s.label);
              return (
                <span key={'id' in s ? s.id : `${s.nodeId}-${s.line}`}>
                  <code className="font-cc-mono text-cc-ink-muted">{technical}</code> → <b className="font-semibold">{plain}</b>
                </span>
              );
            })}
            {swaps.length > 1 ? <span className="text-cc-ink-muted">{buildUpMoreNames(swaps.length - 1)}</span> : null}
          </p>
        ) : null}
        {stage === 'map' ? (
          <div data-first-look-moment="map" data-map={map} className="flex flex-col gap-2">
            {waitingForNarrative ? (
              <StartNarrativeWait since={narrative!.since!} onContinue={narrative!.onContinue} />
            ) : (
              <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{mapStatus}</p>
            )}
          </div>
        ) : null}
        {paused ? (
          <p data-first-look-paused="" className="m-0 text-[12px] font-semibold text-cc-ink-muted">
            {wt('buildUp.paused')}
          </p>
        ) : null}
      </div>

      {/* The code on one side, the process on the other; on a phone the
          process is drawn below the code. */}
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {storyShown > 0 && story ? (
          <StoryPanel story={story} shown={storyShown} />
        ) : (
          <CodePanel
            lines={lines}
            total={totalLines}
            focus={focus}
            marks={marks}
            gliding={stage !== 'code-read'}
            strong={frame.fresh || collecting}
            dimmed={stage === 'business-language' || stage === 'map'}
            caption={sourceName}
          />
        )}

        <div className="relative h-[360px] min-w-0 overflow-hidden rounded-cc-card border border-cc-line bg-cc-surface md:h-[440px]">
          <div
            className={cn('h-full motion-safe:transition-opacity motion-safe:duration-500', collecting && 'opacity-30')}
          >
            {stage === 'code-read' ? (
              <p className="m-0 grid h-full place-items-center px-6 text-center text-[13px] font-medium text-cc-ink-muted">
                {wt('buildUp.processHere')}
              </p>
            ) : withExcerpt ? (
              <ExcerptSvg
                drawing={drawing}
                grown={frame.grown}
                named={frame.named}
                growth={growth}
                settle={settleProgress(elapsed)}
              />
            ) : fallbackVisible.length > 0 ? (
              <ol data-first-look-growing="" className="m-0 flex list-none flex-col gap-1 p-3">
                {fallbackVisible.map((e, i) => (
                  <li
                    key={`${e.nodeId}-${e.line}`}
                    className={cn(
                      'flex items-center gap-2 rounded-cc-row border px-2 py-1 text-[12px] font-semibold text-cc-ink',
                      i === fallbackVisible.length - 1 ? 'border-cc-information bg-cc-information-bg' : 'border-cc-line bg-cc-surface',
                    )}
                  >
                    <span className={cn('min-w-0 flex-1 truncate', !frame.named && 'font-cc-mono')}>
                      {frame.named ? (names.get(e.nodeId ?? '') ?? e.label) : e.label}
                    </span>
                    <span className="shrink-0 font-cc-mono text-[11px] text-cc-ink-muted">{e.anchor}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>

          {/* What the reading found in the process, collected over the dimmed map. */}
          {stage === 'rules' && card && rules.length > 0 ? (
            <div data-first-look-moment="rules" className="absolute inset-x-3 bottom-3 rounded-cc-card border border-cc-line bg-cc-surface px-3 py-2 shadow-cc">
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {rules.slice(0, rulesShown).map((rule) => (
                  <li key={rule.id} className="flex items-baseline gap-2 text-[13px] font-medium text-cc-ink">
                    <span className="min-w-0 flex-1 truncate">{rule.phrase ?? <code className="font-cc-mono">{rule.code}</code>}</span>
                    {rule.anchors[0] ? <span className="shrink-0 font-cc-mono text-[11px] text-cc-ink-muted">{rule.anchors[0]}</span> : null}
                  </li>
                ))}
              </ul>
              {rules.length > 4 && rulesShown >= 4 ? (
                <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted">{buildUpMore(rules.length - 4)}</p>
              ) : null}
            </div>
          ) : null}
          {stage === 'not-determined' && card && groups.length > 0 ? (
            <div
              data-first-look-moment="not-determined"
              className="absolute inset-x-3 bottom-3 rounded-cc-card border border-dashed border-cc-neutral-border bg-cc-surface px-3 py-2 shadow-cc"
            >
              <div className="mb-1">
                <CcProvenanceChip value="not-determined" />
              </div>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {groups.slice(0, groupsShown).map((group) => (
                  <li key={group.label} className="flex items-baseline gap-2 text-[13px] font-medium text-cc-ink">
                    <span className="min-w-0 flex-1 truncate">
                      {group.count > 1 ? firstLookOpenGroup(group.label, group.count) : group.label}
                    </span>
                    {group.anchors[0] ? <span className="shrink-0 font-cc-mono text-[11px] text-cc-ink-muted">{group.anchors[0]}</span> : null}
                  </li>
                ))}
              </ul>
              {groups.length > 4 && groupsShown >= 4 ? (
                <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted">{buildUpMore(groups.length - 4)}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
