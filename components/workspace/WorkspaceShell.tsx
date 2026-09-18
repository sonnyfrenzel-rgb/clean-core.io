'use client';

import React, { useCallback, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import WorkspaceMetaLine from './MetaLine';
import WorkspaceStatusLine from './StatusLine';
import WorkspaceLayerBar from './LayerBar';
import WorkspaceToolBar from './ToolBar';
import NotDeterminedCard from './NotDeterminedCard';
import NextStepCard from './NextStepCard';
import PublicCloudFitPanel from './PublicCloudFitPanel';
import FirstLook from './FirstLook';
import AskThisCase from './AskThisCase';
import CoachMarkNote from './CoachMarks';
import WorkspaceAccessList from './AccessList';
import CommandSearch from './CommandSearch';
import { useCoachMarks } from '@/hooks/useCoachMarks';
import { preAnsweredQuestion, type PreAnswered } from '@/lib/ask-this-case';
import type { SourceReading } from '@/lib/first-look';
import { nextOpenPoint } from '@/lib/next-step';
import type { ModelStageSubject } from '@/lib/model-stages';
import {
  IT_FOCUS_LABELS,
  IT_FOCUS_OPTIONS,
  LAYERS,
  VIEW_ABOUT,
  VIEW_LABELS,
  VIEW_QUESTIONS,
  WORKSPACE_VIEWS,
  metaLine,
  notDetermined,
  workspaceLayers,
  workspaceStatusLine,
  workspaceTools,
  type ItFocus,
  type LayerKey,
  type WorkspaceView,
} from '@/lib/workspace-model';
import type { Project } from '@/lib/types';

/**
 * The Object Page of a project — `DESIGN.md` §2.3, roadmap step 1.4.
 *
 * Header, status line, toolbar, anchor bar, and the one section this step
 * builds: *Not determined*. It **opens in the Business view** (ADR-002), and
 * everything it says about the project is derived in `lib/workspace-model.ts`
 * so that the honesty of it is testable in one place rather than seven.
 *
 * **The header is not the same in all three views** (ADR-026, ADR-037). In
 * Business the content leads: the meta line sits behind "Details" and the seven
 * statuses fold into one plain-language "Project status" row, because
 * "Traceability" and "catalog releaseInfo fb0df9f2" ask for knowledge a process
 * owner does not have and cost the line that mattered. In IT everything is
 * open, including the toolbar. In Management the statuses are open and the meta
 * line is not.
 *
 * **Three navigations, three jobs** (ADR-018). The view orders the same content
 * and lives in `?view=`; the layer jumps within this page and lives in the URL
 * fragment; a tool opens a stage as its own page. None of the three is a
 * progress indicator, and a view in the URL is a perspective and never a grant
 * — this component renders one project that the reader could already open.
 *
 * **"Next step"** (roadmap 6.5) is the one card here with a `primary` button —
 * *"die Hauptaktion der Seite steht in „Next step""* (`DESIGN.md` §1.5) — and
 * it renders `lib/next-step.ts`'s answer without adding an opinion of its own.
 * What is still deliberately **not** here: the process map, the rules, the
 * reveal line. Those are phase 2 of the roadmap. A shell that showed
 * placeholders for them would be the exact failure the *Not determined* area
 * exists to rule out.
 */
export default function WorkspaceShell({
  project,
  projectId,
  view,
  onViewChange,
  focus,
  onFocusChange,
  account,
  buildUp = false,
}: {
  project: Project | null;
  projectId: string;
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  /**
   * IT's secondary focus (roadmap 6.1) — Application · Solution · Enterprise.
   * Meaningless outside IT, and not read there either: nothing yet scopes to
   * it, because the layers that would (findings, roadmap 8.1) are not built.
   * It is ordering infrastructure, held the same way the view is, ahead of the
   * content it will one day order.
   */
  focus: ItFocus;
  onFocusChange: (focus: ItFocus) => void;
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
  /**
   * Whether the first look builds itself up in four stages (`DESIGN.md` §5.2)
   * or goes straight to its end state. True after an import or an example, and
   * never on a second visit — *„Ein zweiter Besuch hat keinen Aufbau"*. The
   * decision is the route's, because it is the route that knows where the
   * reader came from.
   */
  buildUp?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [layer, setLayer] = useState<LayerKey>(LAYERS[0]);
  const aboutId = useId();

  const meta = useMemo(() => metaLine(project, projectId), [project, projectId]);
  const statuses = useMemo(() => workspaceStatusLine(project), [project]);
  const layers = useMemo(() => workspaceLayers(project), [project]);
  const tools = useMemo(() => workspaceTools(project), [project]);
  const open = useMemo(() => notDetermined(project), [project]);

  /**
   * The reading of the source, done once by the first look and handed up here.
   *
   * Not read a second time: `readSource` walks every statement of the source,
   * and a second walk in this component would be a second set of line numbers
   * for the same `IF` — the thing `lib/abap/process-facts.ts` exists to prevent
   * — as well as the parse paid for twice.
   */
  const [reading, setReading] = useState<SourceReading | null>(null);
  const onReading = useCallback((next: SourceReading) => setReading(next), []);

  /** Deterministic, from the branches of the code. No model call (§5.3). */
  const answer: PreAnswered | null = useMemo(
    () => (reading ? preAnsweredQuestion(reading.skeleton, reading.ruleSet) : null),
    [reading],
  );

  // Rule-based, no model call (roadmap 6.5) — `null` once every phase this
  // product can finish already is, never a step invented to fill the card.
  const nextStep = useMemo(() => nextOpenPoint(project, account), [project, account]);

  // A tip that points at nothing is a claim: "Select the decision" exists only
  // where the source has one, and that is not known before the reading lands.
  // The same is now true of "Your next step" — it used to be offered whenever
  // `workflowSummary` named *a* phase, which was always, because that cursor
  // never returns nothing; the tip pointed at the empty space above the card
  // this step just built on a project that had nothing left to do.
  const marks = useCoachMarks({
    hasDecision: answer?.kind === 'answered',
    hasNextStep: nextStep !== null,
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
  const marksReady = marks.ready && (answer !== null || !(project?.legacyCode ?? '').trim());
  const currentMark = marksReady ? marks.current : null;

  // The plain-language fold of ADR-026. Derived, not written: the row says how
  // many of the seven facets have anything on record at all, which is a fact
  // about this project and not a number borrowed from a mockup.
  const started = statuses.filter((s) => s.status !== 'not-started').length;

  // Business folds the meta line and the statuses away; IT opens both; Management
  // opens the statuses only.
  const metaVisible = view === 'it' || detailsOpen;
  const statusVisible = view === 'it' || view === 'management' || statusOpen;
  const toolsOpen = view === 'it';

  const currentLayer = layers.some((l) => l.key === layer && l.count !== null)
    ? layer
    : (layers.find((l) => l.count !== null)?.key ?? LAYERS[0]);

  return (
    <div className="cc" data-workspace-shell={view}>
      {/* Path — Shell Bar, §2.1. The workspace is one level above the case. */}
      <div className="flex items-center justify-between gap-3">
        <nav aria-label="Path" className="flex items-center gap-1 text-[12px] font-medium text-cc-ink-muted">
          <Link href="/dashboard" className="text-cc-ink-muted no-underline hover:text-cc-ink">
            My workspace
          </Link>
          <ChevronRight size={14} aria-hidden={true} />
          <span data-workspace-path-current className="font-semibold text-cc-ink">
            {project?.name || projectId}
          </span>
        </nav>
        {/* Search ⌘K — §2.1's Shell Bar slot, roadmap 6.6. Its own component so
            the index (elements, rules, findings, source lines, glossary) and the
            dialog stay out of an already busy file. */}
        <CommandSearch projectId={projectId} project={project} reading={reading} />
      </div>

      <section data-workspace-header="" className="mt-3">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                data-workspace-title
                className="m-0 text-[22px] leading-tight font-extrabold tracking-[-0.02em] text-cc-ink"
              >
                {project?.name || projectId}
              </h1>
              {view !== 'it' && (
                <CcButton
                  onClick={() => setDetailsOpen((v) => !v)}
                  aria-expanded={detailsOpen}
                  data-workspace-details-toggle=""
                >
                  Details
                  <ChevronDown size={14} aria-hidden={true} />
                </CcButton>
              )}
            </div>
            {metaVisible && (
              <div className="mt-2">
                <WorkspaceMetaLine entries={meta} />
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-start gap-1.5">
            <CcSegmentedControl
              label="View"
              value={view}
              onChange={onViewChange}
              segments={WORKSPACE_VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] }))}
            />
            {/* IT's secondary focus (roadmap 6.1, mockup `s4`) — meaningless in
                the other two views, so it exists only where it means something
                rather than sitting disabled beside them. Nothing reads it yet
                (the layers it would scope are later roadmap steps); it is
                ordering infrastructure, held the same way the view is. */}
            {view === 'it' && (
              <div className="flex items-center gap-1.5" data-workspace-it-focus="">
                <span className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
                  Focus
                </span>
                <CcSegmentedControl
                  label="Focus"
                  value={focus}
                  onChange={onFocusChange}
                  segments={IT_FOCUS_OPTIONS.map((f) => ({ value: f, label: IT_FOCUS_LABELS[f] }))}
                />
              </div>
            )}
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
                About this view
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
          </div>
        </div>

        {/* The status line — open in IT and Management, one folded row in
            Business (ADR-026). The fold is a fold: the statuses are one click
            away, never removed (§2.11). */}
        <div className="mt-4">
          {view === 'business' && !statusOpen ? (
            <div
              data-workspace-status-fold=""
              className="flex flex-wrap items-center gap-2.5 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2"
            >
              <span className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
                Project status
              </span>
              <span data-workspace-status-summary className="text-[13px] font-medium text-cc-ink">
                {started === 0
                  ? 'Nothing on record yet for any of the seven'
                  : `${started} of ${statuses.length} have something on record`}
              </span>
              <span className="ml-auto">
                <CcButton onClick={() => setStatusOpen(true)} aria-expanded={false}>
                  Show project status
                  <ChevronDown size={14} aria-hidden={true} />
                </CcButton>
              </span>
            </div>
          ) : null}
          {statusVisible && <WorkspaceStatusLine statuses={statuses} />}
        </div>

        <div className="mt-4">
          <WorkspaceToolBar tools={tools} projectId={projectId} open={toolsOpen} />
        </div>
      </section>

      <div className="mt-5">
        <WorkspaceLayerBar layers={layers} current={currentLayer} onSelect={setLayer} />
        {/* "Your next step" — the coach mark now points at a real card rather
            than the empty space above it (roadmap 6.5, `lib/next-step.ts`). */}
        <div className="mt-2">
          <CoachMarkNote
            mark={currentMark}
            slot="next-step"
            onDismiss={marks.dismiss}
            onDismissAll={marks.dismissAll}
          />
        </div>
      </div>

      {/* The rule-based "next step" (`DESIGN.md` §2.3 item 5, §5.5, roadmap
          6.5) — the next open point in the one phase contract every other view
          already reads, or the plain statement that nothing is open. No model
          call: `lib/next-step.ts` is pure, and `tests/next-step.spec.ts` proves
          it never reaches the Gemini proxy. */}
      <div className="mt-5 max-w-3xl">
        <NextStepCard point={nextStep} projectId={projectId} />
      </div>

      {/* The first look — four stages, then the head of the content (§5.1, §5.5):
          process name, traceability, the reveal line and the decisions. */}
      <div className="mt-5">
        <FirstLook
          project={project}
          projectId={projectId}
          buildUp={buildUp}
          onReading={onReading}
        />
      </div>

      {/* The first ten seconds after it (§5.3): one question already answered,
          out of the branches of the code and without a model call. */}
      {answer ? (
        <div className="mt-5 max-w-3xl">
          <CoachMarkNote
            mark={currentMark}
            slot="decision"
            onDismiss={marks.dismiss}
            onDismissAll={marks.dismissAll}
          />
          <AskThisCase answer={answer} />
        </div>
      ) : null}

      {/* Everything the engine could not work out, with its reason — the reason
          to trust the rest of the screen (roadmap 1.4). */}
      <div className="mt-5 max-w-3xl">
        <CoachMarkNote
          mark={currentMark}
          slot="not-determined"
          onDismiss={marks.dismiss}
          onDismissAll={marks.dismissAll}
        />
        <NotDeterminedCard data={open} />
      </div>

      {/* Public-Cloud-Fit and the four buckets (roadmap 6.7, `DESIGN.md` §5.6) —
          Management's own answer, so it renders only there rather than a stub
          appearing in the other two views ahead of its content. */}
      {view === 'management' && (
        <div className="mt-5 max-w-3xl">
          <PublicCloudFitPanel project={project} />
        </div>
      )}

      {/* Roadmap 5.5 — "Members on this case" (mockup screen 1/4): who has read
          access, since when, and the revocation. Owner only, and not by hiding
          it: the route behind it answers nobody else, so for a reader the
          section is not rendered at all. */}
      <div className="mt-5 max-w-3xl">
        <WorkspaceAccessList projectId={projectId} />
      </div>

      {/* "Show tips again", where §6.2 puts it: offered once the tips are gone,
          and never a button that undoes nothing. */}
      {marksReady && !marks.anyLeft ? (
        <div className="mt-4">
          <CcButton onClick={marks.reset} data-coach-marks-reset="">
            Show tips again
          </CcButton>
        </div>
      ) : null}
    </div>
  );
}
