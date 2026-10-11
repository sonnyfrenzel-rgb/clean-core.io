'use client';

import React, { useMemo, useState } from 'react';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { STATE_CLASSES } from '@/components/cc/state';
import { cn } from '@/lib/utils';
import { cleanCoreLevel } from '@/lib/clean-core-level';
import {
  itvGraphEdgeLabel,
  itvGraphEdgeName,
  itvGraphMore,
  itvGraphObjectName,
  itvGraphShown,
  itvGraphSourceName,
  itvRange,
  wt,
  type WorkspaceMessageKey,
} from '@/lib/workspace-messages';
import { kindWord } from '@/lib/it-state';
import type { ItObjectRow, ItObjects } from '@/lib/it-objects';
import type { ItUseRow } from '@/lib/it-findings';
import {
  dependencyGraph,
  layoutDependencyGraph,
  type DepGraph,
  type DepGraphEdge,
} from '@/lib/it-dependency-graph';

const USE_WORDS: Record<ItUseRow['use'], WorkspaceMessageKey> = {
  call: 'itv.useCall',
  read: 'itv.useRead',
  write: 'itv.useWrite',
  use: 'itv.useUse',
};

/**
 * The table's word for a use — "called", "written (batch input)" — one wording
 * for the *Use* column and the graph's edge labels.
 */
export function objectUseWord(use: ItObjectRow['use'], batchInput: ItObjectRow['batchInput']): string {
  if (use === 'defined') return wt('itv.useDefined');
  if (batchInput === 'all') return wt('itv.useWriteBatchInput');
  if (batchInput === 'some') return wt('itv.useWriteBatchInputSome');
  return wt(USE_WORDS[use]);
}

const USE_KINDS = new Set(['bapi', 'function-module', 'table', 'transaction', 'program', 'object']);
/** "BAPI", "table" — the table's word for a use kind; an inventory type is shown as recorded. */
export function objectKindWord(kind: string): string {
  return USE_KINDS.has(kind) ? kindWord(kind as ItUseRow['kind']) : kind;
}

/**
 * The dependency graph of the IT view (roadmap after 3.0.7, item 3) — the
 * rows of *Objects & dependencies* as a picture, beside the table and never in
 * its place. The model, its caps and its layout are `lib/it-dependency-graph.ts`;
 * this draws them.
 *
 * Drawn as an SVG of curves under absolutely placed buttons, all at computed
 * coordinates: the nodes and labels are real buttons in the Tab order (the
 * program and its own objects, then the edges, then the objects used), each
 * names what it is and where it goes, and a click or Enter goes to the table
 * row it stands for — `onOpen(rowKey)`, the same row a reader finds by
 * scrolling. The curves are decoration (`aria-hidden`): the table is the text
 * version, and "Go to the table" stands first.
 *
 * Colour: the level of an object is its `CcCleanCoreLevel` identifier, letter
 * printed, and the node's border in the same state's strong border — §1.8's
 * mapping, never a new colour. On a phone the picture keeps its size and
 * scrolls sideways inside its own track.
 */
