'use client';

import React, { useEffect, useMemo, useState } from 'react';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import { getAuth } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { gradeKey, type ObjectUse } from '@/lib/abap/abcd-classification';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import { publicCloudFitLookupObjects, resolvePublicCloudFit, type PublicCloudFitFinding } from '@/lib/abap/public-cloud-fit-resolver';
import { useAbcdCatalogLookup } from '@/hooks/useAbcdCatalogLookup';
import type { ItFindingsSource } from '@/lib/it-findings';
import type { ManagementView } from '@/lib/management-answers';
import {
  chartLabel,
  managementOverview,
  type ChartSegment,
  type DecisionRead,
  type FitByPlatform,
  type Loaded,
  type OverviewCardState,
  type SegmentTone,
  type TrendChartPoint,
} from '@/lib/management-overview';
import type { DecisionStatus } from '@/lib/project-decision';
import type { ObjectStatusValue } from '@/lib/object-status';
import type { Project } from '@/lib/types';

/**
 * The Management overview — roadmap 3.0.10.
 *
 * One answer sentence, and under it five cards, each opening with its own
 * answer as its title (ADR-029). Every sentence and every number comes out of
 * `lib/management-overview.ts`, which reads only models that already exist;
 * this component adds layout, and the three reads that feed the model:
 *
 *   - `GET /api/projects/{id}/findings` — the same rows the IT view reads. They
 *     carry `objectName` and `kind`, which is everything the Public-Cloud-Fit
 *     resolver reads, so the level chart (d) and the bucket charts (b) stand on
 *     one read of one engine and cannot disagree about which objects exist.
 *   - `/api/abcd-classify` through `useAbcdCatalogLookup` — the grades and the
 *     no-path facts for those objects, the lookup `PublicCloudFitPanel` makes.
 *   - `GET /api/projects/{id}/decision` — the draft or confirmed decision (f).
 *
 * **Charts are also text.** Every bar is `role="img"` with an `aria-label`
 * carrying all of its numbers, and a table under it carries them again; the
 * trend line is an SVG with the same label and a table of its runs. *Not
 * determined* is a hatched, dashed segment and a row of every table, even at
 * zero. Colours per `DESIGN.md` §1.8: the level chart counts states and takes
 * the state colours with the letter in its label; the bucket chart and the
 * trend take the categorical and sequential palettes and never a state colour.
 *
 * **Nothing is written.** The three reads are GETs; the view is a view.
 */

/* ------------------------------------------------------------ tones */

const TONE_CLASS: Record<SegmentTone, string> = {
  'chart-1': 'bg-cc-chart-1',
  'chart-2': 'bg-cc-chart-2',
  'chart-3': 'bg-cc-chart-3',
  'chart-4': 'bg-cc-chart-4',
  // §1.8: A information, B neutral, C warning, D error — the solid marks of
  // `components/cc/state.ts`, never green: a level is imported, not proven.
  'level-A': 'bg-cc-information',
  'level-B': 'bg-cc-neutral',
  'level-C': 'bg-cc-warning',
  'level-D': 'bg-cc-error',
  'not-determined': 'bg-cc-surface-muted border border-dashed border-cc-field-border',
};

/** Hatching for the one area that is not a category. A pattern, so it survives a printer without colour. */
const HATCH: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(135deg, var(--cc-field-border) 0 1px, transparent 1px 6px)',
};

function Swatch({ tone }: { tone: SegmentTone }) {
  return (
    <span
      aria-hidden="true"
      data-chart-swatch=""
      data-not-determined={tone === 'not-determined' ? '' : undefined}
      style={tone === 'not-determined' ? HATCH : undefined}
      className={cn('inline-block h-3 w-3 shrink-0 rounded-[2px] align-middle', TONE_CLASS[tone])}
    />
  );
}

