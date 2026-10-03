'use client';

import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Check, ChevronDown, Wrench } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import { cn } from '@/lib/utils';
import { nextPhaseKey, PHASE_PURPOSE, phaseNeeds, type PhaseKey, type PhaseState } from '@/lib/workflow-steps';
import { toolMark, type WorkspaceView } from '@/lib/workspace-model';
import { useWorkspaceLayer } from '@/hooks/useWorkspaceLayer';
import { stageHref, WORKSPACE_RETURN, type WorkspaceReturnPoint } from '@/lib/workspace-back-href';
import { toolsNextHint, wt } from '@/lib/workspace-messages';
import InfoPopover from './InfoPopover';

export interface WorkspaceTool {
  key: PhaseKey;
  label: string;
  path: string;
  /** From `workflowSteps` — the phase contract's reading, never a client-set status. */
  state: PhaseState;
  proven: boolean;
}

/**
 * The small mark after a tool's name. It answers one question — has this tool
 * been used in this project? (ADR-060, amended by Sonny 02.10.2026) — and not
 * how strong what it produced is; that stays with the workspace's status line
 * and the status chips ("Proven", "Demonstrated · mock").
 *
 *   - a small green check where something of the phase is on record and it is
 *     not out of date (`toolMark` → `used`);
 *   - an amber dot where the phase is out of date: its inputs changed since;
 *   - nothing where nothing is on record.
 *
 * The colour is never the only carrier: each mark has its words for a screen
 * reader, appended to the link's name ("Analyze (used)"), a tooltip, and the
 * legend beside "Tools" says the same in text.
 */
function MarkGlyph({ kind }: { kind: 'check' | 'dot' }) {
  return kind === 'check' ? (
    <Check size={14} strokeWidth={3} aria-hidden={true} data-workspace-tool-mark="check" className="text-cc-success" />
  ) : (
    <span aria-hidden={true} data-workspace-tool-mark="dot" className="inline-block h-2 w-2 rounded-full bg-cc-warning-mark" />
  );
}

function ToolMark({ tool }: { tool: WorkspaceTool }) {
  const mark = toolMark(tool);
  if (mark.kind === 'none' || !mark.words) return null;
  // No `title` tooltip any more (owner 03.10.2026: hover only works on a
  // desktop). The mark's meaning is in the legend, in the link's name for a
  // screen reader, and in the tool's information popover — on every device.
  return (
    <>
      <span aria-hidden={true} data-workspace-tool-mark-glyph="" className="inline-flex items-center">
        <MarkGlyph kind={mark.kind} />
      </span>
      <span className="sr-only">({wt(mark.words)})</span>
    </>
  );
}

/**
 * What a tool is for and where it stands, in the words every surface shares —
 * the purpose from `PHASE_PURPOSE`, "Recommended next step." on the one tool
 * the phase contract names next, and why a tool cannot do anything yet. The
 * same lines are the link's accessible description, the information popover
 * on the open bar, and the visible line under each tool in the phone menu.
 */
function toolGuide(tool: WorkspaceTool, tools: readonly WorkspaceTool[], next: PhaseKey | null): string[] {
  const mark = toolMark(tool);
  return [
    PHASE_PURPOSE[tool.key],
    tool.key === next ? wt('toolGuide.recommended') : null,
    phaseNeeds(tool, tools),
    mark.meaning === 'used' ? `${wt('tools.mark.usedHint')}.` : mark.meaning === 'stale' ? `${wt('tools.mark.staleHint')}.` : null,
  ].filter((line): line is string => Boolean(line));
}

/** The small "Next" tag on the one recommended tool — words, not only a colour. */
function NextTag() {
  return (
    <span
      aria-hidden={true}
      data-workspace-tool-next-tag=""
      className="rounded-[4px] border border-cc-ink px-1 text-[11px] leading-4 font-semibold text-cc-ink"
    >
      {wt('toolGuide.next')}
    </span>
  );
}

/**
 * What the marks mean, in text — beside "Tools" on the open bar and at the top
 * of the phone menu. Both entries always, so the legend does not change shape
 * with the project.
 */