export default function ItDependencyGraph({
  objects,
  onOpen,
}: {
  objects: ItObjects;
  /** Go to a table row; `null` goes to the table itself. */
  onOpen: (rowKey: string | null) => void;
}) {
  const graph = useMemo(() => dependencyGraph(objects), [objects]);
  const layout = useMemo(() => layoutDependencyGraph(graph), [graph]);
  /** The node or edge under the pointer or the focus — its edges are drawn in ink. */
  const [active, setActive] = useState<string | null>(null);

  if (graph.empty || graph.edges.length === 0) return null;

  const lit = (e: DepGraphEdge) => active !== null && (active === e.key || active === e.from || active === e.to);
  const hover = (key: string) => ({
    onMouseEnter: () => setActive(key),
    onMouseLeave: () => setActive(null),
    onFocus: () => setActive(key),
    onBlur: () => setActive(null),
  });
  const sourceName = (key: string) => {
    const s = graph.sources.find((x) => x.key === key);
    return s?.name ?? wt('itv.graphProgram');
  };
  const objectName = (key: string) => graph.objects.find((o) => o.key === key)?.name ?? '';
  const capped = graph.hidden.objects > 0 || graph.hidden.rows > 0;

  return (
    <figure
      id="it-dependency-graph"
      data-it-graph=""
      data-it-graph-capped={capped ? 'yes' : 'no'}
      aria-labelledby="it-graph-title"
      aria-describedby="it-graph-lead"
      className="m-0 mt-3 border-y border-cc-line py-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 id="it-graph-title" className="m-0 text-[13px] font-bold text-cc-ink">
          {wt('itv.graphTitle')}
        </h4>
        <span data-it-graph-shown="" className="text-[12px] font-medium text-cc-ink-muted">
          {itvGraphShown(graph.objects.length, graph.total.objects, graph.total.rows - graph.hidden.rows, graph.total.rows)}
        </span>
        <button
          type="button"
          data-it-graph-to-table=""
          onClick={() => onOpen(null)}
          className="inline-flex min-h-6 items-center text-[12px] font-semibold text-cc-ink underline underline-offset-2 pointer-coarse:min-h-11"
        >
          {wt('itv.graphToTable')}
        </button>
      </div>
      <p id="it-graph-lead" className="m-0 mt-1 max-w-4xl text-[12px] leading-snug font-medium text-cc-ink-muted">
        {wt('itv.graphLead')}
      </p>
      <p className="m-0 mt-1 text-[11px] font-medium text-cc-ink-muted sm:hidden">{wt('itv.graphScroll')}</p>

      <div data-it-graph-track="" className="mt-3 max-w-full overflow-x-auto">
        <div
          role="group"
          aria-label={wt('itv.graphLabel')}
          className="relative"
          style={{ width: layout.width, height: layout.height }}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            className="absolute top-0 left-0"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
          >
            {layout.guide ? <path d={layout.guide} fill="none" strokeWidth={1} className="stroke-cc-field-border" /> : null}
            {graph.edges.map((e) => {
              const [a, b] = layout.paths.get(e.key)!;
              const cls = lit(e) ? 'stroke-cc-ink' : active !== null ? 'stroke-cc-line' : 'stroke-cc-field-border';
              return (
                <g key={e.key} data-it-graph-path={e.key}>
                  <path d={a} fill="none" strokeWidth={lit(e) ? 2 : 1} className={cls} />
                  <path d={b} fill="none" strokeWidth={lit(e) ? 2 : 1} className={cls} />
                </g>
              );
            })}
          </svg>

          {graph.sources.map((s) => {
            const box = layout.sources.get(s.key)!;
            const range = s.range ? itvRange(s.range.start, s.range.end) : null;
            const name = s.name ?? wt('itv.graphProgram');
            const kind = s.role === 'program' && !s.name ? wt('itv.graphProgramKind') : (s.kind ?? '');
            return (
              <button
                key={s.key}
                type="button"
                data-it-graph-node="source"
                data-it-graph-source={s.name ?? 'program'}
                data-it-graph-row={s.rowKey ?? ''}
                aria-label={itvGraphSourceName(name, kind, range, s.rowKey !== null)}
                onClick={() => onOpen(s.rowKey)}
                {...hover(s.key)}
                className="absolute block text-left"
                style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
              >
                <span
                  className={cn(
                    'block h-full overflow-hidden rounded-cc-row border bg-cc-surface px-2 py-1',
                    active === s.key ? 'border-cc-ink' : 'border-cc-field-border',
                  )}
                >
                  <span className="block truncate font-cc-mono text-[12px] font-semibold text-cc-ink">{name}</span>
                  <span className="block truncate text-[11px] font-medium text-cc-ink-muted">
                    {range ? `${kind} · ${range}` : kind}
                  </span>
                </span>
              </button>
            );
          })}

          {graph.edges.map((e) => {
            const box = layout.labels.get(e.key)!;
            const word = objectUseWord(e.use, e.batchInput);
            return (
              <button
                key={e.key}
                type="button"
                data-it-graph-edge={e.key}
                data-it-graph-use={e.use}
                data-it-graph-row={e.rowKey}
                aria-label={itvGraphEdgeName(sourceName(e.from), objectName(e.to), word, e.lines, e.level)}
                onClick={() => onOpen(e.rowKey)}
                {...hover(e.key)}
                className="absolute block text-left"
                style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
              >
                <span
                  className={cn(
                    'flex h-full items-center rounded-cc-row border bg-cc-surface px-2',
                    lit(e) ? 'border-cc-ink' : 'border-cc-line',
                  )}
                >
                  <span className="block truncate text-[11px] font-semibold text-cc-ink">
                    {itvGraphEdgeLabel(word, e.lines)}
                  </span>
                </span>
              </button>
            );
          })}

          {graph.objects.map((o) => {
            const box = layout.objects.get(o.key)!;
            const state = o.level ? STATE_CLASSES[cleanCoreLevel(o.level).state] : null;
            const kind = `${objectKindWord(o.kind)}${o.remote ? ` · ${wt('itv.remote')}` : ''}`;
            return (
              <button
                key={o.key}
                type="button"
                data-it-graph-node="object"
                data-it-graph-object={o.name}
                data-it-graph-level={o.level ?? 'none'}
                data-it-graph-row={o.rowKeys[0]}
                aria-label={itvGraphObjectName(o.name, kind, o.level, o.rowKeys.length)}
                onClick={() => onOpen(o.rowKeys[0])}
                {...hover(o.key)}
                className="absolute block text-left"
                style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
              >
                <span
                  className={cn(
                    'block h-full overflow-hidden rounded-cc-row border bg-cc-surface px-2 py-1',
                    active === o.key ? 'border-cc-ink' : state ? state.borderStrong : 'border-cc-field-border',
                  )}
                >
                  <span className="block truncate font-cc-mono text-[12px] font-semibold text-cc-ink">{o.name}</span>
                  <span className="mt-1 flex min-w-0 items-center gap-1">
                    {o.level ? (
                      <CcCleanCoreLevel value={o.level} />
                    ) : (
                      <span className="text-[11px] font-medium text-cc-ink-muted">{wt('itv.graphNotAsked')}</span>
                    )}
                    <span className="truncate text-[11px] font-medium text-cc-ink-muted">{kind}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {capped ? <GraphMore graph={graph} onOpen={onOpen} /> : null}
    </figure>
  );
}

/** "and 15 more objects — see the table": the graph is the overview, the table the whole answer. */
function GraphMore({ graph, onOpen }: { graph: DepGraph; onOpen: (rowKey: string | null) => void }) {
  return (
    <p data-it-graph-more="" className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
      <button
        type="button"
        onClick={() => onOpen(null)}
        className="inline-flex min-h-6 items-center font-semibold text-cc-ink underline underline-offset-2 pointer-coarse:min-h-11"
      >
        {itvGraphMore(graph.hidden.objects, graph.hidden.rows)}
      </button>
    </p>
  );
}
