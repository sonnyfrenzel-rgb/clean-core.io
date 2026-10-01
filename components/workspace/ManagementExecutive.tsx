'use client';

import React from 'react';
import CcLinkButton from '@/components/cc/LinkButton';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { cn } from '@/lib/utils';
import {
  execBucketsChartLabel,
  execMoreBlockersLabel,
  wt,
} from '@/lib/workspace-messages';
import { chartLabel, type ChartSegment, type SegmentTone } from '@/lib/management-overview';
import type { ExecutiveFigure, ExecutiveSummary, ExecutiveTarget } from '@/lib/management-executive';
import { PHASE_TONE_CLASS } from '@/lib/workflow-steps';

/**
 * The decision panel on top of the Management view — what a manager reads in
 * ten seconds (`DESIGN.md` §2.11, ADR-029, roadmap 3.0.10 (a)).
 *
 * The question, where the decision stands, what stands in its way, the one step
 * that clears the first obstacle; under it four figures, where the objects
 * stand and the evidence per phase. Everything here is handed in by
 * `lib/management-executive.ts`; this component lays it out and adds the words
 * of its own frame from the catalogue. It fetches nothing, so the demo
 * workspace renders the same panel from its own data.
 *
 * **Charts are also text.** The bucket bar is `role="img"` with every number in
 * its `aria-label`, and the list beside it carries them again; the phase strip
 * is an ordered list whose items say their state in words. Colours per §1.8:
 * the buckets take the categorical palette and *not assigned* the dashed,
 * unfilled box; the phases take the one phase rule of `lib/workflow-steps.ts`,
 * where green belongs to a checked record alone.
 */

/* ------------------------------------------------------- chart parts */

export const TONE_CLASS: Record<SegmentTone, string> = {
  'chart-1': 'bg-cc-chart-1',
  'chart-2': 'bg-cc-chart-2',
  'chart-3': 'bg-cc-chart-3',
  'chart-4': 'bg-cc-chart-4',
  // §1.8: A information, B neutral, C warning, D error — the solid marks of
  // `components/cc/state.ts`, never green: a level is imported, not proven.
  'level-A': 'bg-cc-information',
  'level-B': 'bg-cc-neutral',
  'level-C': 'bg-cc-warning-mark',
  'level-D': 'bg-cc-error',
  // The one area that is not a category: no fill colour, a dashed outline —
  // a form rather than a hue, so it survives a printer without colour and a
  // contrast theme (`app/globals.css` keeps the dashes under forced-colors).
  // No hatching gradient: §1.4 keeps gradients out of the workspace (D.32).
  'not-determined': 'bg-cc-surface-muted border border-dashed border-cc-field-border',
};

export function Swatch({ tone }: { tone: SegmentTone }) {
  return (
    <span
      aria-hidden="true"
      data-chart-swatch=""
      data-not-determined={tone === 'not-determined' ? '' : undefined}
      className={cn('inline-block h-3 w-3 shrink-0 rounded-[2px] align-middle', TONE_CLASS[tone])}
    />
  );
}

/** One horizontal bar. The numbers are in its label and in the text the caller puts beside it. */
export function StackedBar({
  label,
  segments,
  chart,
  tall = false,
}: {
  label: string;
  segments: readonly ChartSegment[];
  chart: string;
  tall?: boolean;
}) {
  const total = segments.reduce((n, s) => n + s.count, 0);
  if (total === 0) return null;
  return (
    <div
      role="img"
      aria-label={chartLabel(label, segments)}
      data-overview-bar={chart}
      className={cn('flex w-full gap-[2px] overflow-hidden rounded-cc-row', tall ? 'h-6' : 'h-4')}
    >
      {segments
        .filter((s) => s.count > 0)
        .map((s) => (
          <span
            key={s.key}
            data-chart-segment={s.key}
            data-not-determined={s.notDetermined ? '' : undefined}
            style={{ flexGrow: s.count, flexBasis: 0 }}
            className={cn('block h-full min-w-[4px]', TONE_CLASS[s.tone])}
          />
        ))}
    </div>
  );
}

