'use client';

import React, { useMemo } from 'react';
import CcButton from '@/components/cc/Button';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { cn } from '@/lib/utils';
import { tokenizeAbapLine } from '@/lib/process-map';
import { plainLabels } from '@/lib/abap/plain-language';
import type { ProcessSkeleton } from '@/lib/abap/process-skeleton';
import type { TableDependency } from '@/lib/abap/table-dependencies';
import type { NamedProcess } from '@/lib/process-naming';
import {
  buildUpEvents,
  buildUpFrame,
  codeWindow,
  excerptFrame,
  type BuildUpEvent,
  type BuildUpStage,
} from '@/lib/first-look-buildup';
import { firstLookExcerpt, type ExcerptDrawing, type ExcerptNode } from '@/lib/first-look-excerpt';
import {
  wt,
  buildUpCounter,
  buildUpGrowsOut,
  buildUpLive,
  buildUpMoreNames,
  buildUpStageLabel,
} from '@/lib/workspace-messages';

/**
 * The build-up of the first look — mockup screen `s0`, moments 1 to 3.
 *
 * Left, the code: a window of real source lines that follows the reading, each
 * line lit where the engine set a process node (information blue, with a bar)
 * or touched a table (a quieter grey); the line a node just grew out of is lit
 * strongest for 200 ms, then fades to the ordinary lit state. Right, the
 * process: the top-down business excerpt of the main line (`lib/bpmn/excerpt.ts`,
 * the same layout as the landing page's hero), growing node by node in the
 * order the excerpt walks it. Above, the counters — each a count of lit lines,
 * so none rises without a line behind it. In moment 3 the names change once,
 * from the technical names of the source to plain ones.
 *
 * Every number and every label here is the engine's (`lib/first-look-buildup.ts`,
 * `lib/first-look-excerpt.ts`); the component only paints a frame. Reduced
 * motion and Skip never reach it: the parent renders the end state instead.
 */

const TOKEN_CLASS: Record<string, string> = {
  keyword: 'text-cc-code-keyword',
  literal: 'text-cc-code-literal',
  name: 'text-cc-code-name',
  comment: 'text-cc-code-muted',
  plain: 'text-cc-code-ink',
};

