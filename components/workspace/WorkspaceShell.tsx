'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import WorkspaceMetaLine from './MetaLine';
import WorkspaceStatusLine from './StatusLine';
import WorkspaceLayerBar from './LayerBar';
import WorkspaceToolBar from './ToolBar';
import NotDeterminedCard from './NotDeterminedCard';
import FirstLook from './FirstLook';
import AskThisCase from './AskThisCase';
import CoachMarkNote from './CoachMarks';
import { useCoachMarks } from '@/hooks/useCoachMarks';
import { preAnsweredQuestion, type PreAnswered } from '@/lib/ask-this-case';
import type { SourceReading } from '@/lib/first-look';
import { workflowSteps, workflowSummary } from '@/lib/workflow-steps';
import {
  LAYERS,
  VIEW_LABELS,
  VIEW_QUESTIONS,
  WORKSPACE_VIEWS,
  metaLine,
  notDetermined,
  workspaceLayers,
  workspaceStatusLine,
  workspaceTools,
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
 * What is deliberately **not** here: the process map, the rules, the reveal
 * line, "Next step". Those are phases 2 and 6 of the roadmap. A shell that
 * showed placeholders for them would be the exact failure the *Not determined*
 * area exists to rule out.
 */
export default function WorkspaceShell({
  project,
  projectId,
  view,
  onViewChange,
  buildUp = false,
}: {
  project: Project | null;
  projectId: string;
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
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
  const [layer, setLayer] = useState<LayerKey>(LAYERS[0]);

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

  const nextPhase = useMemo(() => workflowSummary(workflowSteps(project)).next, [project]);

  // A tip that points at nothing is a claim: "Select the decision" exists only
  // where the source has one, and that is not known before the reading lands.
  const marks = useCoachMarks({
    hasDecision: answer?.kind === 'answered',
    hasNextStep: Boolean(nextPhase),
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
      <nav aria-label="Path" className="flex items-center gap-1 text-[12px] font-medium text-cc-ink-muted">
        <Link href="/dashboard" className="text-cc-ink-muted no-underline hover:text-cc-ink">
          My workspace
        </Link>
        <ChevronRight size={14} aria-hidden={true} />
        <span data-workspace-path-current className="font-semibold text-cc-ink">
          {project?.name || projectId}
        </span>
      </nav>

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
            <p
              data-workspace-view-question
              className="m-0 max-w-xs text-[12px] leading-snug font-medium text-cc-ink-muted"
            >
              {VIEW_QUESTIONS[view]}
            </p>
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
        {/* "Your next step" — the phase `lib/workflow-steps.ts` says comes next
            for this project, never a fixed one. */}
        <div className="mt-2">
          <CoachMarkNote
            mark={currentMark}
            slot="next-step"
            onDismiss={marks.dismiss}
            onDismissAll={marks.dismissAll}
          />
        </div>
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
