'use client';

import React, { useEffect, useMemo, useState } from 'react';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcTable from '@/components/cc/Table';
import { CcTag } from '@/components/cc/Tag';
import { getAuth } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { showAllLabel, showFirstLabel } from '@/lib/cc-messages';
import {
  mgmtBreakLabel,
  mgmtBucketsChartLabel,
  mgmtNotDeterminedRunsLabel,
  mgmtNotReadLabel,
  mgmtOpenDecisionLabel,
  mgmtQualifiersLabel,
  mgmtReadFailedReason,
  mgmtRuleVersionLabel,
  mgmtShowDetailLabel,
  mgmtSignedOutReason,
  mgmtTrendLabel,
  wt,
} from '@/lib/workspace-messages';
import CcDisclosure from '@/components/cc/Disclosure';
import { useFitByPlatform } from '@/hooks/useFitByPlatform';
import ManagementExecutive, { StackedBar, Swatch } from './ManagementExecutive';
import {
  costsFromDecision,
  executiveSubject,
  managementExecutive,
  type ExecutiveTarget,
} from '@/lib/management-executive';
import { stageHref } from '@/lib/workspace-back-href';
import { workflowSteps } from '@/lib/workflow-steps';
import type { ItFindingsSource } from '@/lib/it-findings';
import type { ManagementView } from '@/lib/management-answers';
import {
  managementOverview,
  type DecisionRead,
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
 * **First the decision panel** (`ManagementExecutive.tsx`, built by
 * `lib/management-executive.ts` from the cards below): the question, where the
 * decision stands, what is in its way, the next step, four figures, where the
 * objects stand and the evidence per phase. The cards themselves fold under it,
 * with their count, one action deeper (§2.11) — nothing they say is removed.
 *
 * Under it five cards, each opening with its own
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

/**
 * The legend and the numbers in one — a real table (`CcTable`, §2.4), so a
 * screen reader reads it as one. The row key and the "not determined" mark sit
 * on the label, which is where the swatch that ties a row to its segment is.
 */
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
    <div data-overview-table="" className="mt-2">
      <CcTable
        caption={caption}
        columns={[
          { key: 'label', label: unit },
          ...columns.map((c) => ({ key: `n:${c}`, label: c, numeric: true })),
        ]}
        rows={rows.map((r) => ({
          key: r.key,
          cells: {
            label: (
              <span
                data-overview-row={r.key}
                data-not-determined={r.notDetermined ? '' : undefined}
                className="inline-flex items-center gap-2 font-semibold"
              >
                {r.tone ? <Swatch tone={r.tone} /> : null}
                {r.label}
              </span>
            ),
            ...Object.fromEntries(columns.map((c, i) => [`n:${c}`, r.counts[i]])),
          },
        }))}
      />
    </div>
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

/** The answer cards under the panel — decision, blockers, score, buckets, levels. */
const OVERVIEW_CARDS = 5;

function useShowAll(): [boolean, () => void] {
  const [all, setAll] = useState(false);
  return [all, () => setAll((v) => !v)];
}

/**
 * Rows past the first five are hidden on screen until asked for, and always
 * printed (§2.11, §7.1). Only the blockers use this: they are an ordered list of
 * cards (rank, label, tag, provenance, evidence line), not rows of columns, so
 * `CcTable` does not carry them. The button speaks the table's words, so the
 * two limits on this page read the same.
 */
const beyondFirst = (i: number, all: boolean) => (!all && i >= FIRST_ROWS ? 'hidden print:block' : null);

/** The objects whose bucket moves with the edition — a `CcTable`, so its limit is the table's (§2.11). */
const MOVE_COLUMNS = [
  { key: 'object', label: wt('mgmt.colObject') },
  { key: 'private', label: wt('mgmt.colPrivate') },
  { key: 'public', label: wt('mgmt.colPublic') },
] as const;

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

/** One GET of a project route, answered as a `Loaded` — never a guessed empty value. */
async function readProjectRoute<T>(
  projectId: string,
  path: string,
  set: (v: Loaded<T>) => void,
  accept: (json: unknown) => T | null,
  what: string,
  isCancelled: () => boolean,
): Promise<void> {
  try {
    const token = await getAuth().currentUser?.getIdToken();
    if (!token) {
      if (!isCancelled()) set({ state: 'absent', reason: mgmtSignedOutReason(what) });
      return;
    }
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json().catch(() => null)) as { error?: unknown } | null;
    if (isCancelled()) return;
    const value = res.ok ? accept(json) : null;
    if (value === null) {
      const said = json && typeof json.error === 'string' ? json.error : mgmtReadFailedReason(what, res.status);
      set({ state: 'absent', reason: said });
      return;
    }
    set({ state: 'ready', value });
  } catch {
    if (!isCancelled()) set({ state: 'absent', reason: mgmtReadFailedReason(what) });
  }
}