/** One node of the excerpt, in the tokens of the workspace. */
function ExcerptShape({ node, named, newest }: { node: ExcerptNode; named: boolean; newest: boolean }) {
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
  return (
    <g data-first-look-node={node.tag}>
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
}: {
  drawing: ExcerptDrawing;
  grown: number;
  named: boolean;
  label?: string;
  /**
   * The whole drawing, scaled down to the window if it is taller — for the end
   * state, where nothing grows any more and a cut-off end event would hide how
   * the process ends. The build-up scrolls the window instead.
   */
  fit?: boolean;
}) {
  // Its own marker id: an id shared by two drawings on one page points the
  // second drawing's arrows at the first one's marker.
  const arrow = `fl-arrow-${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const visible = new Set(drawing.nodes.slice(0, grown).map((n) => n.id));
  const newestNode = drawing.nodes[grown - 1] ?? null;
  const newest = newestNode?.id ?? null;
  const { frame } = drawing;
  // Drawn at the layout's own scale, so a 12 px label stays 12 px; the window
  // follows the newest node down the page as the process grows.
  const bottom = newestNode ? newestNode.box.y + newestNode.box.height + 48 - frame.y : 0;
  // In moment 3 the whole process is there and the reader starts at its top.
  const offset = named || fit ? 0 : Math.max(0, Math.min(bottom - EXCERPT_VIEW, frame.height - EXCERPT_VIEW));
  const scale = fit ? Math.min(1, EXCERPT_VIEW / Math.max(1, frame.height)) : 1;
  return (
    <div className="overflow-hidden" style={{ maxHeight: EXCERPT_VIEW }}>
      <svg
        data-first-look-excerpt=""
        viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        width={Math.round(frame.width * scale)}
        height={Math.round(frame.height * scale)}
        role="img"
        aria-label={label}
        className="mx-auto block h-auto max-w-full motion-safe:transition-transform motion-safe:duration-300"
        style={{ transform: `translateY(${-offset}px)` }}
      >
        <defs>
          <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" className="fill-cc-ink-muted" />
          </marker>
        </defs>
        {drawing.flows
          .filter((f) => visible.has(f.from) && visible.has(f.to))
          .map((f) => (
            <g key={f.id}>
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
          ))}
        {drawing.nodes.slice(0, grown).map((n) => (
          <ExcerptShape key={n.id} node={n} named={named} newest={n.id === newest} />
        ))}
      </svg>
    </div>
  );
}

export default function FirstLookBuildUp({
  source,
  sourceName,
  access,
  skeleton,
  named,
  elapsed,
  onSkip,
}: {
  source: string;
  sourceName: string;
  access: readonly TableDependency[] | null;
  skeleton: ProcessSkeleton | null;
  named: NamedProcess | null;
  elapsed: number;
  onSkip: () => void;
}) {
  const lines = useMemo(() => source.split(/\r\n|\r|\n/), [source]);
  const events = useMemo(() => buildUpEvents(access, skeleton), [access, skeleton]);
  const drawing = useMemo(() => firstLookExcerpt(skeleton, source), [skeleton, source]);
  const nodeLines = useMemo(() => drawing.nodes.map((n) => n.line), [drawing]);
  const withExcerpt = drawing.nodes.length > 0;
  const frame = withExcerpt
    ? excerptFrame(events, nodeLines, elapsed, lines.length)
    : { ...buildUpFrame(events, elapsed), grown: 0, fresh: false };

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
  const lit = events.filter((e) => e.line <= frame.counters.line);
  const litNodeLines = new Set(lit.filter((e) => e.kind === 'node').map((e) => e.line));
  const litDataLines = new Set(lit.filter((e) => e.kind === 'data').map((e) => e.line));
  const currentLine = withExcerpt ? nodeLines[frame.grown - 1] ?? frame.counters.line : frame.current?.line ?? 1;
  const range = codeWindow(lines.length, currentLine ?? 1, 13, 7);
  const grownNodes = withExcerpt ? drawing.nodes.slice(0, frame.grown) : [];
  const swaps = withExcerpt
    ? grownNodes.filter((n) => n.name !== n.technicalName)
    : events.filter((e) => e.kind === 'node' && names.has(e.nodeId ?? '') && names.get(e.nodeId ?? '') !== e.label);
  const container = frame.current?.container ?? null;
  const newest = grownNodes[grownNodes.length - 1] ?? null;
  const fallbackVisible: BuildUpEvent[] = withExcerpt ? [] : lit.filter((e) => e.kind === 'node').slice(-8);

  return (
    <div data-first-look-buildup={stage} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* The live region: the stage is announced when it changes, once per
            stage. The counters and the reading line are not live — they change
            every few hundred milliseconds and would talk over everything. */}
        <h2 data-first-look-stage="" aria-live="polite" aria-atomic={true} className="m-0 text-[14px] leading-tight font-bold text-cc-ink">
          {buildUpStageLabel(stage)}
        </h2>
        <span data-first-look-reading="" className="min-w-0 text-[12px] font-medium text-cc-ink-muted">
          {buildUpLive(sourceName, lines.length, container)}
        </span>
        {stage === 'business-language' ? (
          proposed ? (
            <CcProvenanceChip value="proposed" note={wt('buildUp.names')} />
          ) : (
            <CcProvenanceChip value="reconstructed" note={wt('buildUp.plainNames')} />
          )
        ) : null}
        <span className="ml-auto">
          <CcButton onClick={onSkip} data-first-look-skip="">
            {wt('firstLook.skip')}
          </CcButton>
        </span>
      </div>

      {/* The counters — each a count of lit lines (ADR-013: "Zähler nur mit echten Ereignissen"). */}
      <p
        data-first-look-counters=""
        className="m-0 flex flex-wrap gap-x-4 gap-y-1 border-y border-cc-line py-2 text-[12px] font-medium text-cc-ink-muted"
      >
        <span>{buildUpCounter('lines', frame.counters.line, lines.length)}</span>
        <span>{buildUpCounter('tables', frame.counters.tables)}</span>
        <span>{buildUpCounter('nodes', frame.counters.nodes)}</span>
        {stage !== 'code-read' ? <span>{buildUpCounter('decisions', frame.counters.decisions)}</span> : null}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* The code. Real lines, the reading's window of them. */}
        <pre
          data-first-look-code-panel=""
          aria-label={wt('buildUp.codeLabel')}
          className="m-0 self-start overflow-x-auto rounded-cc-card bg-cc-code-bg p-3 font-cc-mono text-[12px] leading-5 text-cc-code-ink"
        >
          <code>
            {Array.from({ length: Math.max(0, range.to - range.from + 1) }, (_, i) => range.from + i).map((n) => {
              const node = litNodeLines.has(n);
              const data = !node && litDataLines.has(n);
              const now = n === currentLine;
              return (
                <span
                  key={n}
                  data-first-look-line={now ? (frame.fresh ? 'growing' : 'current') : node ? 'node' : data ? 'data' : 'plain'}
                  className={cn(
                    'block rounded-[4px] pr-3 whitespace-pre motion-safe:transition-colors motion-safe:duration-200',
                    node && 'bg-cc-code-hl shadow-[inset_3px_0_0_var(--cc-code-hl-bar)]',
                    data && 'bg-cc-code-ink/10 shadow-[inset_3px_0_0_var(--cc-code-muted)]',
                    now && 'bg-cc-code-hl shadow-[inset_3px_0_0_var(--cc-code-hl-bar)]',
                    now && frame.fresh && 'bg-cc-information/60',
                  )}
                >
                  <span className="mr-3 inline-block w-8 text-right text-cc-code-muted select-none">{n}</span>
                  {tokenizeAbapLine(lines[n - 1] ?? '').map((token, i) => (
                    <span key={i} className={TOKEN_CLASS[token.kind]}>
                      {token.text}
                    </span>
                  ))}
                </span>
              );
            })}
          </code>
        </pre>

        {/* The process, growing out of the lit lines. */}
        <div className="flex min-w-0 flex-col gap-2">
          {withExcerpt ? (
            <ExcerptSvg drawing={drawing} grown={frame.grown} named={frame.named} />
          ) : (
            <ol data-first-look-growing="" className="m-0 flex list-none flex-col gap-1 p-0">
              {fallbackVisible.map((e, i) => (
                <li
                  key={`${e.nodeId}-${e.line}`}
                  className={cn(
                    'flex items-center gap-2 rounded-cc-row border px-2 py-1 text-[12px] font-semibold text-cc-ink',
                    i === fallbackVisible.length - 1 ? 'border-cc-information bg-cc-information-bg' : 'border-cc-line bg-cc-surface',
                  )}
                >
                  <span className={cn('min-w-0 flex-1 truncate', !frame.named && 'font-cc-mono')}>
                    {frame.named ? names.get(e.nodeId ?? '') ?? e.label : e.label}
                  </span>
                  <span className="shrink-0 font-cc-mono text-[11px] text-cc-ink-muted">{e.anchor}</span>
                </li>
              ))}
            </ol>
          )}
          {newest && stage !== 'business-language' && newest.anchor ? (
            <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{buildUpGrowsOut(newest.anchor)}</p>
          ) : null}
          {stage === 'business-language' ? (
            <p data-first-look-swaps="" className="m-0 flex flex-col gap-1 text-[12px] font-medium text-cc-ink">
              {swaps.slice(0, 2).map((s) => {
                const technical = 'technicalName' in s ? s.technicalName : s.label;
                const plain = 'technicalName' in s ? s.name : names.get(s.nodeId ?? '') ?? s.label;
                return (
                  <span key={'id' in s ? s.id : `${s.nodeId}-${s.line}`}>
                    <code className="font-cc-mono text-cc-ink-muted">{technical}</code> → <b className="font-semibold">{plain}</b>
                  </span>
                );
              })}
              {swaps.length > 2 ? <span className="text-cc-ink-muted">{buildUpMoreNames(swaps.length - 2)}</span> : null}
            </p>
          ) : null}
          <p className="m-0 mt-auto flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-cc-ink-muted" aria-hidden={true}>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-[2px] bg-cc-information" />
              {wt('buildUp.legendNode')}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-[2px] bg-cc-code-muted" />
              {wt('buildUp.legendData')}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
