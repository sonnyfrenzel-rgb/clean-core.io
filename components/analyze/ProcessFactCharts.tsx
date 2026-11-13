'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { cn } from '@/lib/utils';
import { categoricalChartColor } from '@/lib/chart-colors';
import { caseEndsOf, dataUseOf, type FactChartRow } from '@/lib/process-fact-charts';
import {
  MAP_MODEL_EVENT,
  MAP_SPOTLIGHT_EVENT,
  currentMapSpotlight,
  currentProcessMapModel,
  requestMapSpotlight,
} from '@/lib/process-map-spotlight';
import type { ProcessMapModel } from '@/lib/process-map';
import { signedSourceOf } from '@/lib/signed-source';
import { engineVersionOfProject } from '@/lib/run-engine-version';
import { BUSINESS_MAP_ID } from '@/lib/business-layers';
import { factChartsMoreLines, wt } from '@/lib/workspace-messages';
import type { Project } from '@/lib/types';

/**
 * The two charts under the map in Analyze, Business — plan `docs/design/analyze-business-first-plan.md` §4.2, AB-7;
 * mockup `docs/roadmap/analyze-business-first-mockup.html`, states 8 and 9; `DESIGN.md` §1.8.
 *
 * *How a case can end* and *What it changes, what it only reads*: each a sentence, its lines and *Reconstructed*,
 * and every row a button that lights on the map the elements it counts ("Showing: … · Clear" on the map). The facts
 * are the engine's (`lib/process-fact-charts.ts`), counted on the very map the page draws — its model is announced
 * by the map (`lib/process-map-spotlight.ts`) — and from the signed source. Nothing here is signed or stored.
 *
 * Colour carries nothing alone (§1.8, "all other charts"): one categorical colour for every bar, each bar with its
 * label and its count as text; *changes* and *only reads* are told apart by their words and by solid against dashed.
 */
export default function ProcessFactCharts({
  project,
  projectId,
  onOpenLines,
}: {
  project: Project | null;
  projectId: string;
  /** A line anchor pressed: the page opens those lines beside the map. Without it the lines are text. */
  onOpenLines?: (lineStart: number, lineEnd: number) => void;
}) {
  const [model, setModel] = useState<ProcessMapModel | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  useEffect(() => {
    const hearModel = () => setModel(currentProcessMapModel(projectId));
    const hearSpotlight = () => setPressed(currentMapSpotlight(projectId)?.key ?? null);
    hearModel();
    hearSpotlight();
    window.addEventListener(MAP_MODEL_EVENT, hearModel);
    window.addEventListener(MAP_SPOTLIGHT_EVENT, hearSpotlight);
    return () => {
      window.removeEventListener(MAP_MODEL_EVENT, hearModel);
      window.removeEventListener(MAP_SPOTLIGHT_EVENT, hearSpotlight);
    };
  }, [projectId]);

  const signed = useMemo(() => signedSourceOf(project), [project]);
  const engineVersion = engineVersionOfProject(project);
  const ends = useMemo(() => {
    if (!model) return null;
    try {
      return caseEndsOf(model);
    } catch {
      return null;
    }
  }, [model]);
  const data = useMemo(() => {
    if (!model || !signed?.source) return null;
    try {
      return dataUseOf(signed.source, model, engineVersion);
    } catch {
      return null;
    }
  }, [model, signed, engineVersion]);

  const toggle = useCallback(
    (row: FactChartRow) => {
      if (pressed === row.key) {
        requestMapSpotlight(projectId, null);
        return;
      }
      requestMapSpotlight(projectId, { key: row.key, label: row.label, ids: row.elementIds });
      // The light is on the map: bring the map into view when it is not.
      const map = document.getElementById(BUSINESS_MAP_ID);
      if (!map) return;
      const box = map.getBoundingClientRect();
      if (box.bottom < 160 || box.top > window.innerHeight - 160) {
        const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        map.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
      }
    },
    [pressed, projectId],
  );

  if (!ends && !data) return null;
  const barColor = categoricalChartColor(1);
  const maxEnds = Math.max(1, ...(ends?.rows ?? []).map((r) => r.count));

  return (
    <section
      data-fact-charts=""
      data-layout-item=""
      aria-label={wt('factCharts.regionLabel')}
      className="grid grid-cols-1 gap-3 lg:grid-cols-2"
    >
      {ends ? (
        <ChartCard
          id="fact-chart-ends"
          kind="ends"
          title={wt('factCharts.endsTitle')}
          sentence={ends.sentence}
          foot={wt('factCharts.endsFoot')}
          lines={ends.lines}
          onOpenLines={onOpenLines}
        >
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {ends.rows.map((row) => (
              <li key={row.key}>
                <RowButton row={row} pressed={pressed === row.key} onToggle={toggle}>
                  <span className="h-3 min-w-[60px]" aria-hidden={true}>
                    <span
                      data-fact-bar=""
                      className={cn('block h-full rounded-r-[4px]', barColor.bg)}
                      style={{ width: `${Math.max(4, Math.round((row.count / maxEnds) * 100))}%` }}
                    />
                  </span>
                  <span data-fact-count="" className="text-right font-bold tabular-nums">
                    {row.count}
                  </span>
                </RowButton>
              </li>
            ))}
          </ul>
        </ChartCard>
      ) : null}

      {data ? (
        <ChartCard
          id="fact-chart-data"
          kind="data"
          title={wt('factCharts.dataTitle')}
          sentence={data.sentence}
          foot={wt('factCharts.dataFoot')}
          lines={data.lines}
          onOpenLines={onOpenLines}
        >
          {/* One bar, two parts: changed (solid) and only read (dashed), each with its word and count beside it. */}
          <div className="flex h-3.5 gap-0.5" aria-hidden={true}>
            {data.changes.length > 0 ? (
              <span className={cn('block h-full rounded-l-[4px]', barColor.bg, data.reads.length === 0 && 'rounded-r-[4px]')} style={{ flex: data.changes.length }} />
            ) : null}
            {data.reads.length > 0 ? (
              <span
                className={cn('block h-full rounded-r-[4px] border-[1.5px] border-dashed border-cc-chart-2 bg-cc-surface', data.changes.length === 0 && 'rounded-l-[4px]')}
                style={{ flex: data.reads.length }}
              />
            ) : null}
          </div>
          <p className="m-0 flex flex-wrap gap-3 text-[12px] font-medium text-cc-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className={cn('inline-block h-2.5 w-2.5 rounded-[2px]', barColor.bg)} aria-hidden={true} />
              {`${wt('factCharts.changes')} ${data.changes.length}`}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-[2px] border-[1.5px] border-dashed border-cc-chart-2 bg-cc-surface" aria-hidden={true} />
              {`${wt('factCharts.onlyReads')} ${data.reads.length}`}
            </span>
          </p>
          {data.changes.length > 0 ? (
            <RowGroup title={wt('factCharts.changes')} rows={data.changes} pressed={pressed} onToggle={toggle} />
          ) : null}
          {data.reads.length > 0 ? (
            <RowGroup title={wt('factCharts.onlyReads')} rows={data.reads} pressed={pressed} onToggle={toggle} />
          ) : null}
        </ChartCard>
      ) : null}
    </section>
  );
}

