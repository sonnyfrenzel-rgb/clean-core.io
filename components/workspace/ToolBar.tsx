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
import { useAnalysisRead } from '@/hooks/useAnalysisRead';
import { analysisKeyOfBase, resultReadyTag } from '@/lib/analysis-read';

export interface WorkspaceTool {
  key: PhaseKey;
  label: string;
  path: string;
  /** From `workflowSteps` — the phase contract's reading, never a client-set status. */
  state: PhaseState;
  proven: boolean;
}

/**
 * The small mark after a tool's name. It answers where the tool's work stands
 * (ADR-060, amended by Sonny 03.10.2026: "a check must mean done") — and not
 * how strong what it produced is; that stays with the workspace's status line
 * and the status chips ("Proven", "Demonstrated · mock", "Imported").
 *
 *   - a small green check where the tool's phase is done (`toolMark` → `done`);
 *   - a half-filled circle in the information colour where the tool's own
 *     output is on record and its work is not done (`started`);
 *   - an amber dot where the phase is out of date: its inputs changed since;
 *   - nothing where nothing is on record.
 *
 * The colour is never the only carrier: each mark has its words for a screen
 * reader, appended to the link's name ("Testing (started, not done)"), and the
 * legend beside "Tools" says the same in text. The shapes differ too — a
 * check, a half circle, a dot — so the three read apart without colour.
 */