export default function ManagementOverview({
  project,
  projectId,
  view,
  decisionRevision = 0,
  detailCount,
  children,
}: {
  project: Project | null;
  projectId: string;
  view: ManagementView;
  /**
   * Counts the decision commands the Decision card completed. The card writes
   * through its own route; without this the overview kept the decision it read
   * on mount until a remount (QA review of 4b4586aff273).
   */
  decisionRevision?: number;
  /** How many detailed answers `children` holds, for the button that unfolds them. */
  detailCount: number;
  /** The detailed answers of 6.4, folded under the overview (§2.11: nothing lost, nothing first). */
  children?: React.ReactNode;
}) {
  const hasSource = Boolean(project?.legacyCode?.trim());
  const hasRun = Boolean(project?.activeRunId);

  const [findings, setFindings] = useState<Loaded<ItFindingsSource>>({ state: 'loading' });
  // Held with the revision it was read for: after a command the previous
  // answer is not shown while the new one is read (carried QA finding
  // 89203dfdb3df) — a withdrawn decision read on as confirmed until it landed.
  const [decisionHeld, setDecisionHeld] = useState<{ rev: number; value: Loaded<DecisionRead> }>({
    rev: -1,
    value: { state: 'loading' },
  });
  const decision: Loaded<DecisionRead> = useMemo(
    () => (decisionHeld.rev === decisionRevision ? decisionHeld.value : { state: 'loading' }),
    [decisionHeld, decisionRevision],
  );

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void readProjectRoute<ItFindingsSource>(
      projectId,
      'findings',
      setFindings,
      (j) => (j && Array.isArray((j as ItFindingsSource).rows) ? (j as ItFindingsSource) : null),
      wt('mgmt.whatFindings'),
      () => cancelled,
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // The decision is read on its own, and again after every command the
  // Decision card completed: a confirmed or withdrawn decision must not stay
  // "open" here while the card below already says otherwise.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void readProjectRoute<DecisionRead>(
      projectId,
      'decision',
      (value) => setDecisionHeld({ rev: decisionRevision, value }),
      (j) => {
        const d = j as Partial<DecisionRead> | null;
        return d && d.draft ? { draft: d.draft, stored: d.stored ?? null } : null;
      },
      wt('mgmt.whatDecision'),
      () => cancelled,
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, decisionRevision]);

  // The four buckets for both editions — one derivation, shared with the demo.
  const fit = useFitByPlatform(findings, project, wt('mgmt.lookupFailed'));

  const overview = useMemo(
    () => managementOverview({ view, fit, findings, decision }, { hasSource, hasRun }),
    [view, fit, findings, decision, hasSource, hasRun],
  );

  const executive = useMemo(
    () =>
      managementExecutive({
        subject: executiveSubject(project?.legacyCode, project?.name?.trim() || wt('exec.thisProgram')),
        mode: 'project',
        hasSource,
        hasRun,
        steps: workflowSteps(project),
        overview,
        fit,
        costs: costsFromDecision(decision),
      }),
    [project, hasSource, hasRun, overview, fit, decision],
  );
  const hrefFor = (target: ExecutiveTarget): string =>
    target.kind === 'stage'
      ? stageHref({ base: `/project/${projectId}`, path: target.path, view: 'management' })
      : target.kind === 'anchor'
        ? `#${target.id}`
        : '/admin/new-project';

  const [allBlockers, toggleBlockers] = useShowAll();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);

  const { buckets, readiness, levels, blockers, decision: dec } = overview;

  return (
    <div data-management-overview="">
      <ManagementExecutive summary={executive} hrefFor={hrefFor} headingId="management-answers-heading" />

      {/* The five answer cards stand one action deeper (§2.11): every figure
          above comes out of them, and every number they hold stays here. */}
      <div className="mt-4">
        <CcDisclosure
          title={wt('exec.evidenceBehind')}
          count={OVERVIEW_CARDS}
          level={3}
          open={cardsOpen}
          onOpenChange={setCardsOpen}
        >
      <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
        {overview.question} {wt('mgmt.questionSuffix')}
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
                    {wt('mgmt.waitsFor')}
                  </h4>
                  <ul data-overview-waits="" className="m-0 mt-1 list-disc space-y-1 pl-5">
                    {dec.waitsFor.map((w) => (
                      <li key={w} className="text-[12px] font-medium text-cc-ink">
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <SegmentTable
                caption={wt('mgmt.conditionsCaption')}
                unit={wt('mgmt.conditionsUnit')}
                columns={[wt('mgmt.conditionsColumn')]}
                rows={dec.conditions.map((c) => ({
                  key: c.status,
                  label: c.label,
                  notDetermined: c.status === 'not-determined',
                  counts: [c.count],
                }))}
              />
              {dec.qualifiers.length > 0 ? (
                <p className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
                  {mgmtQualifiersLabel(dec.qualifiers.length)}
                </p>
              ) : null}
              <Coverage text={dec.coverage} />
              <p className="m-0 mt-2 text-[12px] font-semibold">
                <a href="#decision-card" className="text-cc-ink underline">
                  {mgmtOpenDecisionLabel(dec.identity)}
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
                        {row.scope === 'public-edition' ? <CcTag>{wt('mgmt.publicEditionDecision')}</CcTag> : null}
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
                    {allBlockers ? showFirstLabel(FIRST_ROWS) : showAllLabel(blockers.rows.length)}
                  </CcButton>
                </div>
              ) : null}
              {blockers.unread.length > 0 ? (
                <ul data-overview-unread="" className="m-0 mt-2 list-none space-y-1 p-0">
                  {blockers.unread.map((u) => (
                    <li key={u} className="text-[12px] leading-snug font-medium text-cc-ink-muted">
                      {mgmtNotReadLabel(u)}
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
                label={mgmtTrendLabel(readiness.ruleVersion, readiness.points)}
              />
              <p data-overview-rule-version="" className="m-0 mt-1 font-cc-mono text-[11px] text-cc-ink-muted">
                {mgmtRuleVersionLabel(readiness.ruleVersion)}
              </p>
              <p className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink">{readiness.sentence}</p>
              {readiness.points.length > 0 ? (
                <div data-overview-table="" className="mt-2">
                  <CcTable
                    caption={wt('mgmt.trendCaption')}
                    columns={[
                      { key: 'date', label: wt('mgmt.colDate') },
                      { key: 'run', label: wt('mgmt.colRun') },
                      { key: 'score', label: wt('mgmt.colScore'), numeric: true },
                    ]}
                    rows={readiness.points.map((p) => ({
                      key: p.runId,
                      cells: {
                        date: (
                          <span data-overview-row={p.runId} className="font-cc-mono">
                            {p.date ?? wt('mgmt.notRecorded')}
                          </span>
                        ),
                        run: <span className="font-cc-mono">{p.runId}</span>,
                        score: p.score,
                      },
                    }))}
                  />
                </div>
              ) : null}
              <div
                data-overview-not-determined="readiness"
                data-not-determined=""
                className="mt-2 flex items-start gap-2 rounded-cc-row border border-dashed border-cc-field-border px-3 py-2"
              >
                <Swatch tone="not-determined" />
                <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink">
                  <span className="font-semibold">
                    {mgmtNotDeterminedRunsLabel(readiness.notDetermined.count)}
                  </span>{' '}
                  — {readiness.notDetermined.sentence}
                </p>
              </div>
              {readiness.breaks.length > 0 ? (
                <ul data-overview-breaks="" className="m-0 mt-2 list-none space-y-1 p-0">
                  {readiness.breaks.map((b) => (
                    <li key={b} className="text-[12px] leading-snug font-medium text-cc-ink">
                      {mgmtBreakLabel(b)}
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
                      {c.isTarget ? ` ${wt('mgmt.targetPlatform')}` : ''}
                    </p>
                    <StackedBar label={mgmtBucketsChartLabel(c.label)} segments={c.segments} chart={`buckets-${c.platform}`} />
                  </div>
                ))}
              </div>
              {buckets.charts[0] ? (
                <SegmentTable
                  caption={wt('mgmt.bucketsCaption')}
                  unit={wt('mgmt.bucketsUnit')}
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
                <div data-overview-moves="" className="mt-1">
                  <CcTable
                    caption={wt('mgmt.movesCaption')}
                    columns={MOVE_COLUMNS}
                    limit={FIRST_ROWS}
                    rows={buckets.moves.map((m) => ({
                      key: m.objectName,
                      cells: {
                        object: <span className="font-cc-mono">{m.objectName}</span>,
                        private: m.privateBucket,
                        public: m.publicBucket,
                      },
                    }))}
                  />
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
                <StackedBar label={wt('mgmt.levelsChart')} segments={levels.segments} chart="levels" />
              </div>
              <SegmentTable
                caption={wt('mgmt.levelsCaption')}
                unit={wt('mgmt.levelsUnit')}
                columns={[wt('mgmt.levelsColumn')]}
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
        </CcDisclosure>
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
            {detailsOpen ? wt('mgmt.hideDetail') : mgmtShowDetailLabel(detailCount)}
          </CcButton>
          <div id="management-answers-detail" hidden={!detailsOpen} className="mt-4">
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}