/* ------------------------------------------------------------ pieces */

const LABEL = 'm-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase';

function Figure({ figure, hrefFor }: { figure: ExecutiveFigure; hrefFor: (t: ExecutiveTarget) => string }) {
  return (
    <li
      data-executive-figure={figure.key}
      className="flex min-w-0 flex-col rounded-cc-row border border-cc-line bg-cc-surface p-3"
    >
      {figure.value === null ? (
        <span data-figure-absent="" className="text-[15px] leading-tight font-bold text-cc-ink-muted">
          {figure.absentWord}
        </span>
      ) : (
        <span data-figure-value="" className="cc-text-figure leading-none text-cc-ink">
          {figure.value}
        </span>
      )}
      <span className="mt-1 text-[12px] leading-snug font-medium text-cc-ink">{figure.meaning}</span>
      <span className="mt-2">
        <CcProvenanceChip value={figure.provenance} />
      </span>
      <span data-figure-coverage="" className="mt-2 text-[11px] leading-snug font-medium text-cc-ink-muted">
        {figure.coverage}
      </span>
      {figure.action ? (
        <a
          href={hrefFor(figure.action.target)}
          data-executive-figure-action=""
          className="mt-2 text-[12px] font-semibold text-cc-ink underline underline-offset-2"
        >
          {figure.action.label}
        </a>
      ) : null}
    </li>
  );
}

/* --------------------------------------------------------- component */

