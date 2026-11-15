'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { BACK_LINK_CLASS } from '@/components/BackLink';
import ChoiceBackLink from '@/components/ChoiceBackLink';
import { originLink } from '@/lib/workspace-back-href';
import CcButton from '@/components/cc/Button';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import WorkspaceMetaLine from './MetaLine';
import WorkspaceStatusLine from './StatusLine';
import WorkspaceToolBar from './ToolBar';
import OpenQuestions, { type OpenAnswerOverlay } from './OpenQuestions';
import { useOpenQuestions } from '@/hooks/useOpenQuestions';
import NextStepCard from './NextStepCard';
import { useIsOwner } from './BusinessRulesEditor';
import PublicCloudFitPanel from './PublicCloudFitPanel';
import ManagementAnswers from './ManagementAnswers';
import ItAnswers from './ItAnswers';
import ItRuleRegister from './ItRuleRegister';
import DecisionCard from './DecisionCard';
import SteeringOnePager from './SteeringOnePager';
import ManagementElsewhere from './ManagementElsewhere';
import AskThisCase from './AskThisCase';
import CoachMarkNote from './CoachMarks';
import type { CoachMarkId } from '@/lib/coach-marks';
import WorkspaceAccessList from './AccessList';
import WorkspaceRevisionStand from './RevisionStand';
import CommandSearch from './CommandSearch';
import WorkspacePrintSheet from './WorkspacePrintSheet';
import WorkspaceHeadActions, { ReadAccessLine } from './HeadActions';
import { useCoachMarks } from '@/hooks/useCoachMarks';
import { useWorkspaceRevision } from '@/hooks/useWorkspaceRevision';
import { preAnsweredQuestion, type PreAnswered } from '@/lib/ask-this-case';
import type { ProcessSummary } from '@/lib/process-summary';
import { signedSourceOf } from '@/lib/signed-source';
import { nextOpenPoint, nothingOpenText } from '@/lib/next-step';
import { workflowSteps } from '@/lib/workflow-steps';
import { BUSINESS_MAP_ID } from '@/lib/business-layers';
import { runTrust, scrollToWhenThere } from '@/lib/it-sections';
import { layerRedirect, replaceHashInPlace } from '@/lib/layer-redirect';
import { useSourceReading } from '@/hooks/useSourceReading';
import { engineStampOf, engineVersionOfProject } from '@/lib/run-engine-version';
import { useProcessStates } from '@/hooks/useProcessStates';
import { ruleTallyOf } from '@/lib/management-rule-tally';
import { managementInShort, programSummary } from '@/lib/program-summary-text';
import type { ModelStageSubject } from '@/lib/model-stages';
import {
  VIEW_ABOUT,
  VIEW_LABELS,
  VIEW_QUESTIONS,
  WORKSPACE_VIEWS,
  layerFromHash,
  metaLine,
  notDetermined,
  workspaceLayers,
  workspaceStatusLine,
  workspaceTools,
  type LayerKey,
  type WorkspaceView,
} from '@/lib/workspace-model';
import { recordGaps } from '@/lib/legacy-project';
import { stageHref, WORKSPACE_RETURN } from '@/lib/workspace-back-href';
import { workspaceEyebrow } from '@/lib/workspace-head';
import { pageStatusOnRecord, wt } from '@/lib/workspace-messages';
import { pricedOptions } from '@/lib/economics-record';
import type { Project } from '@/lib/types';

/**
 * The Business view is Analyze's since 3.1.0 (plan
 * `docs/design/analyze-business-first-plan.md` §4.1, AB-2; ADR-109):
 * `/project/<id>` in Business — or with no view — goes to
 * `/project/<id>/analyze` before this component renders
 * (`app/(app)/project/[projectId]/page.tsx`, `lib/analyze-entry.ts`), so this
 * shell draws IT and Management only, until AB-9/AB-10 give each a page of its
 * own on the Analyze tool. What the Business branch held — the next-step bar,
 * the walk entry, the first insights, the map with its source column, the
 * central work area ("Work from this process") and the folded open questions — stands in
 * Analyze, Business (`components/analyze/AnalyzeBusiness.tsx`) or left the
 * app with the hub (ADR-090 retired).
 */
export type ShellView = Exclude<WorkspaceView, 'business'>;

/**
 * IT shows only its own content (owner decision 10.10.2026, ADR-086): the
 * answer, the four figures and "Next step" (§2.3 item 5), then its own anchor
 * bar over Findings → Objects & dependencies → Open questions, with target
 * profile, route and Run & trust beside them — all inside `ItAnswers` — and
 * "Ask this case" under it (owner decision 22.10.2026).
 *
 * In IT the tour starts at "Next step", the page's one primary action right
 * under the answer, then the Not determined figure in that answer. "Select
 * the decision point" points at the process, which IT does not draw since
 * ADR-086 — that tip stands in Business, at the map.
 */