function MarkGlyph({ kind, size = 'bar' }: { kind: 'check' | 'half' | 'dot'; size?: 'bar' | 'legend' }) {
  if (kind === 'check') {
    return (
      <Check
        size={size === 'bar' ? 14 : 12}
        strokeWidth={3}
        aria-hidden={true}
        data-workspace-tool-mark={size === 'bar' ? 'check' : undefined}
        className="text-cc-success"
      />
    );
  }
  if (kind === 'half') {
    // A ring with its left half filled — "begun", in the information ink.
    const px = size === 'bar' ? 12 : 10;
    return (
      <svg
        width={px}
        height={px}
        viewBox="0 0 12 12"
        aria-hidden={true}
        focusable="false"
        data-workspace-tool-mark={size === 'bar' ? 'half' : undefined}
        className="text-cc-information"
      >
        <circle cx="6" cy="6" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 1.25 A4.75 4.75 0 0 0 6 10.75 Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <span
      aria-hidden={true}
      data-workspace-tool-mark={size === 'bar' ? 'dot' : undefined}
      className="inline-block h-2 w-2 rounded-full bg-cc-warning-mark"
    />
  );
}

function ToolMark({ tool }: { tool: WorkspaceTool }) {
  const mark = toolMark(tool);
  if (mark.kind === 'none' || !mark.words) return null;
  // No `title` tooltip any more (owner 03.10.2026: hover only works on a
  // desktop). The mark's meaning is in the legend, in the link's name for a
  // screen reader, and in "What the tools do" — on every device.
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
 * same lines are the link's accessible description, the tool's entry in "What
 * the tools do" on the open bar, and the visible line under each tool in the
 * phone menu.
 */
function toolGuide(
  tool: WorkspaceTool,
  tools: readonly WorkspaceTool[],
  next: PhaseKey | null,
  resultReady = false,
): string[] {
  const mark = toolMark(tool);
  return [
    PHASE_PURPOSE[tool.key],
    tool.key === next ? wt('toolGuide.recommended') : null,
    resultReady ? wt('toolGuide.resultReadyHint') : null,
    phaseNeeds(tool, tools),
    mark.meaning === 'done'
      ? `${wt('tools.mark.doneHint')}.`
      : mark.meaning === 'started'
        ? `${wt('tools.mark.startedHint')}.`
        : mark.meaning === 'stale'
          ? `${wt('tools.mark.staleHint')}.`
          : null,
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
 * "Result ready" on the Analyze tool until this browser has opened it once
 * (ADR-090). Beside the check, not instead of it: the check says the phase is
 * done, the tag that its result has not been read. The information colour —
 * a pointer, not evidence, and not the ink of the "Next" tag.
 */
export function ResultReadyTag() {
  return (
    <span
      aria-hidden={true}
      data-workspace-tool-result-ready=""
      className="rounded-[4px] border border-cc-information px-1 text-[11px] leading-4 font-semibold text-cc-information"
    >
      {wt('toolGuide.resultReady')}
    </span>
  );
}

/**
 * What the marks mean, in text — beside "Tools" on the open bar and at the top
 * of the phone menu. All three entries always, so the legend does not change
 * shape with the project.
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
      <span data-tools-legend-entry="done" className="inline-flex items-center gap-1">
        <MarkGlyph kind="check" size="legend" />
        {wt('tools.legend.done')}
      </span>
      <span data-tools-legend-entry="started" className="inline-flex items-center gap-1">
        <MarkGlyph kind="half" size="legend" />
        {wt('tools.legend.started')}
      </span>
      <span data-tools-legend-entry="stale" className="inline-flex items-center gap-1">
        <MarkGlyph kind="dot" size="legend" />
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
  readKey,
}: {
  tools: WorkspaceTool[];
  /** Whose analysis "Result ready" is about — the project id or `demo` (`lib/analysis-read.ts`). */
  readKey: string | null;
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
  // Not on Analyze itself: the stage marks it read as it opens.
  const analysisRead = useAnalysisRead(readKey);
  const ready = (tool: WorkspaceTool) => tool.key !== current && resultReadyTag(tool, analysisRead);
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
    const guide = toolGuide(tool, tools, next, ready(tool));
    const describedBy = `${panelId}-${place}-${tool.key}-guide`;
    return (
      <React.Fragment key={tool.key}>
      <CcLinkButton
        data-workspace-tool={tool.key}
        data-phase-state={tool.state}
        data-workspace-tool-mark-meaning={mark.meaning}
        data-workspace-tool-mark-kind={mark.kind}
        data-workspace-tool-next={tool.key === next ? '' : undefined}
        data-workspace-tool-unread={ready(tool) ? '' : undefined}
        describedBy={describedBy}
        current={tool.key === current}
        href={stageHref({ ...link_, path: tool.path })}
      >
        {tool.label}
        <ToolMark tool={tool} />
        {tool.key === next ? <NextTag /> : null}
        {ready(tool) ? <ResultReadyTag /> : null}
      </CcLinkButton>
      {/* Outside the link, so it is the link's description and not part of its name. */}
      <span id={describedBy} data-workspace-tool-guide="" className="sr-only">
        {guide.join(' ')}
      </span>
      </React.Fragment>
    );
  };

  // One link per tool on the open bar, and no "i" after each (owner,
  // 04.10.2026: seven "i" made the header "far too complex and untidy"). What a
  // tool is for stays the link's accessible description, the line under the
  // bar names the next one, and "What the tools do" opens all seven at once —
  // on a tap or a key, never on hover.
  const barItems = tools.map((tool) => (
    <span key={tool.key} data-workspace-tool-item={tool.key} className="inline-flex items-center">
      {link(tool, 'bar')}
    </span>
  ));
  const guidePanel = (
    <ul data-tools-guide="" className="m-0 list-none space-y-2 p-0">
      {tools.map((tool) => (
        <li key={tool.key} data-tools-guide-entry={tool.key}>
          <span className="font-semibold">{tool.label}</span>
          {' — '}
          {toolGuide(tool, tools, next, ready(tool)).join(' ')}
        </li>
      ))}
    </ul>
  );

  // In the phone menu the purpose stands under each tool as text: there is room
  // for it, and a menu is where a reader is choosing.
  const menuItems = tools.map((tool) => (
    <div key={tool.key} data-workspace-tool-item={tool.key} className="flex flex-col items-stretch gap-1">
      {link(tool, 'menu')}
      <span aria-hidden={true} data-workspace-tool-purpose="" className="px-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
        {toolGuide(tool, tools, next, ready(tool)).slice(0, 3).join(' ')}
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
        className={cn('cc-no-print flex min-w-0 flex-wrap items-center gap-2', barHidden)}
      >
        <span aria-hidden={true} className="mr-1 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
          {wt('tools.label')}
        </span>
        {barItems}
        {/* One line under the tools: the next one and what it does, what the
            marks mean, and the one way to read what every tool does. */}
        <div className="flex basis-full flex-wrap items-center gap-x-4 gap-y-1">
          <p data-tools-hint="bar" className="m-0 min-w-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
            {hint}
          </p>
          <ToolsLegend />
          <InfoPopover subject={wt('toolGuide.whatTheyDo')} label={wt('toolGuide.whatTheyDo')} hook="tools-guide">
            {guidePanel}
          </InfoPopover>
        </div>
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
      readKey={projectId}
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
      readKey={analysisKeyOfBase(base)}
      link={{ base, view: params.get('view'), from, layer: params.get('layer') }}
    />
  );
}
