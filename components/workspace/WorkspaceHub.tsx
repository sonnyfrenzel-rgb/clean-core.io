'use client';

import React from 'react';
import { ArrowRight, BarChart3, Code2, Users } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import { cn } from '@/lib/utils';
import { BUSINESS_RULES_ID, requestRuleEditing } from './BusinessRulesEditor';
import type { WorkspaceTool } from './ToolBar';
import type { BusinessNextStep } from '@/lib/business-next-step';
import { nextPhaseKey, PHASE_PURPOSE } from '@/lib/workflow-steps';
import { toolMark, VIEW_LABELS, WORKSPACE_VIEWS, type WorkspaceView } from '@/lib/workspace-model';
import { useWorkspaceLayer } from '@/hooks/useWorkspaceLayer';
import { stageHref, WORKSPACE_RETURN } from '@/lib/workspace-back-href';
import {
  bizNextRulesAction,
  bizNextRulesReason,
  hubNextPosition,
  hubPathDone,
  hubViewLabel,
  wt,
  type WorkspaceMessageKey,
} from '@/lib/workspace-messages';

/** What each audience gets from this one process — the entry cards of the work area. */
const VIEW_GETS: Record<WorkspaceView, WorkspaceMessageKey> = {
  business: 'hub.viewBusinessGets',
  it: 'hub.viewItGets',
  management: 'hub.viewManagementGets',
};

const VIEW_ICON: Record<WorkspaceView, React.ComponentType<{ size?: number; 'aria-hidden'?: boolean; className?: string }>> = {
  business: Users,
  it: Code2,
  management: BarChart3,
};

/**
 * The circle of a tool on the path, in the tool bar's own reading (`toolMark`):
 * the bar's check is green where the phase is done, its half circle the
 * information colour, its dot amber — the strip says the same, never more.
 */
const MARK_CLASS: Record<ReturnType<typeof toolMark>['meaning'], string> = {
  done: 'border-cc-success bg-cc-success-bg text-cc-success',
  started: 'border-cc-information bg-cc-information-bg text-cc-information',
  stale: 'border-cc-warning-mark bg-cc-warning-bg text-cc-warning',
  none: 'border-cc-neutral-border bg-cc-surface text-cc-ink-muted',
};

/**
 * "Work from this process" — the central work area under the map in the
 * Business view (ADR-072).
 *
 * Owner, 06.10.2026 (translated): "After the initial analysis, the box 'Work
 * from this process' must be much more prominent and clearly designed, so that
 * the process gets going and people think beyond the business world — today
 * this box is easy to overlook."
 *
 * A band of its own, in this order: the title with one line of purpose; the
 * concrete next step, the one `lib/business-next-step.ts` decided for "Next
 * step" at the top of the page (rules first while they have no answer, else
 * the next open phase of `lib/workflow-steps.ts`), never a second decision;
 * the three views as entries that say what each audience gets from this
 * process; and the seven tools with their state.
 *
 * The step here is a **secondary** action: the page's main action is in
 * "Next step" (`DESIGN.md` §1.5), and the page keeps exactly one primary
 * (`tests/business-view-clarity.spec.ts`). The band carries no green of its
 * own — green stays with what is proven (§1.1); a tool's position on the path
 * takes the mark the tool bar gives it (`toolMark`), so the two cannot disagree.
 *
 * Every figure is counted from the phase contract; nothing is estimated here.
 */