export default function ManagementExecutive({
  summary,
  hrefFor,
  headingId,
}: {
  summary: ExecutiveSummary;
  /** Turns a target into a link on this surface — a stage of the project, or of the demo. */
  hrefFor: (target: ExecutiveTarget) => string;
  /** The id of the answer heading, which the section and the steering one-pager point at. */
  headingId?: string;
}) {
  const s = summary;
  const proven = s.phases.filter((p) => p.tone === 'proven').length;

  return (
    <div data-management-executive="" className="flex flex-col gap-4">
      {/* The decision: question, state, what is in the way, the next step. */}
      <div
        data-executive-decision=""
        className="cc-card rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc"
      >
        <p data-executive-question="" className="m-0 text-[13px] leading-snug font-semibold text-cc-ink-muted">
          <span className={cn(LABEL, 'mr-2')}>{wt('exec.questionLabel')}</span>
          {s.question}
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <h2
            id={headingId}
            data-management-headline=""
            className="m-0 min-w-0 flex-1 cc-text-h2 leading-snug text-cc-ink"
          >
            {s.answer}
          </h2>
          <CcObjectStatus facet={wt('exec.statusFacet')} value={s.status} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div data-executive-blockers="">
            <h3 className={LABEL}>
              {wt('exec.inTheWay')}
              {s.blockerCount !== null ? ` (${s.blockerCount})` : ''}
            </h3>
            {s.blockers.length > 0 ? (
              <ol className="m-0 mt-2 list-none space-y-2 p-0">
                {s.blockers.map((b, i) => (
                  <li key={b.key} data-executive-blocker={b.key} className="flex items-start gap-2">
                    <span className="font-cc-mono text-[12px] font-semibold text-cc-ink-muted">{i + 1}.</span>
                    <span className="min-w-0 flex-1 text-[13px] leading-snug font-semibold text-cc-ink">
                      {b.label} <CcProvenanceChip value={b.provenance} />
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="m-0 mt-2 text-[13px] font-medium text-cc-ink">
                {s.blockerCount === null ? wt('exec.notYetRead') : wt('exec.nothingInTheWay')}
              </p>
            )}
            {s.moreBlockers > 0 ? (
              <p className="m-0 mt-2 text-[12px] font-medium text-cc-ink-muted">{execMoreBlockersLabel(s.moreBlockers)}</p>
            ) : null}
            {s.platformOnly ? (
              <p data-executive-platform-only="" className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
                {s.platformOnly}
              </p>
            ) : null}
          </div>

          <div data-executive-next="" className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
            <h3 className={LABEL}>{wt('exec.nextStep')}</h3>
            {s.next ? (
              <>
                <p className="m-0 mt-2 text-[13px] font-semibold text-cc-ink">{s.next.label}</p>
                <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">{s.next.reason}</p>
                <div className="mt-3">
                  <CcLinkButton href={hrefFor(s.next.target)} variant="secondary" data-executive-next-action="">
                    {s.next.label}
                  </CcLinkButton>
                </div>
              </>
            ) : (
              <p className="m-0 mt-2 text-[13px] font-medium text-cc-ink-muted">{wt('exec.noNextStep')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Four figures, each with what it means and what it counted. */}
      <ul data-executive-figures="" className="m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
        {s.figures.map((f) => (
          <Figure key={f.key} figure={f} hrefFor={hrefFor} />
        ))}
      </ul>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Where the objects stand — one bar, the numbers again as a list. */}
        <section
          data-executive-buckets=""
          className="cc-card min-w-0 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc"
        >
          <h3 className="m-0 text-[14px] leading-tight font-bold text-cc-ink">{wt('exec.bucketsTitle')}</h3>
          {s.buckets ? (
            <>
              <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted">
                {s.buckets.platformLabel} {s.buckets.isTarget ? wt('exec.target') : wt('exec.noTarget')} ·{' '}
                {s.buckets.total} {wt('exec.objects')}
              </p>
              <div className="mt-3">
                <StackedBar
                  label={execBucketsChartLabel(s.buckets.platformLabel)}
                  segments={s.buckets.segments}
                  chart="executive-buckets"
                  tall
                />
              </div>
              <ul aria-label={wt('exec.bucketsListLabel')} className="m-0 mt-3 list-none space-y-1 p-0">
                {s.buckets.segments.map((seg) => (
                  <li
                    key={seg.key}
                    data-executive-bucket={seg.key}
                    data-not-determined={seg.notDetermined ? '' : undefined}
                    className="flex items-center gap-2 text-[13px] font-medium text-cc-ink"
                  >
                    <Swatch tone={seg.tone} />
                    <span className="min-w-0 flex-1">{seg.label}</span>
                    <span className="font-semibold tabular-nums">{seg.count}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
              {s.bucketsAbsent ?? wt('exec.notYetRead')}
            </p>
          )}
        </section>

        {/* Evidence per phase — the one phase rule, words beside the colour. */}
        <section
          data-executive-phases=""
          className="cc-card min-w-0 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc"
        >
          <h3 className="m-0 text-[14px] leading-tight font-bold text-cc-ink">
            {wt('exec.phasesTitle')}{' '}
            <span className="text-[12px] font-medium text-cc-ink-muted">
              ({proven}/{s.phases.length})
            </span>
          </h3>
          <ol className="m-0 mt-3 list-none space-y-2 p-0">
            {s.phases.map((p) => {
              const tone = PHASE_TONE_CLASS[p.tone];
              return (
                <li key={p.key} data-executive-phase={p.key} data-phase-tone={p.tone} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'block h-3 w-8 shrink-0 rounded-[2px] border',
                      tone.border,
                      p.tone === 'none' ? 'border-dashed bg-cc-surface' : tone.fill,
                    )}
                  />
                  <span className="min-w-0 flex-1 text-[13px] font-semibold text-cc-ink">{p.label}</span>
                  <span className={cn('text-[12px] font-semibold', tone.ink)}>{p.word}</span>
                </li>
              );
            })}
          </ol>
          <p className="m-0 mt-3 text-[11px] leading-snug font-medium text-cc-ink-muted">{wt('exec.phasesNote')}</p>
        </section>
      </div>
    </div>
  );
}