function ToolsLegend({ inMenu }: { inMenu?: boolean }) {
  return (
    <p
      data-tools-legend={inMenu ? 'menu' : 'bar'}
      className={cn(
        'flex items-center gap-3 text-[11px] leading-4 text-cc-ink-muted',
        inMenu && 'border-b border-cc-line pb-2',
      )}
    >
      <span className="sr-only">{wt('tools.legend.label')}</span>
      <span className="inline-flex items-center gap-1">
        <Check size={12} strokeWidth={3} aria-hidden={true} className="text-cc-success" />
        {wt('tools.legend.used')}
      </span>
      <span className="inline-flex items-center gap-1">
        <span aria-hidden={true} className="inline-block h-2 w-2 rounded-full bg-cc-warning-mark" />
        {wt('tools.legend.stale')}
      </span>
    </p>
  );
}

/**
 * The seven stages as tools — under the workspace header (`DESIGN.md` §2.3
 * item 3) and under "Back to workspace" on every stage (ADR-060). One
 * component for both, so the two bars cannot drift apart.
 *
 *   - **It opens pages, and it says which tools were used** (ADR-060, Sonny
 *     02.10.2026). A tool opens a stage as its own page; the mark after its
 *     name says whether the tool has been used in this project, or is out of
 *     date (`ToolMark`), derived from the phase state in
 *     `lib/workflow-steps.ts` like every other phase state in the product — so
 *     the bar and the status line cannot disagree about one phase. On a stage the
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
  link: link_,
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

  const next = nextPhaseKey(tools);
  const nextTool = next ? tools.find((t) => t.key === next) ?? null : null;
  const anyNeedsRun = tools.some((t) => phaseNeeds(t, tools) !== null);
  // One line under the tools: which one next and what it does, and — while
  // there is no signed run — that the others wait for one. Visible on every
  // device; no hover needed.
  const hint = nextTool
    ? [toolsNextHint(nextTool.label, PHASE_PURPOSE[nextTool.key]), anyNeedsRun ? wt('toolGuide.othersNeedRun') : null]
        .filter(Boolean)
        .join(' ')
    : wt('toolGuide.nothingOpen');

  const link = (tool: WorkspaceTool, place: 'bar' | 'menu') => {
    const mark = toolMark(tool);
    const guide = toolGuide(tool, tools, next);
    const describedBy = `${panelId}-${place}-${tool.key}-guide`;
    return (
      <React.Fragment key={tool.key}>
      <CcLinkButton
        data-workspace-tool={tool.key}
        data-phase-state={tool.state}
        data-workspace-tool-mark-meaning={mark.meaning}
        data-workspace-tool-mark-kind={mark.kind}
        data-workspace-tool-next={tool.key === next ? '' : undefined}
        describedBy={describedBy}
        current={tool.key === current}
        href={stageHref({ ...link_, path: tool.path })}
      >
        {tool.label}
        <ToolMark tool={tool} />
        {tool.key === next ? <NextTag /> : null}
      </CcLinkButton>
      {/* Outside the link, so it is the link's description and not part of its name. */}
      <span id={describedBy} data-workspace-tool-guide="" className="sr-only">
        {guide.join(' ')}
      </span>
      </React.Fragment>
    );
  };

  const barItems = tools.map((tool) => (
    <span key={tool.key} data-workspace-tool-item={tool.key} className="inline-flex items-center gap-1">
      {link(tool, 'bar')}
      <InfoPopover subject={tool.label} hook={`tool-${tool.key}`}>
        {toolGuide(tool, tools, next).map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </InfoPopover>
    </span>
  ));

  // In the phone menu the purpose stands under each tool as text: there is room
  // for it, and a menu is where a reader is choosing.
  const menuItems = tools.map((tool) => (
    <div key={tool.key} data-workspace-tool-item={tool.key} className="flex flex-col items-stretch gap-1">
      {link(tool, 'menu')}
      <span aria-hidden={true} data-workspace-tool-purpose="" className="px-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
        {toolGuide(tool, tools, next).slice(0, 3).join(' ')}
      </span>
    </div>
  ));

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
        <span className="flex flex-col gap-1">
          <span aria-hidden={true} className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
            {wt('tools.label')}
          </span>
          <ToolsLegend />
        </span>
        {barItems}
        <p data-tools-hint="bar" className="m-0 basis-full text-[12px] leading-snug font-medium text-cc-ink-muted">
          {hint}
        </p>
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
            className="absolute left-0 z-20 mt-1 flex w-72 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-3 shadow-cc-dialog"
          >
            <ToolsLegend inMenu />
            <p data-tools-hint="menu" className="m-0 text-[12px] leading-snug font-semibold text-cc-ink">
              {hint}
            </p>
            {menuItems}
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
