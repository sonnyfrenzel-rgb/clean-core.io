'use client';

import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Check, ChevronDown, Wrench } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import { cn } from '@/lib/utils';
import { PHASE_TONE_CLASS, type PhaseKey, type PhaseState } from '@/lib/workflow-steps';
import { toolMark, type WorkspaceView } from '@/lib/workspace-model';
import { useWorkspaceLayer } from '@/hooks/useWorkspaceLayer';
import { stageHref, WORKSPACE_RETURN, type WorkspaceReturnPoint } from '@/lib/workspace-back-href';
import { wt } from '@/lib/workspace-messages';

export interface WorkspaceTool {
  key: PhaseKey;
  label: string;
  path: string;
  /** From `workflowSteps` — the stepper's reading of this phase, never a client-set status. */
  state: PhaseState;
  proven: boolean;
}

/**
 * The small mark after a tool's name: what is on record for that stage, said
 * the way the stepper says it (`components/Stepper.tsx`), because two surfaces
 * that read one phase differently is roadmap 1.7 all over again.
 *
 *   - a tick where the stepper ticks (`done`), in the stepper's tone: green
 *     only where something verified it (`proven`, DESIGN.md §1.1 "green says
 *     proven"), amber where it is on record and nothing did;
 *   - a dot where the stepper shows a coloured circle without a tick: amber for
 *     started-not-done, the darker warning for out of date (stale is never done);
 *   - nothing where nothing is on record.
 *
 * The colour is never the only carrier: each mark has its words for a screen
 * reader, appended to the link's name.
 */
function ToolMark({ tool }: { tool: WorkspaceTool }) {
  const mark = toolMark(tool);
  if (mark.kind === 'none' || !mark.words) return null;
  const paint = PHASE_TONE_CLASS[mark.tone];
  const words = wt(mark.words);
  return (
    <>
      {mark.kind === 'check' ? (
        <Check size={14} strokeWidth={3} aria-hidden={true} data-workspace-tool-mark="check" className={paint.ink} />
      ) : (
        <span aria-hidden={true} data-workspace-tool-mark="dot" className={cn('inline-block h-2 w-2 rounded-full', paint.fill)} />
      )}
      <span className="sr-only">({words})</span>
    </>
  );
}

/**
 * The seven stages as tools — under the workspace header (`DESIGN.md` §2.3
 * item 3) and under "Back to workspace" on every stage (ADR-060). One
 * component for both, so the two bars cannot drift apart.
 *
 *   - **It opens pages, and it says what is on record** (ADR-060, Sonny
 *     02.10.2026). A tool opens a stage as its own page; the mark after its
 *     name is the stepper's reading of that phase (`ToolMark`), derived from
 *     `lib/workflow-steps.ts` like every other phase state in the product — so
 *     the bar and the stepper cannot disagree about one phase. On a stage the
 *     tool of that stage is the current one (`aria-current="page"`, ink, never
 *     green: being on a page is not evidence); in the workspace none is.
 *   - **It is not a waterfall.** Every stage is reachable at any time, which is
 *     what `lib/workflow-steps.ts` has always said and what a row of seven
 *     equally available links shows without a sentence.
 *
 * Laid out by width (§2.9, ADR-060): from breakpoint L (> 1024 px) the seven
 * stand side by side, no menu to open. Below that, Business and Management and
 * the stages fold them into a "Tools" menu (§2.11, ADR-026); the workspace's IT
 * view keeps the open bar down to M, where it wraps rather than scrolls. On a
 * phone (S) it is the menu everywhere.
 */