const IT_COACH_ORDER: readonly CoachMarkId[] = ['next-step', 'not-determined'];
/**
 * Management has a place for one tip only, "Your next step" on its answer. The
 * other two have no slot there, and a tour that starts with a mark this view
 * cannot show shows nothing at all.
 */
const MANAGEMENT_COACH_MARKS: readonly CoachMarkId[] = ['next-step'];

/**
 * Management opens with its answer (ADR-029): the decision with the page's ONE
 * next action, the four options and what the decision rests on, then the
 * distance to SAP standard beside the readiness trend — the full width of the
 * frame (ADR-063), not a narrow column. The decision record itself is that
 * card's hero, never folded (owner 03.10.2026: "the decision must be shown,
 * placed prominently"). One fold follows, Evidence, collapsed whenever the page
 * opens, and one quiet row of links out (ADR-087): no layer bar, no first
 * look, no Costs and no Process fold — the process is Business's, the objects
 * IT's, the amounts Economics', the audit pack Delivery's. "Next step" is not
 * a card of its own here: it is the decision card's button, so the page never
 * says it twice.
 *
 * The Object Page of a project — `DESIGN.md` §2.3, roadmap step 1.4.
 *
 * Header, status line, toolbar, and the view's own answer. A project opens in
 * Analyze, Business since 3.1.0 (ADR-109), so this page holds IT and
 * Management; everything it says about the project is derived in
 * `lib/workspace-model.ts` so that the honesty of it is testable in one place
 * rather than seven.
 *
 * **One header in all three views** (ADR-026, ADR-037, note of 04.10.2026).
 * The meta line sits behind "Details" and the seven statuses fold into one
 * "Project status" row in every view — IT and Management see the provenance
 * status in the folded row, Business its plain sentence — because "catalog
 * releaseInfo fb0df9f2" and seven statuses with seven "?" cost every reader the
 * line that mattered. The tools stay open in IT from M up; the status row
 * and the tools stand in the header.
 *
 * **Three navigations, three jobs** (ADR-018). The view orders the same content
 * and lives in `?view=`; the layer jumps within this page and lives in the URL
 * fragment; a tool opens a stage as its own page. None of the three is a
 * progress indicator, and a view in the URL is a perspective and never a grant
 * — this component renders one project that the reader could already open.
 *
 * **"Next step"** (roadmap 6.5) is the one card here with a `primary` button —
 * *"the page's main action is in 'Next step'"* (`DESIGN.md` §1.5) — and
 * it renders `lib/next-step.ts`'s answer without adding an opinion of its own.
 */