export default function WorkspaceHub({
  projectId,
  step,
  tools,
  onViewChange,
  toolsRow,
  statusFold,
}: {
  projectId: string;
  /** What "Next step" at the top decided — `null` while it is not known yet. */
  step: BusinessNextStep | null;
  tools: WorkspaceTool[];
  onViewChange: (view: WorkspaceView) => void;
  /** The tool bar with Export and "Invite to view" — the shell's own row. */
  toolsRow: React.ReactNode;
  /** The folded project status — the shell's own fold. */
  statusFold: React.ReactNode;
}) {
  const layer = useWorkspaceLayer();
  const next = nextPhaseKey(tools);
  const done = tools.filter((t) => t.state === 'done').length;

  const nextKey = step === null ? null : step.kind === 'rules' ? 'rules' : step.kind === 'phase' ? step.point.key : 'none';
  const phasePoint = step?.kind === 'phase' ? step.point : step?.kind === 'rules' ? step.then : null;
  const phaseAt = phasePoint ? tools.findIndex((t) => t.key === phasePoint.key) : -1;

  const decideRules = () => {
    document.getElementById(BUSINESS_RULES_ID)?.scrollIntoView({ block: 'start' });
    requestRuleEditing(projectId);
  };

  return (
    <section
      data-workspace-status-tools=""
      data-workspace-hub=""
      aria-labelledby="workspace-hub-title"
      className="mt-6 scroll-mt-20 rounded-cc-card border border-t-4 border-cc-line border-t-cc-ink bg-cc-surface p-4 shadow-cc sm:p-6"
    >
      <p aria-hidden={true} className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
        {wt('hub.eyebrow')}
      </p>
      <h2 id="workspace-hub-title" className="m-0 mt-1 text-[22px] leading-tight font-bold tracking-[-0.01em] text-cc-ink">
        {wt('hub.title')}
      </h2>
      <p className="m-0 mt-1 max-w-3xl text-[14px] leading-snug font-medium text-cc-ink-muted">{wt('hub.lead')}</p>

      {/* The concrete next step — the same one "Next step" at the top names. */}
      <div
        data-workspace-hub-next={nextKey ?? undefined}
        aria-busy={step === null ? true : undefined}
        className="mt-4 flex min-h-[76px] flex-wrap items-center gap-x-4 gap-y-3 rounded-cc-row border border-l-4 border-cc-line border-l-cc-ink bg-cc-surface-muted px-4 py-3"
      >
        <div className="min-w-0 flex-1 basis-72">
          <h3 className="m-0 text-[12px] font-semibold tracking-[0.04em] text-cc-ink-muted uppercase">{wt('hub.nextLabel')}</h3>
          {step === null ? null : step.kind === 'none' ? (
            <p className="m-0 mt-1 text-[15px] leading-snug font-bold text-cc-ink">{wt('hub.nothingOpen')}</p>
          ) : step.kind === 'rules' ? (
            <>
              <p className="m-0 mt-1 text-[15px] leading-snug font-bold text-cc-ink">{wt('biz.nextRulesLabel')}</p>
              <p className="m-0 mt-1 text-[13px] leading-snug font-medium text-cc-ink-muted">
                {bizNextRulesReason(step.open.length, step.total)}
              </p>
            </>
          ) : (
            <>
              <p className="m-0 mt-1 text-[15px] leading-snug font-bold text-cc-ink">{step.point.action}</p>
              <p className="m-0 mt-1 text-[13px] leading-snug font-medium text-cc-ink-muted">
                {phaseAt >= 0 ? `${hubNextPosition(phaseAt + 1, tools.length, step.point.label)} — ` : null}
                {PHASE_PURPOSE[step.point.key]}
              </p>
            </>
          )}
        </div>
        {step?.kind === 'rules' ? (
          <span className="cc-no-print" data-workspace-hub-next-action="">
            <CcButton variant="secondary" density="cozy" onClick={decideRules}>
              {bizNextRulesAction(step.open.length)}
              <ArrowRight size={16} aria-hidden={true} />
            </CcButton>
          </span>
        ) : step?.kind === 'phase' ? (
          <span className="cc-no-print" data-workspace-hub-next-action="">
            <CcLinkButton
              variant="secondary"
              density="cozy"
              href={stageHref({
                base: `/project/${projectId}`,
                path: step.point.path,
                view: 'business',
                from: WORKSPACE_RETURN.tools,
                layer,
              })}
            >
              {step.point.action}
              <ArrowRight size={16} aria-hidden={true} />
            </CcLinkButton>
          </span>
        ) : null}
      </div>

      {/* The three views — one process, three readers. */}
      <h3 className="m-0 mt-5 text-[13px] font-bold text-cc-ink">{wt('hub.viewsTitle')}</h3>
      <ul className="m-0 mt-2 grid list-none grid-cols-1 gap-2 p-0 min-[700px]:grid-cols-3">
        {WORKSPACE_VIEWS.map((v) => {
          const Icon = VIEW_ICON[v];
          const here = v === 'business';
          const body = (
            <>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden={true}
                  className={cn(
                    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    here ? 'bg-cc-ink text-cc-on-dark' : 'border border-cc-line bg-cc-surface text-cc-ink',
                  )}
                >
                  <Icon size={16} aria-hidden={true} />
                </span>
                <span className="text-[15px] font-bold text-cc-ink">{VIEW_LABELS[v]}</span>
                {here ? (
                  <span className="ml-auto rounded-[4px] border border-cc-ink px-2 text-[11px] leading-5 font-semibold text-cc-ink">
                    {wt('hub.viewHere')}
                  </span>
                ) : null}
              </span>
              <span className="mt-2 block text-[13px] leading-snug font-medium text-cc-ink-muted">{wt(VIEW_GETS[v])}</span>
              {here ? null : (
                <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[13px] font-semibold text-cc-ink underline-offset-2 group-hover:underline">
                  {hubViewLabel(VIEW_LABELS[v])}
                  <ArrowRight size={14} aria-hidden={true} />
                </span>
              )}
            </>
          );
          return (
            <li key={v} className="flex min-w-0">
              {here ? (
                <div
                  data-workspace-hub-view={v}
                  aria-current="true"
                  className="flex w-full min-w-0 flex-col rounded-cc-row border-2 border-cc-ink bg-cc-surface px-3 py-3"
                >
                  {body}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onViewChange(v)}
                  data-workspace-hub-view={v}
                  className="group cc-no-print flex min-h-11 w-full min-w-0 flex-col items-stretch rounded-cc-row border border-cc-field-border px-3 py-3 text-left hover:border-cc-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* The seven tools. From L up the tool bar is the path, each tool with
          its mark; below it the bar folds into a menu, so the path stands here
          as a strip — counted from the phase contract, the next one ringed. */}
      <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="m-0 text-[13px] font-bold text-cc-ink">{wt('hub.toolsTitle')}</h3>
        <span data-workspace-hub-path-done={done} className="text-[12px] font-medium text-cc-ink-muted">
          {hubPathDone(done, tools.length)}
        </span>
      </div>
      <ol
        data-workspace-hub-path=""
        aria-label={wt('hub.pathLabel')}
        className="m-0 mt-2 flex list-none items-center gap-1 p-0 min-[1025px]:hidden"
      >
        {tools.map((t, i) => {
          const mark = toolMark(t);
          const isNext = t.key === next;
          return (
            <li
              key={t.key}
              data-workspace-hub-stage={t.key}
              data-phase-state={t.state}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <span
                aria-hidden={true}
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-full border-2 text-[12px] font-bold',
                  MARK_CLASS[mark.meaning],
                  isNext && 'outline-2 outline-offset-2 outline-cc-ink',
                )}
              >
                {i + 1}
              </span>
              <span
                aria-hidden={true}
                className={cn('w-full truncate text-center text-[11px] leading-tight', isNext ? 'font-bold text-cc-ink' : 'font-medium text-cc-ink-muted')}
              >
                {t.label}
              </span>
              <span className="sr-only">
                {`${t.label}: ${mark.words ? wt(mark.words) : wt('hub.stageNone')}${isNext ? `, ${wt('hub.stageNext')}` : ''}`}
              </span>
            </li>
          );
        })}
      </ol>
      {toolsRow}
      {statusFold}
    </section>
  );
}
