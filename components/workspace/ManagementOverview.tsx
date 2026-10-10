'use client';

import React, { useEffect, useMemo, useState } from 'react';
import CcCard from '@/components/cc/Card';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcTable from '@/components/cc/Table';
import { getAuth } from '@/lib/firebase';
import {
  mgmtBreakLabel,
  mgmtNotDeterminedRunsLabel,
  mgmtReadFailedReason,
  mgmtRuleVersionLabel,
  mgmtSignedOutReason,
  mgmtTrendLabel,
  wt,
} from '@/lib/workspace-messages';
import { useFitByPlatform } from '@/hooks/useFitByPlatform';
import ManagementExecutive, { Swatch, type ExecutivePrimary, type FitOtherBlocker } from './ManagementExecutive';
import { MANAGEMENT_IDS } from '@/lib/management-sections';
import { openSteeringOnePager } from '@/lib/steering-open';
import ManagementFold from './ManagementFold';
import { otherEditionLine, standardFit, standardFitOnOtherEdition } from '@/lib/standard-fit';
import DecisionOptions from './DecisionOptions';
import { decisionOptionsView, type OptionPlace } from '@/lib/decision-option-signals';
import {
  costsFromDecision,
  storedCostsOf,
  executiveSubject,
  managementExecutive,
  type ExecutiveTarget,
} from '@/lib/management-executive';
import { stageHref, WORKSPACE_RETURN } from '@/lib/workspace-back-href';
import type { NextOpenPoint } from '@/lib/next-step';
import { workflowSteps } from '@/lib/workflow-steps';
import type { ItFindingsSource } from '@/lib/it-findings';
import type { ManagementView } from '@/lib/management-answers';
import {
  managementOverview,
  type DecisionRead,
  type Loaded,
  type OverviewCardState,
  type ReadinessCard,
  type TrendChartPoint,
} from '@/lib/management-overview';
import type { Project } from '@/lib/types';
import { IT_TARGET_PROFILE_ID } from '@/components/workspace/ItRail';