function ToolsNav({
  tools,
  link,
  current,
  open,
  surface,
}: {
  tools: WorkspaceTool[];
  /** Everything of a tool's address but its path — every link goes through `stageHref`. */
  link: Omit<Parameters<typeof stageHref>[0], 'path'>;
  /** The stage the reader is on; none in the workspace. */
  current?: PhaseKey;
  /** Open from M up (the workspace's IT view); otherwise only from L up. */
  open: boolean;
  surface: 'workspace' | 'stage';
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Escape closes the panel and hands the focus back to "Tools" (roadmap
  // 3.0.4). It is a disclosure, not an ARIA `menu`: a `role="menu"` promises
  // arrow-key navigation over `menuitem`s, and seven plain links under it were
  // announced as a menu that then did not behave like one.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuRef.current?.querySelector<HTMLButtonElement>('button[aria-controls]')?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const links = tools.map((tool) => {
    const mark = toolMark(tool);
    return (
      <CcLinkButton
        key={tool.key}
        data-workspace-tool={tool.key}
        data-phase-state={tool.state}
        data-phase-tone={mark.tone}
        data-workspace-tool-mark-kind={mark.kind}
        current={tool.key === current}
        href={stageHref({ ...link, path: tool.path })}
      >
        {tool.label}
        <ToolMark tool={tool} />
      </CcLinkButton>
    );
  });

  // Hidden by width, so the open bar and the menu are never both reachable at
  // once. Open: the bar from 601 px, the menu on a phone (§2.9). Otherwise the
  // bar from 1025 px (breakpoint L), the menu below it.
  const barHidden = open ? 'max-[600px]:hidden' : 'max-[1024px]:hidden';
  const menuHidden = open ? 'min-[601px]:hidden' : 'min-[1025px]:hidden';
  const hook = (value: 'open' | 'menu') =>
    surface === 'workspace' ? { 'data-workspace-tools': value } : { 'data-stage-tools': value };

  return (
    <>
      <nav
        {...hook('open')}
        aria-label={wt('tools.label')}
        className={cn('cc-no-print flex flex-wrap items-center gap-2', barHidden)}
      >
        <span aria-hidden={true} className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
          {wt('tools.label')}
        </span>
        {links}
      </nav>
      <div ref={menuRef} {...hook('menu')} className={cn('relative cc-no-print', menuHidden)}>
        <CcButton
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? panelId : undefined}
          icon={<Wrench size={16} aria-hidden={true} />}
        >
          {wt('tools.label')}
          <ChevronDown size={14} aria-hidden={true} />
        </CcButton>
        {menuOpen && (
          <div
            id={panelId}
            data-workspace-tools-panel=""
            className="absolute left-0 z-20 mt-1 flex w-64 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-3 shadow-cc-dialog"
          >
            {links}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * The workspace's bar. Every tool carries the view it was opened from and this
 * bar as its origin (`?view=…&from=workspace-tools`, block D D.29), so the
 * stage's "Back to workspace" returns to the same view and to the bar, not to
 * the Business view at the top of the page.
 */
export default function WorkspaceToolBar({
  tools,
  projectId,
  view,
  open,
}: {
  tools: WorkspaceTool[];
  projectId: string;
  /** The view the reader is in — carried into each stage for the way back. */
  view: WorkspaceView;
  /** IT lays them out from M up; Business and Management only from L up. */
  open: boolean;
}) {
  // The layer the reader is in travels with the link, so the way back returns to it.
  const layer = useWorkspaceLayer();
  return (
    <ToolsNav
      tools={tools}
      open={open}
      surface="workspace"
      link={{ base: `/project/${projectId}`, view, from: WORKSPACE_RETURN.tools, layer }}
    />
  );
}

const noSubscription = () => () => {};
const readSearch = () => window.location.search;
const serverSearch = () => '';

/**
 * The same bar on a stage (Sonny 02.10.2026: from every tool straight back to
 * the workspace *and* straight into the other tools). The way back stays
 * "Back to workspace" above it; this bar is the way across. Each link carries
 * the view, origin and layer the stage was opened with, so "Back to workspace"
 * on the next stage still returns to where the reader left the workspace.
 */
export function StageToolBar({
  steps,
  current,
  base,
}: {
  /** `workflowSteps(project)` — or the demo's rail, which is assignable to it. */
  steps: WorkspaceTool[];
  current: PhaseKey;
  /** `/project/<id>`, or `/demo`. */
  base: string;
}) {
  // Read from the address in the browser only, as `StageHeader` does: a
  // statically generated demo stage must not depend on the query.
  const search = useSyncExternalStore(noSubscription, readSearch, serverSearch);
  const params = new URLSearchParams(search);
  const fromParam = params.get('from') ?? '';
  const from = (Object.values(WORKSPACE_RETURN) as string[]).includes(fromParam)
    ? (fromParam as WorkspaceReturnPoint)
    : undefined;
  return (
    <ToolsNav
      tools={steps}
      current={current}
      open={false}
      surface="stage"
      link={{ base, view: params.get('view'), from, layer: params.get('layer') }}
    />
  );
}
