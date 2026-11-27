'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import StageFrame from '@/components/StageFrame';
import StageHeader from '@/components/StageHeader';
import { type FacetProps } from '@/components/family/AnswerCard';
import FamilyChip from '@/components/family/FamilyChip';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageBox from '@/components/cc/MessageBox';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSkeleton from '@/components/cc/Skeleton';
import CcTextarea from '@/components/cc/Textarea';
import { CC_SEGMENTED_GROUP, ccSegmentClass } from '@/components/cc/SegmentedControl';
import ProjectNoAccess from '@/components/ProjectNoAccess';
import RuleQuestions from '@/components/design/RuleQuestions';
import DecideView, { DecideBar } from '@/components/redesign/DecideView';
import DecideResult from '@/components/redesign/DecideResult';
import { initialCostAssumptions } from '@/components/tco/OptionComparison';
import { useProgramDecision } from '@/hooks/useProgramDecision';
import { useWorkspaceRevision } from '@/hooks/useWorkspaceRevision';
import { useFollowHash } from '@/hooks/useFollowHash';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import WorkspaceRevisionStand from '@/components/workspace/RevisionStand';
import { getAuth } from '@/lib/firebase';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { CommandAnswerLostError, runProjectCommand } from '@/lib/project-command-client';
import { workflowSteps } from '@/lib/workflow-steps';
import { restoreAssumptions } from '@/lib/economics-record';
import { proposeEffort, proposeMaintenanceBaseline } from '@/lib/cost-assumptions';
import { countSourceLines } from '@/lib/source-lines';
import { formatTextDate } from '@/lib/format';
import { DECISION_OPTION_LABELS, optionOfArchitecture, type DecisionOption } from '@/lib/decision-options';
import { isTargetArchitecture, type TargetArchitectureCode } from '@/lib/project-commands';
import { standardTouch } from '@/lib/standard-touch';
import { decisionCardView } from '@/lib/decision-card';
import { ANSWERS_READING, businessAnswersDigest, type BusinessAnswersReading } from '@/lib/design-business-answers';
import { TARGET_EDITION_NAMES } from '@/lib/sap-naming';
import { generateDraftLabel, providerCompanyOf } from '@/lib/messages/model-consent';
import {
  ROUTE_WORDS,
  codeOfChoice,
  decideCostLine,
  decideDialogLead,
  decideDialogLines,
  decideDialogTitle,
  decisionBasisOf,
  followedIndicationReason,
  reasonRequired,
  rebuildRoutes,
  standardNote,
} from '@/lib/decide';
import { redesignModel } from '@/lib/redesign';
import { modelAbsenceReason } from '@/lib/model-stages';
import type { Project } from '@/lib/types';

/**
 * Decide — `/project/[id]/redesign` (owner decisions 25.11.2026, ADR-145; mock-up `decision-flow/index.html`). Was
 * Re-design, an overview that sent the reader to Economics, Design and back (ADR-143). Now the decision is taken here in
 * one go, for every reader on one page: the cost of the four options as a simulation, the four options as one choice,
 * what the choice needs (route and business questions for a Rebuild; reason and what follows otherwise), one bar and
 * one confirmation. The confirmation runs the `decide` command: option, route, sign-off, draft and confirmation in one
 * transaction, by the signed-in account (a self-declaration, not a mandate), bound to the run and to what this page
 * read. Nothing calls a model here; the result's next action names the provider before anything is sent.
 *
 * Owner writes, invited readers read: a reader sees the page and no write. Views are views: nothing about the reader's
 * view is stored.
 */