/** The line anchors a chart's foot shows; the rest are named by count (a row lights its own on the map). */
const FOOT_LINES = 12;

function ChartCard({
  id,
  kind,
  title,
  sentence,
  foot,
  lines,
  onOpenLines,
  children,
}: {
  id: string;
  kind: 'ends' | 'data';
  title: string;
  sentence: string;
  foot: string;
  lines: number[];
  onOpenLines?: (lineStart: number, lineEnd: number) => void;
  children: React.ReactNode;
}) {
  return (
    <section
      data-fact-chart={kind}
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3.5 shadow-cc"
    >
      <h3 id={id} className="m-0 text-[14px] leading-snug font-bold text-cc-ink">
        {title}
      </h3>
      <p data-fact-chart-sentence="" className="m-0 text-[13px] leading-snug font-semibold text-cc-ink">
        {sentence}
      </p>
      {children}
      <div data-fact-chart-foot="" className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-[12px] font-medium text-cc-ink-muted">
        <span>{foot}</span>
        <CcProvenanceChip value="reconstructed" />
        {lines.length > 0 ? (
          <span className="inline-flex flex-wrap items-center gap-1" data-fact-chart-lines="">
            <span>{wt('factCharts.lines')}</span>
            {lines.slice(0, FOOT_LINES).map((line) => (
              <CcAnchor
                key={line}
                onOpen={onOpenLines ? () => onOpenLines(line, line) : undefined}
                label={`${wt('factCharts.sourceLine')} ${line}`}
              >{`L${line}`}</CcAnchor>
            ))}
            {lines.length > FOOT_LINES ? <span>{factChartsMoreLines(lines.length - FOOT_LINES)}</span> : null}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function RowGroup({
  title,
  rows,
  pressed,
  onToggle,
}: {
  title: string;
  rows: FactChartRow[];
  pressed: string | null;
  onToggle: (row: FactChartRow) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <h4 className="m-0 text-[12px] font-bold text-cc-ink-muted">{title}</h4>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {rows.map((row) => (
          <li key={row.key}>
            <RowButton row={row} pressed={pressed === row.key} onToggle={onToggle} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One row: its label, its smaller line, and — for the ends — its bar and count. Pressing it lights its elements on
 * the map; pressing it again clears them. A row whose elements the map does not draw says so and is not a button
 * that would light nothing.
 */
function RowButton({
  row,
  pressed,
  onToggle,
  children,
}: {
  row: FactChartRow;
  pressed: boolean;
  onToggle: (row: FactChartRow) => void;
  children?: React.ReactNode;
}) {
  const drawn = row.elementIds.length > 0;
  const bars = React.Children.count(children) > 0;
  return (
    <button
      type="button"
      data-fact-row={row.key}
      aria-pressed={drawn ? pressed : undefined}
      disabled={!drawn}
      onClick={() => onToggle(row)}
      title={drawn ? `${row.label}: ${wt('factCharts.showOnMap')}` : undefined}
      className={cn(
        'grid w-full items-center gap-2 rounded-cc-row border border-transparent px-1.5 py-1 text-left text-[13px] font-medium text-cc-ink',
        bars ? 'grid-cols-[minmax(0,1.25fr)_minmax(60px,1fr)_28px]' : 'grid-cols-[minmax(0,1fr)]',
        drawn
          ? 'cursor-pointer hover:bg-cc-information-bg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus'
          : 'cursor-default',
        pressed && 'border-cc-information-border bg-cc-information-bg',
      )}
    >
      <span className="min-w-0 leading-snug break-words">
        {row.label}
        {row.detail || !drawn ? (
          <small className="block text-[12px] font-medium text-cc-ink-muted">
            {[row.detail, drawn ? null : wt('factCharts.notOnMap')].filter(Boolean).join(' · ')}
          </small>
        ) : null}
      </span>
      {children}
    </button>
  );
}