export default function WorkspaceShell({
  project,
  projectId,
  view,
  onViewChange,
  account,
}: {
  project: Project | null;
  projectId: string;
  /** IT or Management: Business is Analyze's page since 3.1.0 (AB-2). */
  view: ShellView;
  onViewChange: (view: WorkspaceView) => void;
  /**
   * The signed-in account's own profile, or `undefined`/`null` while it has
   * not loaded — just enough of it (`modelStages`) for `lib/next-step.ts` to
   * tell a phase that is genuinely open from one a model switch keeps the
   * reader from generating right now (roadmap 1.2). Never widened to the whole
   * `UserProfile` type here: this component asks one question of it, and a
   * narrower prop is one less reason for this file to change when that type
   * grows a field that has nothing to do with the next step.
   */
  account?: ModelStageSubject | null;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  /** Bumped after the invitation dialog closes, so the read-access line rereads. */
  const [accessKey, setAccessKey] = useState(0);
  /** Bumped by the Decision card after each command, so the overview above it rereads the decision. */
  const [decisionRevision, setDecisionRevision] = useState(0);
  const onDecisionChanged = useCallback(() => setDecisionRevision((n) => n + 1), []);
  const aboutId = useId();
  // Where "Back to <origin>" leads, when the address carries one of the closed list.
  const searchParams = useSearchParams();
  const originBack = originLink(`/project/${encodeURIComponent(projectId)}`, searchParams?.toString() ?? '');

  /**
   * The layer lives in the URL fragment and nowhere else (ADR-018, roadmap
   * 6.2): *"layer … held in the URL fragment (`#need`)"*.
   *
   * `null` until the browser has been asked, because this component is rendered
   * on the server too and `window.location.hash` does not exist there. Reading
   * it during render would be a hydration mismatch; reading it in an effect
   * means the first paint shows the first layer with content and the reader's
   * own choice arrives a frame later, which is the right way round — a layer is
   * not a gate on anything.
   *
   * `hashchange` rather than `useSearchParams`: the fragment is never sent to
   * the server and Next's router does not re-render on it. Back and Forward
   * move between layers because each choice is a history entry, which is the
   * "and browser" half of the roadmap line — and it is the *browser's* history,
   * not a preference stored anywhere.
   */
  const [hashLayer, setHashLayer] = useState<LayerKey | null>(null);
  useEffect(() => {
    const read = () => setHashLayer(layerFromHash(window.location.hash));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  // A client navigation (`router.push`/`replace`) changes the address without
  // a `hashchange`, so the layer is read again whenever the view changes —
  // otherwise a layer the reader left behind stays in state and steers the
  // redirects below (owner 10.10.2026: Business would not open from IT).
  useEffect(() => {
    setHashLayer(layerFromHash(window.location.hash));
  }, [view]);

  /**
   * Which revision of the process this screen is showing, and the notice when
   * somebody else has moved it (roadmap 6.9, CR-15).
   *
   * Checked on mount, on focus, and before the one writing action on this page
   * — all three through one probe that reaches the server at most once every
   * ten seconds, whatever the reader does (`lib/workspace-revision.ts`).
   * Nothing about it is stored: it is a GET and two buttons.
   */
  const stand = useWorkspaceRevision(projectId);

  const meta = useMemo(() => metaLine(project, projectId), [project, projectId]);
  const eyebrow = useMemo(() => workspaceEyebrow(project), [project]);
  const statuses = useMemo(() => workspaceStatusLine(project), [project]);
  const tools = useMemo(() => workspaceTools(project), [project]);
  const open = useMemo(() => notDetermined(project), [project]);
  // What a project stored by an earlier version does not carry (roadmap 3.0.2).
  // Read, never repaired: opening a project writes nothing to it.
  const recorded = useMemo(() => recordGaps(project), [project]);
  /**
   * The open questions (ADR-081): one list per project, grouped by the action
   * that resolves each. `answers` holds what this page wrote since the project
   * was read, so a saved answer shows at once.
   */
  const [answers, setAnswers] = useState<OpenAnswerOverlay>({});
  const questions = useOpenQuestions(project, projectId, { open, answers });
  const onAnswered = useCallback<NonNullable<React.ComponentProps<typeof OpenQuestions>['onAnswered']>>(
    (action, answer) => setAnswers((prev) => ({ ...prev, [action]: answer })),
    [],
  );

  /**
   * The reading of the source, for the search, the print sheet, the rule
   * register and "Ask this case" — read once, here: the first insights that
   * used to hand theirs up stand in Analyze, Business since 3.1.0 (AB-2).
   */
  const reading = useSourceReading(
    typeof project?.legacyCode === 'string' ? project.legacyCode : '',
    true,
    engineVersionOfProject(project),
  );
  /**
   * The source the active run signed, and the map of it in four numbers — so
   * *Need & process* says what the map shows instead of "nothing on record"
   * under it (owner, 03.10.2026). Counted the way the map counts
   * (`lib/process-summary.ts`), on demand: the BPMN reader is not part of the
   * first paint.
   */
  const signed = useMemo(() => signedSourceOf(project), [project]);
  const [processSummary, setProcessSummary] = useState<{ source: string; summary: ProcessSummary | null } | null>(null);
  // The summary's inputs as values, so a snapshot that changes another field of
  // the project does not count the same source again: the source, its file, the
  // process name and the engine that signed it (`engineStampOf`, what the worker reads).
  const summarySource = signed?.source ?? null;
  const summaryFileName = signed?.fileName ?? '';
  const summaryName = project?.name || '';
  const summaryEngine = JSON.stringify(engineStampOf(project));
  useEffect(() => {
    if (!summarySource) return;
    let cancelled = false;
    // Counted in the reading worker, off this thread (owner, 12.10.2026: the
    // CO project froze the Documentation tool). Until it answers the layers
    // count what is stored, as they did while the reader was being loaded; a
    // failure reads as no summary, as a throw did before.
    void import('@/lib/bpmn/reading-exports-client')
      .then((m) => m.processSummaryOffThread(summarySource, summaryFileName, summaryName, JSON.parse(summaryEngine) as object | null))
      .catch((): ProcessSummary | null => null)
      .then((summary) => {
        if (cancelled) return;
        setProcessSummary({ source: summarySource, summary });
      });
    return () => {
      cancelled = true;
    };
  }, [summarySource, summaryFileName, summaryName, summaryEngine]);
  const mapSummary = signed && processSummary?.source === signed.source ? processSummary.summary : null;

  // The layers count the process, the rules and the capabilities of that
  // reading (mockups s2, s3). No view of this page shows a layer bar any more —
  // IT has its own sections (ADR-086), Management none (ADR-087), and Business
  // is Analyze's (ADR-109) — but Management's Need row reads the Need count.
  const allLayers = useMemo(() => workspaceLayers(project, reading, mapSummary), [project, reading, mapSummary]);
  // "Your process" in Management: one line in the decision's Need row, counted
  // as the map counts it (ADR-087) — the Need layer's own count, said once.
  // Owner 12.10.2026: Management reads what the program is for and what the
  // decision has to know from the code (`managementInShort`), then the counts.
  const processCount = useMemo(() => allLayers.find((l) => l.key === 'need')?.count ?? null, [allLayers]);

  const router = useRouter();
  /**
   * Another view, at a place in it: the view in `?view=`, the place in the
   * fragment, the rest of the query kept. Used by the redirects below and by
   * IT's links out (ADR-086). The layer is set here because a client
   * navigation fires no `hashchange`; the place is brought into view once it
   * has rendered. A place in Business is Analyze's (the route sends it there).
   */
  const goTo = useCallback(
    (target: WorkspaceView, hash: string, replace: boolean) => {
      const query = new URLSearchParams(window.location.search);
      query.set('view', target);
      const url = `/project/${encodeURIComponent(projectId)}?${query.toString()}#${hash}`;
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
      // After the navigation, not inside the effect that may have asked for it.
      window.requestAnimationFrame(() => setHashLayer(layerFromHash(hash)));
      if (hash !== BUSINESS_MAP_ID) scrollToWhenThere(hash);
    },
    [projectId, router],
  );
  const toEconomics = useCallback(
    (from: WorkspaceView) => stageHref({ base: `/project/${projectId}`, path: 'tco', view: from, from: WORKSPACE_RETURN.tools }),
    [projectId],
  );
  /**
   * An old layer address in any view — `?view=business#costs`, `?view=it#evidence`,
   * `?view=management#changes`, from a bookmark, a mail or a stage's way back —
   * goes where that content lives now (`lib/layer-redirect.ts`): Business keeps
   * one layer (ADR-080, ADR-096), IT has its own sections (ADR-086), Management none
   * (ADR-087). `replace`, so Back does not bounce the reader into the redirect
   * again.
   *
   * An address the page *arrives* with that leads to another view or to
   * Economics is sent on by the route before this component renders
   * (`app/(app)/project/[projectId]/page.tsx`); this effect handles a place in
   * the same view, and any old address that arrives while the workspace is
   * open — a link on the page, a fragment typed into the address bar. A place
   * in the same view is written through `history.replaceState`
   * (`replaceHashInPlace`), never `location.replace('#…')`: Next's router
   * would not hear of it and would put the old address back on its next commit.
   *
   * Read from the address as it is now, not the layer state: that may still be
   * the last view's — a switch from Business `#standard` would otherwise send
   * the reader straight back.
   */
  const hasActiveRun = Boolean(project?.activeRunId?.trim());
  // The address last sent on, so the effect re-running before the navigation
  // has landed (the layer state settles a frame later) does not send it again
  // and discard the navigation already under way.
  const sentFrom = useRef<string | null>(null);
  useEffect(() => {
    const target = layerRedirect(view, window.location.hash, { hasActiveRun });
    if (target === null) {
      sentFrom.current = null;
      return;
    }
    const from = `${view}${window.location.hash}`;
    if (target.kind === 'economics' || target.view !== view) {
      if (sentFrom.current === from) return;
      sentFrom.current = from;
    }
    if (target.kind === 'economics') {
      router.replace(toEconomics(view));
      return;
    }
    if (target.view === view) {
      replaceHashInPlace(target.hash);
      if (target.hash !== BUSINESS_MAP_ID) scrollToWhenThere(target.hash);
      return;
    }
    goTo(target.view, target.hash, true);
  }, [view, hashLayer, hasActiveRun, router, goTo, toEconomics]);

  /** Deterministic, from the branches of the code. No model call (§5.3). */
  const answer: PreAnswered | null = useMemo(
    () =>
      reading
        ? preAnsweredQuestion(
            reading.skeleton,
            reading.ruleSet,
            // With the source, the question and its answer are also worded for a
            // business reader (owner, 03.10.2026); the code stays one fold down.
            typeof project?.legacyCode === 'string' ? project.legacyCode : undefined,
          )
        : null,
    [reading, project?.legacyCode],
  );

  // Rule-based, no model call (roadmap 6.5) — `null` once every phase this
  // product can finish already is, never a step invented to fill the card.
  // The start run of a new project is signed in Analyze, Business since 3.1.0
  // (AB-2), which marks its own "Next step" as running while it is with the server.
  // ADR-094 — "nothing is open" says so when Testing was closed without a pass.
  const nothingOpen = useMemo(() => nothingOpenText(workflowSteps(project)), [project]);
  const nextStep = useMemo(() => nextOpenPoint(project, account), [project, account]);

  const owner = useIsOwner(project);
  const hasSource = typeof project?.legacyCode === 'string' && project.legacyCode.trim().length > 0;
  const { outcome: ruleStates } = useProcessStates(projectId, view === 'management' && hasSource);
  // Management's Need row (owner 12.10.2026): what the program is for, what the
  // decision has to know from the code, and how many of its rules are still
  // open in the rule register — the counts the delivery package says — then
  // the map's counts.
  const tallyEngine = engineVersionOfProject(project);
  const processLine = useMemo(() => {
    const facts = mapSummary?.summaryFacts ?? null;
    const tally = facts ? ruleTallyOf(ruleStates, facts.rules, tallyEngine) : null;
    const management = facts
      ? managementInShort(programSummary(facts), facts, { level: false, rules: tally })
      : mapSummary?.management ?? null;
    return [management, processCount].filter(Boolean).join(' — ') || null;
  }, [mapSummary, ruleStates, processCount, tallyEngine]);
  // A tip that points at nothing is a claim: "Select the decision" exists only
  // where the source has one, and that is not known before the reading lands.
  // The same is now true of "Your next step" — it used to be offered whenever
  // `workflowSummary` named *a* phase, which was always, because that cursor
  // never returns nothing; the tip pointed at the empty space above the card
  // this step just built on a project that had nothing left to do.
  const marks = useCoachMarks({
    hasDecision: answer?.kind === 'answered',
    hasNextStep: nextStep !== null,
    order: view === 'it' ? IT_COACH_ORDER : undefined,
    only: view === 'management' ? MANAGEMENT_COACH_MARKS : view === 'it' ? IT_COACH_ORDER : undefined,
  });

  /**
   * No tip before the reading has settled.
   *
   * Without this the first mark shown is *"This is what we could not
   * determine"* — because "Select the decision" is not yet known to be
   * available — and a frame later it is replaced by the decision tip. A tip
   * that appears and is swapped for another is worse than one that arrives
   * late.
   */
  const marksReady =
    marks.ready &&
    (answer !== null || !(typeof project?.legacyCode === 'string' ? project.legacyCode : '').trim());
  const currentMark = marksReady ? marks.current : null;

  // The plain-language fold of ADR-026. Derived, not written: the row says how
  // many of the seven facets have anything on record at all, which is a fact
  // about this project and not a number borrowed from a mockup.
  const started = statuses.filter((s) => s.status !== 'not-started').length;

  // One header in all three views (owner, 04.10.2026: the IT and Management
  // headers were "far too complex and untidy" beside Business): the meta line
  // behind "Details", the statuses in one folded row, the tools in one bar.
  const metaVisible = detailsOpen;
  const toolsOpen = view === 'it';
  const provenanceStatus = statuses.find((s) => s.facet === 'provenance') ?? null;

  // How many options Economics prices — never an amount (ADR-022); the Costs
  // row of the decision says it (ADR-085 amendment, ADR-087).
  const costScenario = useMemo(() => (project?._economics ? pricedOptions(project._economics) : null), [project]);

  /** The status line and the toolbar with Export and "Invite to view" — in the header. */
  const statusFold = (
    <>
      {/* The project status — one folded row in every view (ADR-026, note
          of 04.10.2026). The fold is a fold: the seven statuses are one click
          away, never removed (§2.11), and each status is its own "Why?". */}
      <div className="mt-3">
        <div
          data-workspace-status-fold=""
          className="rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
              {wt('page.projectStatus')}
            </span>
            <span data-workspace-status-summary className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-cc-ink">
              {/* IT and Management read where the evidence comes from first (ADR-026). */}
              {provenanceStatus ? (
                <span data-workspace-status-summary-provenance="" className="inline-flex items-center gap-2">
                  <CcObjectStatus value={provenanceStatus.status} facet={provenanceStatus.label} />
                  {provenanceStatus.provenance ? <CcProvenanceChip value={provenanceStatus.provenance} /> : null}
                  <span aria-hidden={true} className="text-cc-ink-muted max-[600px]:hidden">·</span>
                </span>
              ) : null}
              <span>{started === 0 ? wt('page.nothingOnRecord') : pageStatusOnRecord(started, statuses.length)}</span>
            </span>
            <span className="cc-no-print ml-auto">
              {/* A fold folds back. */}
              <CcButton onClick={() => setStatusOpen((v) => !v)} aria-expanded={statusOpen} data-workspace-status-toggle="">
                {statusOpen ? wt('page.hideProjectStatus') : wt('page.showProjectStatus')}
                <ChevronDown size={14} aria-hidden={true} className={statusOpen ? 'rotate-180' : undefined} />
              </CcButton>
            </span>
          </div>
          {statusOpen ? (
            <div className="mt-2 border-t border-cc-line pt-2">
              <WorkspaceStatusLine statuses={statuses} projectId={projectId} view={view} />
              <p data-workspace-status-hint="" className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
                {wt('page.statusTapHint')}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
  const toolsRow = (
    <>
      <div id={WORKSPACE_RETURN.tools} className="cc-no-print mt-3 flex flex-wrap items-start justify-between gap-3">
        {/* The tools take the row's width and wrap inside it, so Export and
            "Invite to view" stay beside them instead of under the hint line. */}
        <div className="min-w-0 flex-1 basis-96 max-[600px]:flex-none max-[600px]:basis-auto">
          <WorkspaceToolBar tools={tools} projectId={projectId} view={view} open={toolsOpen} />
        </div>
        {/* Export and "Invite to view" (mockup s1) — in every view: what
            leaves the building and who may read it are not perspectives. */}
        <WorkspaceHeadActions
          project={project}
          projectId={projectId}
          view={view}
          onInvited={() => setAccessKey((n) => n + 1)}
        />
      </div>
    </>
  );
  const statusAndTools = (
    <>
      {statusFold}
      {toolsRow}
    </>
  );

  const openQuestionsList = (
    <OpenQuestions
      questions={questions}
      projectId={projectId}
      view={view}
      owner={owner}
      hasRun={Boolean(project?.activeRunId?.trim()) && project?._runLoadFailed !== true}
      recorded={recorded}
      onAnswered={onAnswered}
    />
  );
  /**
   * Management begins with its answer, above every card (ADR-029, `DESIGN.md`
   * §5.6) — the decision panel, the figures and the answer cards one action
   * deeper. It reads the runs of this project itself, because the history is
   * the one thing the hydrated project does not carry.
   */
  const managementAnswers =
      view === 'management' ? (
        <div className="mt-5">
          <ManagementAnswers
            project={project}
            projectId={projectId}
            decisionRevision={decisionRevision}
            onDecisionChanged={onDecisionChanged}
            beforeWrite={stand.checkBeforeWrite}
            nextStep={nextStep}
            decision={
              // "Open decision" (roadmap 8.4), the first thing in Management and
              // never folded (owner 03.10.2026): what a confirmation would bind,
              // the conditions and the timeline. It writes only through the
              // commands route, so the Stand check of 6.9 hangs off it.
              <div id="decision-card">
                <DecisionCard
                  projectId={projectId}
                  beforeWrite={stand.checkBeforeWrite}
                  onChanged={onDecisionChanged}
                  costScenario={costScenario}
                  revision={decisionRevision}
                  process={processLine}
                />
              </div>
            }
            coach={
              <div className="cc-no-print">
                <CoachMarkNote mark={currentMark} slot="next-step" onDismiss={marks.dismiss} onDismissAll={marks.dismissAll} />
              </div>
            }
            evidenceExtra={
              <>
                <PublicCloudFitPanel project={project} />
                {/* The open questions, in the Evidence fold (ADR-081): the
                    same one list as in Analyze, Business and IT, grouped by the action
                    that resolves each, the engine's lines one click deeper. */}
                <div id="not-determined">{openQuestionsList}</div>
              </>
            }
          />
        </div>
      ) : null;
  /**
   * "Ask this case" in IT (owner decision 22.10.2026): the first ten seconds
   * after the answer (§5.3) — one question already answered, out of the
   * branches of the code and without a model call.
   */
  const askThisCase =
    answer ? (
      <div className="mt-5 max-w-3xl">
        <div className="cc-no-print">
          <CoachMarkNote
            mark={currentMark}
            slot="decision"
            onDismiss={marks.dismiss}
            onDismissAll={marks.dismissAll}
          />
        </div>
        {/* What "Select the decision point" points at; the tip's own slot stays outside it. */}
        <div data-coach-target="decision">
          <AskThisCase answer={answer} />
        </div>
      </div>
    ) : null;
  /** Run & trust and the links out of the IT view (ADR-086). */
  const trust = useMemo(() => runTrust(project), [project]);
  /** The links out of the Management view (ADR-087). */
  const managementOpen = useCallback((target: WorkspaceView, hash: string) => goTo(target, hash, false), [goTo]);
  const itElsewhere = useMemo(
    () => ({
      open: (target: WorkspaceView, hash: string) => goTo(target, hash, false),
      economicsHref: toEconomics('it'),
      deliveryHref: stageHref({ base: `/project/${projectId}`, path: 'delivery', view: 'it', from: WORKSPACE_RETURN.tools }),
    }),
    [goTo, toEconomics, projectId],
  );

  return (
    <div className="cc" data-workspace-shell={view}>
      {/* Search ⌘K — roadmap 6.6. The path and the search button live in the
          shell bar, where §2.1 puts them (block D, D.29): the shell names the
          project from the page's own read and shows the search button while
          this dialog is mounted (`lib/shell-context.ts`). The page's own path
          row and button, which said the same things a few pixels lower, are
          gone. Its own component so the index (elements, rules, findings,
          source lines, glossary) and the dialog stay out of this file. */}
      <CommandSearch projectId={projectId} project={project} reading={reading} />
      {/* Paper gets its own sheet, not this screen (§7.1, mockup s10). */}
      <WorkspacePrintSheet project={project} projectId={projectId} reading={reading} open={open} questions={questions} />

      <section data-workspace-header="">
        {/* The way back to the list — on every width, the phone included,
            where the shell bar has no room for its path. One level above a
            stage's "Back to project workspace" (owner, 03.10.2026: "there is
            no way back to the workspace"), and named differently from it
            (owner, 06.10.2026: "My workspace" is the list of all projects). */}
        <Link
          href="/dashboard"
          data-workspace-back=""
          className={`${BACK_LINK_CLASS} cc-no-print mb-3 max-sm:min-h-11`}
        >
          <ArrowLeft size={16} aria-hidden={true} /> {wt('nav.backToMyWorkspace')}
          <span className="font-medium">
            {' · '}
            {wt('nav.allProjects')}
          </span>
        </Link>
        {/* The way back to the place that asked for a choice made here
            (`?origin=`, `lib/choice-addresses.ts`) — the rules decided from
            the Transformation tool's tips return there (roadmap 3.0.12). */}
        {originBack ? <ChoiceBackLink href={originBack.href} label={originBack.label} /> : null}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          {/* A basis, not only `flex-1`: with a zero basis the title never
              wraps below the view switch and, on a phone, runs under it. */}
          <div className="min-w-0 flex-1 basis-64">
            {/* The eyebrow of mockup s1 — only what the record holds: the file
                the signed run read and the declared target (`lib/workspace-head.ts`). */}
            <p
              data-workspace-eyebrow=""
              className="m-0 mb-1 text-[12px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase"
            >
              {[wt('biz.eyebrowProject'), ...eyebrow].join(' · ')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h1
                data-workspace-title
                className="m-0 text-[22px] leading-tight font-extrabold tracking-[-0.02em] text-cc-ink"
              >
                {project?.name || projectId}
              </h1>
              {/* The Stand, beside the name it belongs to (roadmap 6.9, CR-15).
                  In every view: which revision one is reading is not a
                  perspective, it is the same fact for all three. */}
              <WorkspaceRevisionStand
                held={stand.held}
                seen={stand.seen}
                moved={stand.moved}
                onKeep={stand.keep}
                onRefresh={stand.refresh}
              />
              <span className="cc-no-print">
                <CcButton
                  onClick={() => setDetailsOpen((v) => !v)}
                  aria-expanded={detailsOpen}
                  data-workspace-details-toggle=""
                >
                  {wt('page.details')}
                  <ChevronDown size={14} aria-hidden={true} className={detailsOpen ? 'rotate-180' : undefined} />
                </CcButton>
              </span>
            </div>
            {metaVisible && (
              <div className="mt-2">
                <WorkspaceMetaLine entries={meta} />
              </div>
            )}
          </div>

          <div className="cc-no-print flex shrink-0 flex-col items-start gap-2 max-[600px]:w-full max-[600px]:items-stretch">
            <CcSegmentedControl
              stretch
              label={wt('page.view')}
              value={view}
              onChange={onViewChange}
              segments={WORKSPACE_VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] }))}
            />
            <p
              data-workspace-view-question
              className="m-0 max-w-xs text-[12px] leading-snug font-medium text-cc-ink-muted"
            >
              {VIEW_QUESTIONS[view]}{' '}
              <button
                type="button"
                onClick={() => setAboutOpen((v) => !v)}
                aria-expanded={aboutOpen}
                aria-controls={aboutId}
                data-workspace-view-about-toggle=""
                className="inline-flex min-h-6 items-center font-semibold text-cc-ink underline underline-offset-2"
              >
                {wt('page.aboutThisView')}
              </button>
            </p>
            {/* The paragraph the link opens (`DESIGN.md` §6.1): what the view
                shows and, as pointedly, what it does not. Collapsed by default —
                the one-sentence question above is the thing every reader sees. */}
            {aboutOpen && (
              <p
                id={aboutId}
                data-workspace-view-about=""
                className="m-0 max-w-xs text-[12px] leading-snug font-medium text-cc-ink-muted"
              >
                {VIEW_ABOUT[view]}
              </p>
            )}
            {/* "Read access: only you" and the readers' initials (mockup s1, s9) —
                the owner's line; nothing for an invited reader. */}
            <ReadAccessLine projectId={projectId} refreshKey={accessKey} />
          </div>
        </div>

        {statusAndTools}
      </section>

      {managementAnswers}

      {/* IT's own answer (ADR-029, `DESIGN.md` §5.6: *"the chain belongs to a
          selected finding … and the coverage is stated with it"*) — roadmap 8.1: the
          findings with both catalog views, the level distribution, and the trace
          Requirement → Anchor → Finding → Target draft. Rendered only in that
          view, for the same reason the two Management panels below are: a stub
          of somebody else's answer in the other two views is a promise the page
          does not keep. It reads the findings from its own route, because the
          engine behind them reaches a 4.3 MB catalog that has no business in a
          browser (`lib/first-look.ts`). */}
      {view === 'it' && (
        <div className="mt-5">
          <ItAnswers
            projectId={projectId}
            project={project}
            notDetermined={open}
            questions={questions}
            openQuestions={openQuestionsList}
            signed={Boolean(project?.activeRunId?.trim()) && project?._runLoadFailed !== true}
            trust={trust}
            elsewhere={itElsewhere}
            // The full rule register since the new set-up of the business rules (owner decision 21.10.2026).
            rules={<ItRuleRegister project={project} projectId={projectId} reading={reading} />}
            coach={(slot) => (
              <div className="cc-no-print">
                <CoachMarkNote mark={currentMark} slot={slot} onDismiss={marks.dismiss} onDismissAll={marks.dismissAll} />
              </div>
            )}
            nextStep={
              // One row under the answer, its one primary button on the right.
              // The tour's first tip stands in the flow right above it.
              <div className="mt-4">
                <div className="cc-no-print">
                  <CoachMarkNote
                    mark={currentMark}
                    slot="next-step"
                    form="inline"
                    onDismiss={marks.dismiss}
                    onDismissAll={marks.dismissAll}
                  />
                </div>
                <div data-coach-target="next-step">
                  <NextStepCard point={nextStep} projectId={projectId} view={view} level={3} variant="bar" noneText={nothingOpen} />
                </div>
              </div>
            }
          />
        </div>
      )}

      {/* "Ask this case" in IT (owner decision 22.10.2026): the question already
          answered from the branches of the code, with its anchors — the IT
          reader asks about decision points; Business reads them in the first
          insights and the walk-through. */}
      {view === 'it' ? askThisCase : null}

      {/* Management, under its answer (ADR-087): the place the steering
          one-pager opens in — from the button at the top of the decision card
          and from the Export menu, never a second button here — and the quiet
          row of links out. The process, its rules and "Ask this case" are the
          Business view's, the objects IT's, the amounts Economics', the audit
          pack Delivery's. */}
      {view === 'management' && (
        <div className="mt-4 flex flex-col gap-3">
          <SteeringOnePager project={project} projectId={projectId} />
          <ManagementElsewhere
            open={managementOpen}
            economicsHref={toEconomics('management')}
            deliveryHref={stageHref({ base: `/project/${projectId}`, path: 'delivery', view: 'management', from: WORKSPACE_RETURN.tools })}
          />
        </div>
      )}

      {/* Roadmap 5.5 — "Members on this case" (mockup screen 1/4): who has read
          access, since when, and the revocation. Owner only, and not by hiding
          it: the route behind it answers nobody else, so for a reader the
          section is not rendered at all. */}
      <div id="workspace-access" className="mt-5 max-w-3xl">
        {/* The one writing action on this page, so the Stand check of roadmap
            6.9 hangs off it: a revocation made against a screen that has been
            overtaken is stopped before it is sent, and the reader decides. */}
        <WorkspaceAccessList projectId={projectId} beforeWrite={stand.checkBeforeWrite} />
      </div>

      {/* "Show tips again", where §6.2 puts it: offered once the tips are gone,
          and never a button that undoes nothing. */}
      {marksReady && !marks.anyLeft ? (
        <div className="cc-no-print mt-4">
          <CcButton onClick={marks.reset} data-coach-marks-reset="">
            {wt('page.showTipsAgain')}
          </CcButton>
        </div>
      ) : null}
    </div>
  );
}
