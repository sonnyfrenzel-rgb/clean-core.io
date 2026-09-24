'use client';

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import WorkspaceMetaLine from './MetaLine';
import WorkspaceStatusLine from './StatusLine';
import WorkspaceLayerBar from './LayerBar';
import WorkspaceLayerSection from './LayerSection';
import WorkspaceToolBar from './ToolBar';
import NotDeterminedCard from './NotDeterminedCard';
import NextStepCard from './NextStepCard';
import PublicCloudFitPanel from './PublicCloudFitPanel';
import ManagementAnswers from './ManagementAnswers';
import ItAnswers from './ItAnswers';
import DecisionCard from './DecisionCard';
import SteeringOnePager from './SteeringOnePager';
import FirstLook from './FirstLook';
import AskThisCase from './AskThisCase';
import CoachMarkNote from './CoachMarks';
import WorkspaceAccessList from './AccessList';
import WorkspaceRevisionStand from './RevisionStand';
import CommandSearch from './CommandSearch';
import { useCoachMarks } from '@/hooks/useCoachMarks';
import { useWorkspaceRevision } from '@/hooks/useWorkspaceRevision';
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
  layerFromHash,
  metaLine,
  notDetermined,
  workspaceLayers,
  workspaceStatusLine,
  workspaceTools,
  type ItFocus,
  type LayerKey,
  type WorkspaceView,
} from '@/lib/workspace-model';
import { recordGaps } from '@/lib/legacy-project';
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
   * Meaningless outside IT, and still not read there: roadmap 8.1 built the
   * findings the Focus would scope, and scoping them is a separate step that
   * needs a notion of what an Application, a Solution and an Enterprise are on
   * a project that holds one program. It is ordering infrastructure, held the
   * same way the view is, ahead of the content it will one day order — and
   * `VIEW_ABOUT.it` says so rather than letting the control imply otherwise.
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
  /** Bumped by the Decision card after each command, so the overview above it rereads the decision. */
  const [decisionRevision, setDecisionRevision] = useState(0);
  const onDecisionChanged = useCallback(() => setDecisionRevision((n) => n + 1), []);
  const aboutId = useId();

  /**
   * The layer lives in the URL fragment and nowhere else (ADR-018, roadmap
   * 6.2): *„Ebene … gehalten in URL-Fragment (`#need`)"*.
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
   * "und Browser" half of the roadmap line — and it is the *browser's* history,
   * not a preference stored anywhere.
   */
  const [hashLayer, setHashLayer] = useState<LayerKey | null>(null);
  useEffect(() => {
    const read = () => setHashLayer(layerFromHash(window.location.hash));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const selectLayer = useCallback((next: LayerKey) => {
    // Assigning the hash is a history entry, the same as the view's `push`, so
    // Back returns to the layer the reader came from. Nothing is written: this
    // is the address bar, not Firestore — and a view or a layer on a stored
    // artefact is the one thing `docs/ROADMAP.md` forbids outright.
    window.location.hash = next;
    setHashLayer(next);
  }, []);

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
  const statuses = useMemo(() => workspaceStatusLine(project), [project]);
  const layers = useMemo(() => workspaceLayers(project), [project]);
  const tools = useMemo(() => workspaceTools(project), [project]);
  const open = useMemo(() => notDetermined(project), [project]);
  // What a project stored by an earlier version does not carry (roadmap 3.0.2).
  // Read, never repaired: opening a project writes nothing to it.
  const recorded = useMemo(() => recordGaps(project), [project]);

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
  const marksReady =
    marks.ready && (answer !== null || !(typeof project?.legacyCode === 'string' ? project.legacyCode : '').trim());
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

  // The reader's own choice wins, empty or not — an empty layer opened from
  // "More" is a place, and saying so is the whole of roadmap 6.2. Without a
  // choice the bar opens on the first layer that has anything in it, and on a
  // project where nothing does, on the first layer, which then says it is empty.
  const currentLayer = hashLayer ?? layers.find((l) => l.count !== null)?.key ?? LAYERS[0];
  const currentLayerSection = layers.find((l) => l.key === currentLayer) ?? layers[0];

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
          {statusVisible && <WorkspaceStatusLine statuses={statuses} projectId={projectId} />}
        </div>

        <div className="mt-4">
          <WorkspaceToolBar tools={tools} projectId={projectId} open={toolsOpen} />
        </div>
      </section>

      <div className="mt-5">
        <WorkspaceLayerBar layers={layers} current={currentLayer} onSelect={selectLayer} />
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

      {/* The content of the chosen layer (`DESIGN.md` §2.3 item 5, roadmap
          6.2). Below "Next step", because the page keeps one primary action
          and it is that card (§1.5); the anchor bar above scrolls the reader
          here by the section's own `id`. */}
      <div className="mt-5 max-w-3xl">
        <WorkspaceLayerSection layer={currentLayerSection} />
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
      <div id="not-determined" className="mt-5 max-w-3xl">
        <CoachMarkNote
          mark={currentMark}
          slot="not-determined"
          onDismiss={marks.dismiss}
          onDismissAll={marks.dismissAll}
        />
        <NotDeterminedCard data={open} recorded={recorded} />
      </div>

      {/* IT's own answer (ADR-029, `DESIGN.md` §5.6: *"die Kette gehört zu einem
          gewählten Befund … und die Abdeckung steht dabei"*) — roadmap 8.1: the
          findings with both catalog views, the level distribution, and the trace
          Requirement → Anchor → Finding → Target draft. Rendered only in that
          view, for the same reason the two Management panels below are: a stub
          of somebody else's answer in the other two views is a promise the page
          does not keep. It reads the findings from its own route, because the
          engine behind them reaches a 4.3 MB catalog that has no business in a
          browser (`lib/first-look.ts`). */}
      {view === 'it' && (
        <div className="mt-5">
          <ItAnswers projectId={projectId} />
        </div>
      )}

      {/* Management begins with its answer, above every card (ADR-029,
          `DESIGN.md` §5.6: *"Management beginnt mit einem Satz über allen
          Karten, der die Frage der Sicht beantwortet"*) — roadmap 6.4, moved
          here from the route by roadmap 6.10. What is confirmed, what is
          missing, what a decision would bind, and the Clean Core Score with its
          rule version and history. Rendered only in that view, for the same
          reason the Public-Cloud-Fit panel below is: a stub of somebody else's
          answer in the other two views is a promise the page does not keep. It
          reads the runs of this project itself, because the history is the one
          thing the hydrated project does not carry. */}
      {view === 'management' && (
        <div className="mt-5 max-w-3xl">
          <ManagementAnswers project={project} projectId={projectId} decisionRevision={decisionRevision} />
        </div>
      )}

      {/* The steering one-pager (roadmap 8.6, mockup screen 5: "Steering
          one-pager" in Management's tool row) — figures only, each with its
          coverage and a link to its evidence, and a "Not determined" column.
          A view like Management itself: derived when opened, never stored,
          not part of the signed audit pack; printed through the browser.
          Placed after the answer, not above it: Management begins with its
          answer sentence (ADR-029). */}
      {view === 'management' && (
        <div className="mt-5 max-w-3xl">
          <SteeringOnePager project={project} projectId={projectId} />
        </div>
      )}

      {/* Public-Cloud-Fit and the four buckets (roadmap 6.7, `DESIGN.md` §5.6) —
          Management's own answer, so it renders only there rather than a stub
          appearing in the other two views ahead of its content. */}
      {view === 'management' && (
        <div className="mt-5 max-w-3xl">
          <PublicCloudFitPanel project={project} />
        </div>
      )}

      {/* "Open decision" (roadmap 8.4, mockup screen 5) — what a confirmation
          would bind, reversible or not, the conditions and the folded timeline.
          Management's answer to "what do I decide?", so it renders only there.
          It derives the draft through its own route (the contract behind it
          reaches the SAP catalog) and writes only through the commands route;
          the confirmation is a write, so the Stand check of 6.9 hangs off it. */}
      {view === 'management' && (
        <div id="decision-card" className="mt-5 max-w-3xl">
          <DecisionCard projectId={projectId} beforeWrite={stand.checkBeforeWrite} onChanged={onDecisionChanged} />
        </div>
      )}

      {/* Roadmap 5.5 — "Members on this case" (mockup screen 1/4): who has read
          access, since when, and the revocation. Owner only, and not by hiding
          it: the route behind it answers nobody else, so for a reader the
          section is not rendered at all. */}
      <div className="mt-5 max-w-3xl">
        {/* The one writing action on this page, so the Stand check of roadmap
            6.9 hangs off it: a revocation made against a screen that has been
            overtaken is stopped before it is sent, and the reader decides. */}
        <WorkspaceAccessList projectId={projectId} beforeWrite={stand.checkBeforeWrite} />
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