export default function RedesignPage({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  const [loadTick, setLoadTick] = useState(0);
  // `#decide` (every older way into the decision) arrives before the place exists: the follow waits for it.
  useFollowHash();

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadProjectAndHydrate(projectId);
        if (cancelled) return;
        setProject(loaded);
        setState(loaded ? 'ready' : 'missing');
      } catch (err) {
        if (cancelled) return;
        const code = (err as { code?: unknown } | null)?.code;
        setState(code === 'permission-denied' ? 'missing' : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, loadTick]);

  const [revision, setRevision] = useState(0);
  const stand = useWorkspaceRevision(projectId);
  const program = useProgramDecision(project, projectId, revision);
  const steps = useMemo(() => workflowSteps(project), [project]);
  const availability = useModelAvailability();

  const [choice, setChoice] = useState<DecisionOption | null>(null);
  const [route, setRoute] = useState<TargetArchitectureCode | null>(null);
  const [routesOpen, setRoutesOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState<'record' | 'withdraw' | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ headline: string; sentence: string } | null>(null);

  // The answers given here are need revisions: once they move, the decision is read again, so the basis the
  // confirmation is bound to is the one the page shows (ADR-145 (2)).
  const [answers, setAnswers] = useState<BusinessAnswersReading>(ANSWERS_READING);
  const answersKey = answers.state === 'ready' ? businessAnswersDigest(answers) : null;
  const seenAnswers = useRef<string | null>(null);
  useEffect(() => {
    if (answersKey === null) return;
    if (seenAnswers.current !== null && seenAnswers.current !== answersKey) setRevision((r) => r + 1);
    seenAnswers.current = answersKey;
  }, [answersKey]);

  // The cost line: the stored figures when they price all four options, else typical assumptions, never stored.
  const cost = useMemo(() => {
    const loc = typeof project?.legacyCode === 'string' && project.legacyCode.trim() ? countSourceLines(project.legacyCode) : null;
    const score = typeof project?.cleanCoreScore === 'number' ? project.cleanCoreScore : null;
    return decideCostLine({
      stored: project?._economics ? restoreAssumptions(project._economics.assumptions) : null,
      seed: initialCostAssumptions(),
      proposals: { effort: proposeEffort(loc), baseline: loc === null ? null : proposeMaintenanceBaseline(loc, score) },
    });
  }, [project]);

  const touch = useMemo(() => (program.findings.state === 'ready' ? standardTouch(program.findings.value) : null), [program.findings]);

  if (state === 'missing') return <ProjectNoAccess />;
  if (state === 'failed') {
    return (
      <div data-redesign="failed" className="max-w-xl py-16">
        <CcMessageStrip state="error" headline="The project could not be read" actions={<CcButton onClick={() => window.location.reload()}>Try again</CcButton>}>
          Nothing was changed. Reload the page to read it again.
        </CcMessageStrip>
      </div>
    );
  }
  if (state === 'loading') {
    return (
      <div data-redesign="loading" role="status" className="py-16">
        <CcSkeleton shape="text" count={4} label="Reading the project" />
      </div>
    );
  }

  const base = `/project/${encodeURIComponent(projectId)}`;
  const runDate = formatTextDate(project?.auditMetadata?.modelCard?.analysisTimestamp);
  const hasRun = Boolean(project?.activeRunId);
  const read = program.decision.state === 'ready' ? program.decision.value : null;
  const reading = program.decision.state === 'loading';
  const canDecide = read?.canDecide === true;
  const indicated = program.state.indicated;
  const cards = program.options.cards;
  const contractRouteRead: unknown = read?.contractRoute;
  const storedRouteRead: unknown = read?.engineRoute;
  const contractRoute = isTargetArchitecture(contractRouteRead) ? contractRouteRead : null;
  const storedRoute = isTargetArchitecture(storedRouteRead) ? storedRouteRead : null;
  const engineRoute = contractRoute ?? storedRoute;
  const edition = project?.s4Deployment === 'private' || project?.s4Deployment === 'public' ? TARGET_EDITION_NAMES[project.s4Deployment] : null;
  const account = typeof window === 'undefined' ? null : (getAuth().currentUser?.email ?? null);
  const confirmedRecord = read?.stored && read.stored.status === 'confirmed' ? read.stored : null;
  // The account's own switch: a Rebuild's design is written by a model, and a switched-off model says so here.
  const designOff = availability.enabled('design') ? null : modelAbsenceReason('stage-off', 'design');

  const header = (
    <StageHeader
      tools={{ steps }}
      project={project}
      place="redesign"
      // The Stand this page was drawn from, and the notice when it has moved (CR-15): a write the Stand holds back says so.
      eyebrow={<WorkspaceRevisionStand held={stand.held} seen={stand.seen} moved={stand.moved} onKeep={stand.keep} onRefresh={stand.refresh} />}
    >
      Keep, rebuild, move to SAP standard or retire. Recorded by your signed-in account: a self-declaration, not a mandate.
    </StageHeader>
  );

  const reloadAll = () => {
    setLoadTick((t) => t + 1);
    setRevision((r) => r + 1);
  };

  /* ------------------------------------------------------------ withdraw */
  const withdraw = async () => {
    setAsking(null);
    setRefusal(null);
    if (!(await stand.checkBeforeWrite())) return;
    setBusy(true);
    try {
      await runProjectCommand(projectId, { command: 'withdraw-decision' });
      reloadAll();
    } catch (err: unknown) {
      if (err instanceof CommandAnswerLostError) {
        setRefusal({ headline: 'No answer came back. The decision was read again.', sentence: err.message });
        reloadAll();
        return;
      }
      setRefusal({ headline: 'Nothing was withdrawn.', sentence: err instanceof Error ? err.message : 'The withdrawal was refused.' });
    } finally {
      setBusy(false);
    }
  };
  const withdrawBox = (
    <CcMessageBox open={asking === 'withdraw'} title="Withdraw the decision?" confirmLabel="Withdraw the decision" onConfirm={() => void withdraw()} onCancel={() => setAsking(null)}>
      <p className="m-0">
        The decision stays on the record as withdrawn, with who confirmed it and when. You can then decide again on this page; the new decision is a new
        revision. Nothing that was built is removed.
      </p>
    </CcMessageBox>
  );
  const refusalStrip = refusal ? (
    <div data-decide-refusal="">
      <CcMessageStrip state="error" headline={refusal.headline} announce={true}>
        {refusal.sentence}
      </CcMessageStrip>
    </div>
  ) : null;

  if (!hasRun) {
    return (
      <StageFrame stage="redesign" data-redesign="ready" data-decide-state="no-run">
        {header}
        <CcMessageStrip state="information" headline="The decision opens once the program is analyzed and the run is signed.">
          <CcLinkButton href={`${base}/analyze`} variant="primary">
            Open Analyze
          </CcLinkButton>
        </CcMessageStrip>
      </StageFrame>
    );
  }

  /* ---------------------------------------------------------- the result */
  if (confirmedRecord) {
    const target: unknown = project?.targetArchitecture;
    const option = optionOfArchitecture(typeof target === 'string' ? target : null) ?? program.state.option ?? 'keep';
    const routeCode = option === 'rebuild' && isTargetArchitecture(target) ? target : null;
    const routeWords = routeCode ? ROUTE_WORDS[routeCode] ?? routeCode : null;
    const outdated = program.state.stage === 'outdated';
    const by = confirmedRecord.confirmation?.account ?? 'the signed-in account';
    const on = formatTextDate(confirmedRecord.confirmation?.at) ?? 'an unreadable date';
    const rebuild = option === 'rebuild';
    const design = steps.find((s) => s.key === 'design');
    const transformation = steps.find((s) => s.key === 'transformation');
    const designWritten = design?.state === 'done' || design?.state === 'partial';
    const codeBuilt = transformation?.state === 'done' || transformation?.state === 'partial';
    const company = availability.known ? providerCompanyOf(availability.provider) : null;
    const transformationOn = availability.enabled('transformation');
    const walk = redesignModel(steps, program.state);
    const answer = rebuild
      ? `Decided: Rebuild${routeWords ? `, ${routeWords}` : ''}${edition ? `, for ${edition}` : ''}.`
      : `Decided: ${DECISION_OPTION_LABELS[option]}. Nothing is built.`;
    const why = rebuild
      ? `Recorded by ${by} on ${on}, bound to the signed run${runDate ? ` of ${runDate}` : ''}. A self-declaration, not a mandate.`
      : `Recorded by ${by} on ${on} with the reason, bound to the signed run${runDate ? ` of ${runDate}` : ''}. A self-declaration, not a mandate. Nothing is waiting.`;

    let action: React.ReactNode = null;
    let actionNote: React.ReactNode = null;
    if (outdated && canDecide) {
      action = (
        <CcButton variant="primary" onClick={() => setAsking('withdraw')} disabled={busy} data-decide-withdraw-again="">
          Withdraw and decide again…
        </CcButton>
      );
      actionNote = 'The evidence or the costs moved since it was confirmed.';
    } else if (rebuild && !designWritten) {
      // The design is written in Design, whose button names the model call before anything is sent.
      action = (
        <CcLinkButton href={`${base}/design?view=business#design-questions`} variant="primary" data-decide-next="design">
          Open Design to write the design
          <ArrowRight size={16} aria-hidden={true} />
        </CcLinkButton>
      );
      actionNote = designOff ?? 'Design writes it from your answers. Then Transformation builds the code.';
    } else if (rebuild && !codeBuilt) {
      // Opening a tool never sends code anywhere (legal review 06.11.2026, 3.0.21, item 1): this link only opens
      // Transformation, whose own button carries the approved text with the provider of the key actually used.
      action = (
        <CcLinkButton href={`${base}/transformation`} variant="primary" data-decide-next="transformation">
          Open Transformation to generate the code
          <ArrowRight size={16} aria-hidden={true} />
        </CcLinkButton>
      );
      actionNote = transformationOn
        ? `There, “${generateDraftLabel(company)}” starts it.`
        : 'The model for Transformation is switched off for this account; Settings switches it on.';
    } else if (rebuild && walk.next && walk.next.key !== 'decide' && walk.next.key !== 'analyze') {
      action = (
        <CcLinkButton href={`${base}/${walk.next.path}`} variant="primary" data-decide-next={walk.next.key}>
          {walk.next.label}
          <ArrowRight size={16} aria-hidden={true} />
        </CcLinkButton>
      );
      actionNote = walk.next.note;
    } else if (!rebuild) {
      action = (
        <CcLinkButton href={`${base}/design?view=business`} variant="secondary" data-decide-next="design-optional">
          {option === 'retire' ? 'Read the switch-off list in Design' : 'Read what it means in Design'}
        </CcLinkButton>
      );
      actionNote = 'Optional. Nothing is waiting.';
    }

    const facets: FacetProps[] = [
      { id: 'decision', label: 'Decision', value: DECISION_OPTION_LABELS[option], note: outdated ? 'confirmed, out of date' : 'confirmed, by your account' },
      {
        id: 'cost',
        label: 'Cost',
        chip: <FamilyChip kind="simulation" />,
        value: cost.cost[option] ?? 'Not priced',
        note: cost.basis === 'stored' && !cost.typical ? `your figures${cost.period ? `, ${cost.period}` : ''}` : `typical assumptions${cost.period ? `, ${cost.period}` : ''}`,
      },
      { id: 'design', label: 'Design', value: rebuild ? (designWritten ? 'Written' : 'Not written yet') : 'Not needed', note: rebuild ? 'from your answers, AI-generated' : 'Design shows what stops' },
      {
        id: 'next',
        label: 'Next',
        value: rebuild ? (codeBuilt ? 'On record' : 'Code') : 'Done',
        note: rebuild ? 'Transformation, then Documentation' : 'nothing open in the decision',
      },
    ];
    const view = decisionCardView(confirmedRecord);
    return (
      <StageFrame stage="redesign" data-redesign="ready" data-decide-state="decided" data-decide-option={option}>
        {header}
        <DecideResult
          answer={answer}
          why={why}
          action={action}
          actionNote={actionNote}
          facets={facets}
          outdated={outdated ? 'Out of date: the evidence or the costs changed since this decision was confirmed. Withdraw it and decide again on what the project stands on now.' : null}
          strip={
            rebuild
              ? 'The decision, the route and the answers are on record. Everything stays reachable: change the figures in Economics, read the design in Design, withdraw the decision here.'
              : 'The decision and its reason are on record. Transformation to Delivery read “Not needed”. Everything stays reachable: Economics, Design, and withdrawing the decision here.'
          }
          links={
            canDecide ? (
              <>
                {!outdated ? (
                  <button type="button" onClick={() => setAsking('withdraw')} disabled={busy} data-decide-withdraw="" className="cursor-pointer font-semibold text-cc-ink underline underline-offset-2 disabled:cursor-not-allowed">
                    Withdraw the decision…
                  </button>
                ) : null}
                {rebuild ? (
                  <a href={`${base}/design?view=management`} data-decide-change-route="" className="font-semibold text-cc-ink underline underline-offset-2">
                    Change the route in Design…
                  </a>
                ) : null}
              </>
            ) : (
              <span className="text-cc-ink-muted">Only the owner of the project decides or withdraws.</span>
            )
          }
          bindings={view.bindings}
          timeline={confirmedRecord.timeline}
        />
        {refusalStrip}
        {withdrawBox}
      </StageFrame>
    );
  }

  /* ------------------------------------------------------- the choosing */
  const effectiveRoute: TargetArchitectureCode | null = choice === 'rebuild' ? (route ?? engineRoute ?? 'rap') : null;
  const needsReason = choice ? reasonRequired({ option: choice, route: effectiveRoute, indicated, engineRoute }) : false;
  const indicatedCard = choice ? cards.find((c) => c.option === choice) ?? null : null;
  const follows = choice && choice !== 'rebuild' && !needsReason && indicatedCard ? followedIndicationReason(choice, indicatedCard.reason) : null;
  const justification = choice === 'rebuild' ? reason.trim() : (follows ?? reason.trim());
  const reasonMissing = needsReason && reason.trim().length === 0;
  const answered = answers.state === 'ready' ? { total: answers.total, open: answers.open } : null;
  const limits = read ? read.draft.conditions.filter((c) => c.source === 'contract-limit').length : null;
  const note = standardNote(touch, choice, indicated);
  const earlierOption = program.state.stage === 'chosen' ? program.state.option : null;

  const pick = (o: DecisionOption) => {
    setRefusal(null);
    if (o !== choice) {
      // A reason belongs to the option it was written for.
      setReason('');
      setRoutesOpen(false);
      setRoute(null);
    }
    setChoice(o);
  };

  const record = async () => {
    setAsking(null);
    setRefusal(null);
    if (!read || !choice) return;
    const code = codeOfChoice(choice, effectiveRoute);
    if (!code) return;
    if (!(await stand.checkBeforeWrite())) return;
    setBusy(true);
    try {
      await runProjectCommand(projectId, {
        command: 'decide',
        targetArchitecture: code,
        justification,
        expectedRunId: read.runId ?? '',
        expectedEvidenceDigest: read.evidenceDigest ?? '',
        expectedDecisionBasis: decisionBasisOf({ runId: read.runId ?? null, evidenceDigest: read.evidenceDigest ?? null, draft: read.draft, stored: read.stored }),
      });
      setChoice(null);
      setReason('');
      reloadAll();
    } catch (err: unknown) {
      if (err instanceof CommandAnswerLostError) {
        setRefusal({ headline: 'No answer came back. The decision was read again.', sentence: err.message });
        reloadAll();
        return;
      }
      setRefusal({ headline: 'Nothing was recorded.', sentence: err instanceof Error ? err.message : 'The decision was refused.' });
    } finally {
      setBusy(false);
    }
  };

  const rebuildBlock =
    choice === 'rebuild' ? (
      <div className="flex flex-col gap-4">
        <div>
          <p className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">Route</p>
          <div data-decide-route={effectiveRoute ?? ''} className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 cc-text-cell text-cc-ink">
            <b className="font-bold">{effectiveRoute ? ROUTE_WORDS[effectiveRoute] ?? effectiveRoute : 'Not determined'}</b>
            {effectiveRoute === engineRoute ? <FamilyChip kind="engine" /> : <FamilyChip kind="yours" />}
            <span className="text-cc-ink-muted">
              {contractRoute ? 'architecture contract of the signed run' : 'the route the analysis recorded'}
              {limits !== null && limits > 0 ? ` · ${limits} ${limits === 1 ? 'limit' : 'limits'}, shown with the decision` : ''}
            </span>
            {canDecide ? (
              <button
                type="button"
                aria-expanded={routesOpen}
                onClick={() => setRoutesOpen(!routesOpen)}
                data-decide-route-other=""
                className="cursor-pointer font-semibold text-cc-ink underline underline-offset-2"
              >
                {routesOpen ? 'Keep this route' : 'Another route…'}
              </button>
            ) : null}
          </div>
          {routesOpen && canDecide ? (
            <div className="mt-2">
              <span role="radiogroup" aria-label="Route" className={`${CC_SEGMENTED_GROUP} flex-wrap`}>
                {rebuildRoutes(engineRoute).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={effectiveRoute === r}
                    onClick={() => {
                      setRoute(r);
                      setReason('');
                    }}
                    data-decide-route-pick={r}
                    className={ccSegmentClass(effectiveRoute === r)}
                  >
                    {ROUTE_WORDS[r] ?? r}
                    {r === engineRoute ? ' · from the engine' : ''}
                  </button>
                ))}
              </span>
            </div>
          ) : null}
          {needsReason && canDecide ? (
            <div className="mt-3 max-w-2xl" data-decide-reason="">
              <CcTextarea
                label="Why this route (required: the engine names another)"
                value={reason}
                onChange={setReason}
                rows={3}
                required={true}
                maxLength={4000}
                help="Kept with the decision."
              />
            </div>
          ) : null}
        </div>
        <div data-decide-questions="">
          <p className="m-0 flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
            Business questions
            {answered && answered.total > 0 ? (
              <span className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-2 text-[11px] font-bold tracking-normal text-cc-ink normal-case">
                {answered.total - answered.open} of {answered.total} answered
              </span>
            ) : null}
          </p>
          <div className="mt-2">
            <RuleQuestions project={project} projectId={projectId} onAnswers={setAnswers} />
          </div>
          <p className="m-0 mt-2 cc-text-meta text-cc-ink-muted">Open questions do not stop anything: they stay open in the design and are said there.</p>
        </div>
      </div>
    ) : null;

  // The bar: what is chosen, and the one confirmation, enabled only when a click records something.
  const label = choice ? DECISION_OPTION_LABELS[choice] : null;
  const summary = !choice
    ? 'Choose one of the four options.'
    : choice === 'rebuild'
      ? [
          'Rebuild',
          effectiveRoute ? ROUTE_WORDS[effectiveRoute] ?? effectiveRoute : null,
          edition,
          answered && answered.total > 0 ? `${answered.total - answered.open} of ${answered.total} answered` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : `${label} · nothing is built`;
  const sub = !choice
    ? 'Nothing is written until you confirm.'
    : !canDecide
      ? reading
        ? 'Reading the decision on record…'
        : 'Only the owner of the project decides. You read it.'
      : reading
        ? 'Reading the decision on record…'
        : reasonMissing
          ? choice === 'rebuild'
            ? 'Write your reason for this route first.'
            : `Write your reason first${indicated ? `: the analysis indicates ${DECISION_OPTION_LABELS[indicated]}` : ''}.`
          : choice === 'rebuild'
            ? `${answered && answered.open > 0 ? `${answered.open} open: they stay open in the design. ` : ''}Then the design is written in Design.${designOff ? ` ${designOff}` : ''}`
            : follows
              ? 'It follows the analysis, so no reason is asked.'
              : 'Your reason is kept with the decision.';
  const recordable = Boolean(choice) && canDecide && !reading && !busy && !reasonMissing && read !== null;
  const bar = (
    <DecideBar
      summary={summary}
      sub={sub}
      refusal={refusalStrip}
      action={
        canDecide || reading ? (
          <CcButton variant="primary" density="cozy" busy={busy} disabled={!recordable} aria-haspopup="dialog" onClick={() => setAsking('record')} data-decide-record="">
            Record the decision…
          </CcButton>
        ) : null
      }
    />
  );

  const dialogLines = choice
    ? decideDialogLines({
        account,
        option: choice,
        route: effectiveRoute,
        edition,
        runDate,
        costBasis: cost.basis,
        answers: answered,
        limits,
        reason: justification,
        indicated,
        reasonFollowsIndication: Boolean(follows),
      })
    : [];

  return (
    <StageFrame stage="redesign" data-redesign="ready" data-decide-state="choosing">
      {header}
      {program.decision.state === 'absent' ? (
        <div className="mb-4">
          <CcMessageStrip state="error" headline="The decision on record could not be read">
            {program.decision.reason} Nothing can be recorded right now. Reload the page to try again.
          </CcMessageStrip>
        </div>
      ) : null}
      <DecideView
        edition={edition}
        editionSigned={Boolean(edition)}
        cost={cost}
        economicsHref={`${base}/tco`}
        cards={cards}
        indicated={indicated}
        choice={choice}
        onChoose={pick}
        note={note}
        checkHref={`${base}?view=it#standard`}
        runDate={runDate}
        rebuild={rebuildBlock}
        reason={canDecide ? { value: reason, onChange: setReason, required: needsReason, follows } : null}
        earlier={
          earlierOption
            ? `${DECISION_OPTION_LABELS[earlierOption]} was chosen earlier and never recorded. Choose it again below to record it, or choose another.`
            : null
        }
        bar={bar}
      />
      <CcMessageBox
        open={asking === 'record' && choice !== null}
        title={choice ? decideDialogTitle(choice) : ''}
        confirmLabel="Record the decision"
        onConfirm={() => void record()}
        onCancel={() => setAsking(null)}
      >
        <p className="m-0">{decideDialogLead(account)}</p>
        <ul data-decide-dialog-lines="" className="m-0 mt-2 list-disc space-y-1 pl-5">
          {dialogLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </CcMessageBox>
    </StageFrame>
  );
}