/**
 * The Management overview — roadmap 3.0.10, made lean by ADR-087 (owner
 * decision 10.10.2026).
 *
 * **The first screen:** the decision panel (`ManagementExecutive.tsx`, built by
 * `lib/management-executive.ts`): the question, the answer naming the option,
 * the next step, the four options and the decision record with what it rests
 * on; under it the distance to SAP standard — whose "What stands in the way"
 * now also carries the ranked blockers that are not SAP objects — and beside
 * it the **readiness trend** (mockup s5). Then **one** fold, "Evidence": every
 * object per bucket and the open questions, nothing else. The detailed answers
 * of 6.4, the decision and bucket cards, the four figures, the second bucket
 * bar and the evidence per phase are not rendered any more: each said again
 * what the panel, the header or the trend already says (§2.11 "nothing
 * twice"). Their models stay — the steering one-pager and the specs read them.
 *
 * Every sentence and every number comes out of
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
 * **Charts are also text.** The trend line is an SVG with an `aria-label`
 * carrying all of its numbers and a table of its runs; *not determined* is a
 * dashed area of the card, even at zero. Colours per `DESIGN.md` §1.8: the
 * trend takes the sequential palette and never a state colour.
 *
 * **Nothing is written.** The three reads are GETs; the view is a view.
 */

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
  historyPending = false,
  nextStep,
  coach,
  evidenceExtra,
  decision: decisionCard,
  onDecisionChanged,
  beforeWrite,
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
  /**
   * The run history is still being read. Only the readiness trend waits for
   * it — the decision, the options and the distance to standard do not
   * (ADR-087): a slow read of the history no longer holds the decision back.
   */
  historyPending?: boolean;
  /**
   * The next open phase (`lib/next-step.ts`), read once by the shell with the
   * account's model switches — the page's ONE primary action. `undefined` when
   * the caller has none to give; `null` once nothing is open.
   */
  nextStep?: NextOpenPoint | null;
  /** The coach mark slot for "Your next step", shown on the decision card. */
  coach?: React.ReactNode;
  /** What else belongs in the "Evidence" fold — the buckets per object, what could not be determined. */
  evidenceExtra?: React.ReactNode;
  /** The decision record's card, shown as the hero of the panel once there is a signed run to decide on. */
  decision?: React.ReactNode;
  /** Called after the four-option block chose an option, so every reader of the decision rereads (ADR-079). */
  onDecisionChanged?: () => void;
  /** The Stand check of roadmap 6.9, before a choice is written. */
  beforeWrite?: () => Promise<boolean>;
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
        return d && d.draft
          ? {
              draft: d.draft,
              stored: d.stored ?? null,
              unchanged: d.unchanged,
              runId: d.runId ?? null,
              evidenceDigest: d.evidenceDigest ?? null,
              canDecide: d.canDecide === true,
              signOff: d.signOff ?? null,
              engineRoute: d.engineRoute ?? null,
            }
          : null;
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

  const steps = useMemo(() => workflowSteps(project), [project]);
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
        steps,
        overview,
        fit,
        costs: costsFromDecision(decision, storedCostsOf(project, steps)),
      }),
    [project, hasSource, hasRun, steps, overview, fit, decision],
  );
  // Fit to standard (ADR-069): from the signed run's evidence only.
  const fitFigure = useMemo(
    () =>
      standardFit({
        mode: 'project',
        hasRun,
        analyzeState: steps.find((x) => x.key === 'analyze')?.state ?? 'empty',
        signedSourceSha256: project?.auditMetadata?.inputFingerprint?.sha256 ?? null,
        findings,
        fit,
      }),
    [hasRun, steps, project, findings, fit],
  );
  // ADR-079: the four options, read from what the page already holds.
  const fitSource = useMemo(
    () => ({
      mode: 'project' as const,
      hasRun,
      analyzeState: steps.find((x) => x.key === 'analyze')?.state ?? 'empty',
      signedSourceSha256: project?.auditMetadata?.inputFingerprint?.sha256 ?? null,
      findings,
      fit,
    }),
    [hasRun, steps, project, findings, fit],
  );
  const otherEdition = useMemo(() => otherEditionLine(standardFitOnOtherEdition(fitSource)), [fitSource]);
  const subject = executiveSubject(project?.legacyCode, project?.name?.trim() || wt('exec.thisProgram'));
  const options = useMemo(() => {
    const read = decision.state === 'ready' ? decision.value : null;
    const confirmed = read?.stored && read.stored.status === 'confirmed' ? read.stored : null;
    return decisionOptionsView({
      subject,
      mode: 'project',
      hasRun,
      fit: fitFigure,
      decision: confirmed ?? read?.draft ?? null,
      status: confirmed ? 'confirmed' : read ? (read.stored?.status ?? 'draft') : null,
      outdated: Boolean(confirmed && read && read.unchanged === false),
      confirmation: confirmed?.confirmation ?? null,
      signOff: read?.signOff ?? null,
      engineRoute: read?.engineRoute ?? null,
      usage: project?.usageReport ?? null,
      economics: project?._economics ?? null,
    });
  }, [decision, subject, hasRun, fitFigure, project]);
  const optionHref = (place: OptionPlace): string => {
    const base = `/project/${projectId}`;
    if (place === 'business' || place === 'it') return `${base}?view=${place}`;
    if (place === 'fit') return '#standard-fit';
    return stageHref({ base, path: place, view: 'management' });
  };
  const readDecision = decision.state === 'ready' ? decision.value : null;
  const optionsBlock = hasRun ? (
    <DecisionOptions
      view={options}
      hrefFor={optionHref}
      mode="project"
      pending={decision.state === 'loading' ? 'reading' : decision.state === 'absent' ? 'unreadable' : null}
      choice={
        readDecision
          ? {
              projectId,
              runId: readDecision.runId ?? null,
              evidenceDigest: readDecision.evidenceDigest ?? null,
              canDecide: readDecision.canDecide === true,
              beforeWrite,
              onChanged: onDecisionChanged,
            }
          : null
      }
    />
  ) : null;

  const primary: ExecutivePrimary | null = nextStep
    ? {
        label: nextStep.action,
        reason: nextStep.running ? wt('nextStep.running') : nextStep.reason,
        href: stageHref({ base: `/project/${projectId}`, path: nextStep.path, view: 'management', from: WORKSPACE_RETURN.nextStep }),
        key: nextStep.key,
        running: nextStep.running === true,
      }
    : null;
  const hrefFor = (target: ExecutiveTarget): string =>
    target.kind === 'stage'
      ? stageHref({ base: `/project/${projectId}`, path: target.path, view: 'management' })
      : target.kind === 'anchor'
        ? `#${target.id}`
        : '/admin/new-project';

  // Only the trend waits for the run history (ADR-087).
  const readiness: ReadinessCard = historyPending
    ? { state: 'loading', title: overview.readiness.title }
    : overview.readiness;
  // The ranked blockers that are not SAP objects and not the decision's own
  // gaps — those stand on the fit card's objects and in the decision's
  // readiness sentence — join "What stands in the way" (ADR-087).
  const otherBlockers: FitOtherBlocker[] =
    overview.blockers.state === 'ready'
      ? overview.blockers.rows
          .filter((r) => r.key.startsWith('view-'))
          .map((r) => ({ key: r.key, label: r.label, evidence: r.evidence, provenance: r.provenance }))
      : [];

  return (
    <div data-management-overview="">
      <ManagementExecutive
        summary={executive}
        hrefFor={hrefFor}
        headingId="management-answers-heading"
        fit={fitFigure}
        primary={primary}
        fitDetailsHref="#public-cloud-fit"
        setTargetHref={
          // With a run the target is changed in the IT view's profile card
          // (TargetChangeButton); before one, the start screen in Analyze asks.
          hasRun
            ? `/project/${projectId}?view=it#${IT_TARGET_PROFILE_ID}`
            : stageHref({ base: `/project/${projectId}`, path: 'analyze', view: 'management' })
        }
        coach={coach}
        decision={hasRun ? decisionCard : undefined}
        options={optionsBlock}
        optionsView={hasRun ? options : null}
        otherEdition={otherEdition}
        otherBlockers={otherBlockers}
        trend={<ReadinessTrend card={readiness} />}
        onOpenOnePager={openSteeringOnePager}
      />

      {/* One fold, one action deeper (§2.11, ADR-087): every object per bucket
          and the open questions — nothing the first screen already says. */}
      {evidenceExtra ? (
        <div className="mt-4">
          <ManagementFold
            id="evidence"
            summary={hasRun ? wt('mgmtFold.evidenceRun') : wt('mgmtFold.evidenceNoRun')}
          >
            <div className="flex flex-col gap-4">{evidenceExtra}</div>
          </ManagementFold>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The Clean Core Score over runs of one rule version — the third block of the
 * first screen (mockup s5, ADR-087). A different rule version is a break,
 * named and never drawn; runs that cannot be placed are counted as *not
 * determined*.
 */
function ReadinessTrend({ card }: { card: ReadinessCard }) {
  if (card.state !== 'ready') {
    return (
      <section id={MANAGEMENT_IDS.readiness} className="h-full scroll-mt-20">
        <Pending id="readiness" card={card} />
      </section>
    );
  }
  return (
    <section id={MANAGEMENT_IDS.readiness} data-overview-card="readiness" data-overview-state="ready" className="h-full scroll-mt-20">
      <CcCard title={card.title} meta={<CcProvenanceChip value={card.provenance} />}>
        <Lead text={card.lead} />
        <TrendLine points={card.points} label={mgmtTrendLabel(card.ruleVersion, card.points)} />
        <p data-overview-rule-version="" className="m-0 mt-1 font-cc-mono text-[11px] text-cc-ink-muted">
          {mgmtRuleVersionLabel(card.ruleVersion)}
        </p>
        <p className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink">{card.sentence}</p>
        {card.points.length > 0 ? (
          <div data-overview-table="" className="mt-2">
            <CcTable
              caption={wt('mgmt.trendCaption')}
              columns={[
                { key: 'date', label: wt('mgmt.colDate') },
                { key: 'run', label: wt('mgmt.colRun') },
                { key: 'score', label: wt('mgmt.colScore'), numeric: true },
              ]}
              rows={card.points.map((p) => ({
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
            <span className="font-semibold">{mgmtNotDeterminedRunsLabel(card.notDetermined.count)}</span> —{' '}
            {card.notDetermined.sentence}
          </p>
        </div>
        {card.breaks.length > 0 ? (
          <ul data-overview-breaks="" className="m-0 mt-2 list-none space-y-1 p-0">
            {card.breaks.map((b) => (
              <li key={b} className="text-[12px] leading-snug font-medium text-cc-ink">
                {mgmtBreakLabel(b)}
              </li>
            ))}
          </ul>
        ) : null}
        <Coverage text={card.coverage} />
      </CcCard>
    </section>
  );
}