/** One horizontal bar. The numbers are in its label and in the table the caller puts under it. */
function StackedBar({ label, segments, chart }: { label: string; segments: readonly ChartSegment[]; chart: string }) {
  const total = segments.reduce((n, s) => n + s.count, 0);
  if (total === 0) return null;
  return (
    <div
      role="img"
      aria-label={chartLabel(label, segments)}
      data-overview-bar={chart}
      className="flex h-4 w-full gap-[2px] overflow-hidden rounded-cc-row"
    >
      {segments
        .filter((s) => s.count > 0)
        .map((s) => (
          <span
            key={s.key}
            data-chart-segment={s.key}
            data-not-determined={s.notDetermined ? '' : undefined}
            style={{ flexGrow: s.count, flexBasis: 0, ...(s.notDetermined ? HATCH : {}) }}
            className={cn('block h-full min-w-[4px]', TONE_CLASS[s.tone])}
          />
        ))}
    </div>
  );
}

const TH = 'px-2 pb-1 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase';
const TD = 'border-t border-cc-line px-2 py-1 text-[12px] font-medium text-cc-ink';

/** The legend and the numbers in one — a real table, so a screen reader reads it as one. */
function SegmentTable({
  caption,
  unit,
  columns,
  rows,
}: {
  caption: string;
  unit: string;
  columns: string[];
  /** `tone` is the swatch that ties a row to its segment; a table with no chart above it has none. */
  rows: Array<{ key: string; label: string; tone?: SegmentTone; notDetermined: boolean; counts: number[] }>;
}) {
  return (
    <table data-overview-table="" className="mt-2 w-full border-collapse text-left">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className={TH}>
            {unit}
          </th>
          {columns.map((c) => (
            <th key={c} scope="col" className={cn(TH, 'text-right')}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} data-overview-row={r.key} data-not-determined={r.notDetermined ? '' : undefined}>
            <th scope="row" className={cn(TD, 'font-semibold')}>
              <span className="inline-flex items-center gap-2">
                {r.tone ? <Swatch tone={r.tone} /> : null}
                {r.label}
              </span>
            </th>
            {r.counts.map((n, i) => (
              <td key={columns[i]} className={cn(TD, 'text-right tabular-nums')}>
                {n}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------ cards */

function Coverage({ text }: { text: string }) {
  return (
    <p data-overview-coverage="" className="m-0 mt-2 text-[11px] leading-snug font-medium text-cc-ink-muted">
      {text}
    </p>
  );
}

function Lead({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p data-overview-lead="" className="m-0 text-[12px] leading-snug font-semibold text-cc-ink">
      {text}
    </p>
  );
}

/** A card that is still reading, or could not read — the title says which, the reason says why. */
function Pending<T>({ id, card }: { id: string; card: OverviewCardState<T> }) {
  if (card.state === 'ready') return null;
  return (
    <div data-overview-card={id} data-overview-state={card.state}>
      <CcCard title={card.title}>
        {card.state === 'loading' ? (
          <p role="status" className="m-0 text-[12px] font-medium text-cc-ink-muted">
            <span className="sr-only">{card.title}</span>
          </p>
        ) : (
          <p data-overview-absent-reason="" className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
            {card.reason}
          </p>
        )}
      </CcCard>
    </div>
  );
}

const FIRST_ROWS = 5;

function useShowAll(): [boolean, () => void] {
  const [all, setAll] = useState(false);
  return [all, () => setAll((v) => !v)];
}

/** Rows past the first five are hidden on screen until asked for, and always printed (§2.11, §7.1). */
const beyondFirst = (i: number, all: boolean) => (!all && i >= FIRST_ROWS ? 'hidden print:block' : null);

const STATUS_OF: Record<DecisionStatus, ObjectStatusValue> = {
  draft: 'draft',
  confirmed: 'confirmed',
  withdrawn: 'open',
  superseded: 'open',
};

/* ------------------------------------------------------------ trend */

const W = 400;
const H = 120;
const PAD_X = 28;
const TOP = 18;
const BOTTOM = 96;

/** The score line over runs of one rule version. Drawn only from two points up. */
function TrendLine({ points, label }: { points: readonly TrendChartPoint[]; label: string }) {
  if (points.length < 2) return null;
  // The score scale is 0–100 and the axis says so: a y-axis cut to the data
  // turns two points apart into a cliff.
  const x = (i: number) => PAD_X + (i * (W - 2 * PAD_X)) / (points.length - 1);
  const y = (s: number) => BOTTOM - (s / 100) * (BOTTOM - TOP);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ');
  return (
    <svg
      role="img"
      aria-label={label}
      data-overview-trend=""
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full max-w-[400px]"
    >
      <line x1={PAD_X} y1={BOTTOM} x2={W - PAD_X} y2={BOTTOM} className="stroke-cc-line" strokeWidth={1} />
      <path d={path} data-chart-line="" className="fill-none stroke-cc-seq-3" strokeWidth={2} />
      {points.map((p, i) => (
        <g key={p.runId}>
          <circle cx={x(i)} cy={y(p.score)} r={4} className="fill-cc-seq-2 stroke-cc-seq-4" strokeWidth={1.5} />
          <text x={x(i)} y={y(p.score) - 8} textAnchor="middle" className="fill-cc-ink text-[12px] font-semibold">
            {p.score}
          </text>
          <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-cc-ink-muted font-cc-mono text-[11px]">
            {p.date ?? p.runId}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* -------------------------------------------------------- component */

export default function ManagementOverview({
  project,
  projectId,
  view,
  detailCount,
  children,
}: {
  project: Project | null;
  projectId: string;
  view: ManagementView;
  /** How many detailed answers `children` holds, for the button that unfolds them. */
  detailCount: number;
  /** The detailed answers of 6.4, folded under the overview (§2.11: nothing lost, nothing first). */
  children?: React.ReactNode;
}) {
  const hasSource = Boolean(project?.legacyCode?.trim());
  const hasRun = Boolean(project?.activeRunId);

  const [findings, setFindings] = useState<Loaded<ItFindingsSource>>({ state: 'loading' });
  const [decision, setDecision] = useState<Loaded<DecisionRead>>({ state: 'loading' });

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    const read = async <T,>(
      path: string,
      set: (v: Loaded<T>) => void,
      accept: (json: unknown) => T | null,
      what: string,
    ) => {
      try {
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) {
          if (!cancelled) set({ state: 'absent', reason: `You are signed out, so ${what} could not be read.` });
          return;
        }
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json().catch(() => null)) as { error?: unknown } | null;
        if (cancelled) return;
        const value = res.ok ? accept(json) : null;
        if (value === null) {
          const said = json && typeof json.error === 'string' ? json.error : `${what} could not be read (${res.status}).`;
          set({ state: 'absent', reason: said });
          return;
        }
        set({ state: 'ready', value });
      } catch {
        if (!cancelled) set({ state: 'absent', reason: `${what} could not be read.` });
      }
    };
    void read<ItFindingsSource>(
      'findings',
      setFindings,
      (j) => (j && Array.isArray((j as ItFindingsSource).rows) ? (j as ItFindingsSource) : null),
      'The findings of this project',
    );
    void read<DecisionRead>(
      'decision',
      setDecision,
      (j) => {
        const d = j as Partial<DecisionRead> | null;
        return d && d.draft ? { draft: d.draft, stored: d.stored ?? null } : null;
      },
      'The decision of this project',
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // The rows carry `objectName` and `kind` — all the resolver reads.
  const fitFindings = useMemo<PublicCloudFitFinding[] | null>(
    () =>
      findings.state === 'ready'
        ? findings.value.rows.map((r) => ({ objectName: r.objectName ?? '', kind: r.kind as EvidenceFinding['kind'] }))
        : null,
    [findings],
  );
  const lookupObjects = useMemo(() => (fitFindings ? publicCloudFitLookupObjects(fitFindings) : []), [fitFindings]);
  const lookup = useAbcdCatalogLookup(lookupObjects);

  const fit = useMemo<Loaded<FitByPlatform>>(() => {
    if (findings.state === 'loading') return { state: 'loading' };
    if (findings.state === 'absent') return { state: 'absent', reason: findings.reason };
    if (!fitFindings || !project) return { state: 'loading' };
    if (lookupObjects.length > 0 && lookup.status === 'loading') return { state: 'loading' };
    if (lookupObjects.length > 0 && lookup.status === 'error') {
      return {
        state: 'absent',
        reason: 'The catalog lookup for these objects failed, so no bucket is concluded rather than one guessed.',
      };
    }
    const deps = {
      gradeObjectUse: (name: string, use: ObjectUse | null) =>
        lookup.grades[gradeKey(name, use)] ?? { grade: 'Unknown' as const, provenance: 'heuristic' as const },
      hasNoPath: (name: string) => lookup.noPath[name] ?? false,
    };
    const base = { findings: fitFindings, usageReport: project.usageReport ?? null, catalogBasis: null };
    return {
      state: 'ready',
      value: {
        target: project.s4Deployment ?? null,
        private: resolvePublicCloudFit({ ...base, targetPlatform: 'private' }, deps),
        public: resolvePublicCloudFit({ ...base, targetPlatform: 'public' }, deps),
      },
    };
  }, [findings, fitFindings, project, lookupObjects.length, lookup.status, lookup.grades, lookup.noPath]);

  const overview = useMemo(
    () => managementOverview({ view, fit, findings, decision }, { hasSource, hasRun }),
    [view, fit, findings, decision, hasSource, hasRun],
  );

  const [allBlockers, toggleBlockers] = useShowAll();
  const [allMoves, toggleMoves] = useShowAll();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { buckets, readiness, levels, blockers, decision: dec } = overview;

  return (
    <div data-management-overview="">
      <h2
        id="management-answers-heading"
        data-management-headline=""
        className="m-0 text-[16px] leading-snug font-bold text-cc-ink"
      >
        {overview.headline}
      </h2>
      <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
        {overview.question} — this one project. No comparison with any other.
      </p>

      <div className="mt-4 space-y-4">
        {/* (f) The decision: which one is open and what it waits for. */}
        {dec.state === 'ready' ? (
          <div data-overview-card="decision" data-overview-state="ready">
            <CcCard title={dec.title} meta={<CcObjectStatus value={STATUS_OF[dec.status]} />}>
              <Lead text={dec.lead} />
              <p className="m-0 mt-2 text-[13px] leading-snug font-medium text-cc-ink">
                <span className="font-cc-mono text-[12px] text-cc-ink-muted">{dec.identity}</span> {dec.summary}
              </p>
              {dec.waitsFor.length > 0 ? (
                <div className="mt-2">
                  <h4 className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
                    Waits for
                  </h4>
                  <ul data-overview-waits="" className="m-0 mt-1 list-disc space-y-0.5 pl-5">
                    {dec.waitsFor.map((w) => (
                      <li key={w} className="text-[12px] font-medium text-cc-ink">
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <SegmentTable
                caption="Conditions of this decision by status"
                unit="Condition status"
                columns={['Conditions']}
                rows={dec.conditions.map((c) => ({
                  key: c.status,
                  label: c.label,
                  notDetermined: c.status === 'not-determined',
                  counts: [c.count],
                }))}
              />
              {dec.qualifiers.length > 0 ? (
                <p className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
                  {dec.qualifiers.length} {dec.qualifiers.length === 1 ? 'point qualifies' : 'points qualify'} it
                  without blocking it — listed on the decision card below.
                </p>
              ) : null}
              <Coverage text={dec.coverage} />
              <p className="m-0 mt-2 text-[12px] font-semibold">
                <a href="#decision-card" className="text-cc-ink underline">
                  Open decision {dec.identity}
                </a>
              </p>
            </CcCard>
          </div>
        ) : (
          <Pending id="decision" card={dec} />
        )}

        {/* (e) What blocks the decision — ordered, with evidence per line. */}
        {blockers.state === 'ready' ? (
          <div data-overview-card="blockers" data-overview-state="ready">
            <CcCard title={blockers.title} count={blockers.rows.length}>
              <Lead text={blockers.lead} />
              {blockers.rows.length > 0 ? (
                <ol data-overview-blockers="" className="m-0 mt-2 list-none space-y-2 p-0">
                  {blockers.rows.map((row, i) => (
                    <li
                      key={row.key}
                      data-overview-blocker={row.key}
                      className={cn(
                        'rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2',
                        beyondFirst(i, allBlockers),
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-cc-mono text-[12px] font-semibold text-cc-ink-muted">{row.rank}.</span>
                        <span className="text-[13px] font-semibold text-cc-ink">{row.label}</span>
                        {row.scope === 'public-edition' ? <CcTag>Public Edition decision</CcTag> : null}
                        <CcProvenanceChip value={row.provenance} />
                      </div>
                      <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">{row.evidence}</p>
                    </li>
                  ))}
                </ol>
              ) : null}
              {blockers.rows.length > FIRST_ROWS ? (
                <div className="cc-no-print mt-2">
                  <CcButton variant="ghost" density="compact" onClick={toggleBlockers} aria-expanded={allBlockers}>
                    {allBlockers ? 'Show the first five' : `Show all ${blockers.rows.length}`}
                  </CcButton>
                </div>
              ) : null}
              {blockers.unread.length > 0 ? (
                <ul data-overview-unread="" className="m-0 mt-2 list-none space-y-1 p-0">
                  {blockers.unread.map((u) => (
                    <li key={u} className="text-[12px] leading-snug font-medium text-cc-ink-muted">
                      Not read: {u}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Coverage text={blockers.coverage} />
            </CcCard>
          </div>
        ) : (
          <Pending id="blockers" card={blockers} />
        )}

        {/* (c) The Clean Core Score over runs of one rule version. */}
        {readiness.state === 'ready' ? (
          <div data-overview-card="readiness" data-overview-state="ready">
            <CcCard title={readiness.title} meta={<CcProvenanceChip value={readiness.provenance} />}>
              <Lead text={readiness.lead} />
              <TrendLine
                points={readiness.points}
                label={`Clean Core Score by run on rule version ${readiness.ruleVersion ?? 'not determined'}: ${readiness.points
                  .map((p) => `${p.score} on ${p.date ?? p.runId}`)
                  .join(', ')}.`}
              />
              <p data-overview-rule-version="" className="m-0 mt-1 font-cc-mono text-[11px] text-cc-ink-muted">
                Rule version: {readiness.ruleVersion ?? 'not determined'}
              </p>
              <p className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink">{readiness.sentence}</p>
              {readiness.points.length > 0 ? (
                <table data-overview-table="" className="mt-2 w-full border-collapse text-left">
                  <caption className="sr-only">Clean Core Score of each run on this rule version</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>
                        Date
                      </th>
                      <th scope="col" className={TH}>
                        Run
                      </th>
                      <th scope="col" className={cn(TH, 'text-right')}>
                        Score (0–100)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {readiness.points.map((p) => (
                      <tr key={p.runId} data-overview-row={p.runId}>
                        <td className={cn(TD, 'font-cc-mono')}>{p.date ?? 'not recorded'}</td>
                        <td className={cn(TD, 'font-cc-mono')}>{p.runId}</td>
                        <td className={cn(TD, 'text-right tabular-nums')}>{p.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <div
                data-overview-not-determined="readiness"
                data-not-determined=""
                className="mt-2 flex items-start gap-2 rounded-cc-row border border-dashed border-cc-field-border px-3 py-2"
              >
                <Swatch tone="not-determined" />
                <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink">
                  <span className="font-semibold">
                    Not determined: {readiness.notDetermined.count}{' '}
                    {readiness.notDetermined.count === 1 ? 'run' : 'runs'}
                  </span>{' '}
                  — {readiness.notDetermined.sentence}
                </p>
              </div>
              {readiness.breaks.length > 0 ? (
                <ul data-overview-breaks="" className="m-0 mt-2 list-none space-y-1 p-0">
                  {readiness.breaks.map((b) => (
                    <li key={b} className="text-[12px] leading-snug font-medium text-cc-ink">
                      Break: {b}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Coverage text={readiness.coverage} />
            </CcCard>
          </div>
        ) : (
          <Pending id="readiness" card={readiness} />
        )}

        {/* (b) The four buckets, per edition, and what moves between them. */}
        {buckets.state === 'ready' ? (
          <div data-overview-card="buckets" data-overview-state="ready">
            <CcCard title={buckets.title}>
              <Lead text={buckets.lead} />
              <div className="mt-2 space-y-2">
                {buckets.charts.map((c) => (
                  <div key={c.platform} data-overview-platform={c.platform}>
                    <p className="m-0 mb-1 text-[12px] font-semibold text-cc-ink">
                      {c.label}
                      {c.isTarget ? ' — the target platform' : ''}
                    </p>
                    <StackedBar label={`Four buckets, ${c.label}`} segments={c.segments} chart={`buckets-${c.platform}`} />
                  </div>
                ))}
              </div>
              {buckets.charts[0] ? (
                <SegmentTable
                  caption="Objects per bucket, per edition"
                  unit="Bucket (objects)"
                  columns={buckets.charts.map((c) => c.label)}
                  rows={buckets.charts[0].segments.map((s) => ({
                    key: s.key,
                    label: s.label,
                    tone: s.tone,
                    notDetermined: s.notDetermined,
                    counts: buckets.charts.map((c) => c.segments.find((x) => x.key === s.key)?.count ?? 0),
                  }))}
                />
              ) : null}
              <p data-overview-moves-sentence="" className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink">
                {buckets.moveSentence}
              </p>
              {buckets.moves.length > 0 ? (
                <table data-overview-moves="" className="mt-1 w-full border-collapse text-left">
                  <caption className="sr-only">Objects whose bucket depends on the edition</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>
                        Object
                      </th>
                      <th scope="col" className={TH}>
                        Private Edition
                      </th>
                      <th scope="col" className={TH}>
                        Public Edition
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {buckets.moves.map((m, i) => (
                      <tr key={m.objectName} className={cn(!allMoves && i >= FIRST_ROWS ? 'hidden print:table-row' : null)}>
                        <td className={cn(TD, 'font-cc-mono')}>{m.objectName}</td>
                        <td className={TD}>{m.privateBucket}</td>
                        <td className={TD}>{m.publicBucket}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {buckets.moves.length > FIRST_ROWS ? (
                <div className="cc-no-print mt-2">
                  <CcButton variant="ghost" density="compact" onClick={toggleMoves} aria-expanded={allMoves}>
                    {allMoves ? 'Show the first five' : `Show all ${buckets.moves.length}`}
                  </CcButton>
                </div>
              ) : null}
              {buckets.notes.map((n) => (
                <p key={n} className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
                  {n}
                </p>
              ))}
              <Coverage text={buckets.coverage} />
            </CcCard>
          </div>
        ) : (
          <Pending id="buckets" card={buckets} />
        )}

        {/* (d) The level distribution A–D, in the state colours of §1.8. */}
        {levels.state === 'ready' ? (
          <div data-overview-card="levels" data-overview-state="ready">
            <CcCard title={levels.title} meta={<CcProvenanceChip value={levels.provenance} />}>
              <Lead text={levels.lead} />
              <div className="mt-2">
                <StackedBar label="Clean core levels across the findings" segments={levels.segments} chart="levels" />
              </div>
              <SegmentTable
                caption="Findings per clean core level"
                unit="Level (findings)"
                columns={['Findings']}
                rows={levels.segments.map((s) => ({
                  key: s.key,
                  label: s.label,
                  tone: s.tone,
                  notDetermined: s.notDetermined,
                  counts: [s.count],
                }))}
              />
              <Coverage text={levels.coverage} />
              <p className="m-0 mt-1 text-[11px] leading-snug font-medium text-cc-ink-muted">{levels.note}</p>
            </CcCard>
          </div>
        ) : (
          <Pending id="levels" card={levels} />
        )}
      </div>

      {children ? (
        <div className="mt-4">
          <CcButton
            variant="ghost"
            density="compact"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            aria-controls="management-answers-detail"
          >
            {detailsOpen ? 'Hide the answers in detail' : `Show the answers in detail (${detailCount})`}
          </CcButton>
          <div id="management-answers-detail" hidden={!detailsOpen} className="mt-4">
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}
