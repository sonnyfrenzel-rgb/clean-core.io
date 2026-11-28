'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import NextStepBar from '@/components/NextStepBar';
import { useJourneyNext } from '@/hooks/useJourneyNext';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import {
  Calculator,
  ChevronLeft,
  FileText,
  FlaskConical,
  Package,
  PenTool,
  Route,
  ScanSearch,
  Shuffle,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { PHASES, type PhaseKey, type RailStep } from '@/lib/workflow-steps';
import { familyBackLink, stageBackLink } from '@/lib/workspace-back-href';
import { useShellProjectName } from '@/lib/shell-context';
import ChoiceBackLink from '@/components/ChoiceBackLink';
import { DEMO_ROUTE } from '@/lib/demo-marks';
import { BACK_LINK_CLASS } from '@/components/BackLink';
import { StageToolBar, type ToolClick, type ToolGroup } from '@/components/workspace/ToolBar';
import { REDESIGN_LABEL, demoRedesignHref, redesignHref } from '@/lib/redesign';
import StageViewSwitch from '@/components/StageViewSwitch';
// Loaded on demand: the control reads who is signed in on mount, and the demo (no project) never renders it, so its
// pages must not carry it on their load path (`tests/public-no-google-before-signin-guard.spec.ts`).
const InviteToView = dynamic(() => import('@/components/family/InviteToView'));
import { useLocationSearch } from '@/lib/location-search';
import { familyTitleOf } from '@/lib/family-title';
import { familyViewMode, ONE_PAGE_NOTE, SHELL_BAR_PX, TOOL_LEADS } from '@/lib/family-frame';
import FamilyChip from '@/components/family/FamilyChip';
import { stageViewOf } from '@/lib/location-search';
import { VIEW_LABELS } from '@/lib/workspace-model';

/**
 * The header of a tool — the frame every tool of the family shares (mock-ups of 15.11.2026: Economics, Design,
 * Transformation, Documentation, Testing, Delivery, Analyze; ADR-126, ADR-139, ADR-140). There is exactly one.
 *
 *   ‹ My workspace · Emergency purchase approval          One page for every reader · [Invite to view]
 *   TOOLS  [✓ Analyze] [Economics] [Design] [Transformation] …                                             (i)
 *   ▢ TOOL · ECONOMICS  [From the engine]
 *   Emergency purchase approval                                                         [stage actions]
 *   Z_MM_PO_APPROVAL
 *   What keeping, rebuilding, moving to SAP standard or retiring this program would cost.
 *
 *   scrolled:  ‹  ▢ Economics · Emergency purchase approval                                       IT view
 *
 * 1. **The head row.** On the left the one way back (`familyBackLink`, a chevron, the place and the program); a choice
 *    reached through `?origin=` keeps its own way back (`ChoiceBackLink`). On the right the view: the Business | IT |
 *    Management switch on the tools whose views differ (Analyze, Design — ADR-126 (2), ADR-140), the quiet note *One
 *    page for every reader* on the others (ADR-126 (1), ADR-131, ADR-132); the view stays in the address either way.
 *    Beside it *Invite to view* for the project's owner (UX review L7), the existing invitation flow.
 * 2. **The tool row** (`StageToolBar`): the same row on every tool and every width (ADR-140, Q9, Q12, L5).
 * 3. **The title block.** The tool as the eyebrow with its icon — "Tool · Economics" — and the program's business
 *    name as the page's `h1` (`lib/family-title.ts`: the source header's title the engine read, else the project's
 *    name), its technical name in mono under it, then the lead. Until the project is read the `h1` is the tool's name.
 *    The `h1` is 22 px / 800, `-0.02em`, `--cc-ink` (`cc-text-title`, `DESIGN.md` §1.2, §2.3).
 *    **Every tool has its lead** (release 3.5.4, Q2): the page's own, else the tool's from `TOOL_LEADS`.
 *    **"From the engine" once per page** (release 3.5.4, Q5): beside the eyebrow, for everything on the page that no
 *    chip of its own says otherwise about; a block shows a chip only where it departs (`FamilyChip`).
 * 4. **The slim head** (release 3.5.4, M1). Once the title has passed under the shell bar, one line stands under it:
 *    the way back as a chevron, the tool, the program's name, and on the tools with views the view it is read in.
 *    The full head scrolls with the page as before, so nothing under it moves; the "On this page" bar steps down
 *    under the slim line while both stand (`app/globals.css`).
 *
 * **Re-design (ADR-143).** On Analyze the six tools after it stand in one group of the tool row, "Re-design ›", whose
 * label opens the Re-design page (`/project/[id]/redesign`). That page is not a tool: it passes `place="redesign"`,
 * which names it in the eyebrow, marks the group's label as current and leads back to Analyze.
 *
 * `stage` names the tool from `PHASES` in `lib/workflow-steps.ts`, the list the tool bar, the rail and the dashboard
 * read, so a tool cannot be called one thing in the bar and another in its own eyebrow (UX-169). Navigation does not
 * print (§7.1): the head row and the tool row carry `cc-no-print`.
 *
 * Guarded by `tests/workflow-style-guard.spec.ts`, which loads every tool and compares the computed style of each
 * `[data-stage-title]` against §2.3, and by `tests/family-frame.spec.ts` (server-free).
 */

/** What the head's one "From the engine" says for the page (release 3.5.4, Q5). */
const PAGE_PROVENANCE_MEANING =
  'Unless a block says otherwise, what this page shows was read from the code by the engine, the same on every run. Nobody has confirmed it.';

/** Each tool's mark before "Tool · …" in the eyebrow — neutral, 16 px, in `--cc-ink-muted`. */
const TOOL_ICONS: Readonly<Record<PhaseKey, LucideIcon>> = {
  analyze: ScanSearch,
  tco: Calculator,
  design: PenTool,
  transformation: Shuffle,
  documentation: FileText,
  testing: FlaskConical,
  delivery: Package,
};

/** What the header reads of a project: its name and business title, and whose it is (for *Invite to view*). */
export type StageHeaderProject = Parameters<typeof familyTitleOf>[0] & {
  id?: string | null;
  userId?: string | null;
};

export default function StageHeader({
  stage,
  project,
  projectName,
  title,
  eyebrow,
  icon,
  actions,
  align = 'left',
  tools,
  toolsNote,
  toolsCompact,
  onTool,
  toolsAfter,
  backToMyWorkspace = false,
  view,
  place,
  children,
}: {
  /** The tool this header belongs to; its name comes from `PHASES`. */
  stage?: PhaseKey;
  /**
   * The project the tool works on — its business title becomes the `h1`, its technical name the line under it, and
   * its owner sees *Invite to view*. Pass the loaded project; `null` while it loads.
   */
  project?: StageHeaderProject | null;
  /** The project's name, where no project document is at hand (the demo). Used for the title when `project` is absent. */
  projectName?: string | null;
  /** A title of the page's own instead of the program — for the few headers that are not a program (an empty state). */
  title?: React.ReactNode;
  /** Chips that stand beside the eyebrow ("Tool · Economics"), where a tool has them. */
  eyebrow?: React.ReactNode;
  /** A mark of the page's own in the eyebrow instead of the tool's. Drawn neutral, 16 px. */
  icon?: React.ReactNode;
  /** Buttons that belong to the tool as a whole, right-aligned beside the title on desktop. */
  actions?: React.ReactNode;
  align?: 'left' | 'center';
  /**
   * The seven tools (ADR-060): the phases from `workflowSteps` (or the demo's rail), the tool the reader is on
   * (defaults to `stage`), and the base of the links (`/demo` for the demo; the project otherwise).
   */
  tools?: { steps: RailStep[]; current?: PhaseKey; base?: string };
  /** One quiet line at the end of the tool row — the soft gate of Analyze, Business (plan AB-2, mockup state 3). */
  toolsNote?: React.ReactNode;
  /** Kept for the callers of ADR-099; the family's tool row is always one row. */
  toolsCompact?: boolean;
  /** A plain click on a tool: Analyze, Business before the walk-through says why to walk first (plan AB-4). */
  onTool?: ToolClick;
  /** What stands right under the tool row, in the flow: the soft-gate note of Analyze, Business (mockup state 10). */
  toolsAfter?: React.ReactNode;
  /** The way back is My workspace whatever the address says — Analyze in the Business view, the project's entry. */
  backToMyWorkspace?: boolean;
  /**
   * The right end of the head row: `switch` (Business | IT | Management), `one-page` (the note), or `none`. Defaults
   * by tool (`familyViewMode`): the switch on Analyze and Design, the note on the five others.
   */
  view?: 'switch' | 'one-page' | 'none';
  /**
   * A page of the family that is not one of the seven tools: `redesign`, the Re-design page (ADR-143). Its eyebrow
   * says "Re-design", the tool row marks the group's label as current, and the way back is Analyze.
   */
  place?: 'redesign';
  /** The lead sentence. */
  children?: React.ReactNode;
}) {
  const centred = align === 'center';
  const toolLabel = stage ? PHASES.find((p) => p.key === stage)?.label : undefined;

  // The demo (`/demo/[stage]`) has no project behind it; it leads back to the demo workspace.
  const params = useParams();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : '';

  // Read from the address in the browser only: the query is not part of the server render (`''` there), and a
  // statically generated demo page must not depend on it (`lib/location-search.ts`).
  const search = useLocationSearch();

  const demo = tools?.base === DEMO_ROUTE;
  const back = stageBackLink({ projectId, search, demo });
  const familyWay = familyBackLink({ projectId, search, demo, toMyWorkspace: backToMyWorkspace });
  const onRedesign = place === 'redesign';
  // The Re-design page leads back to Analyze, where every way into it starts (mock-up of 23.11.2026, screen 2).
  const way: typeof familyWay =
    onRedesign && (projectId || demo) && familyWay.kind === 'link'
      ? { kind: 'link', href: demo ? `${DEMO_ROUTE}/analyze` : `/project/${encodeURIComponent(projectId)}/analyze`, place: 'Analyze', to: 'analyze' }
      : familyWay;
  // The program: the page's project, or the name the loader announced to the shell bar, or the demo's name.
  const announcedName = useShellProjectName(projectId || null);
  const family = familyTitleOf(project ?? (projectName ? { name: projectName } : announcedName ? { name: announcedName } : null));
  const heading = title ?? family?.title ?? toolLabel;
  const programId = title ? null : family?.programId ?? null;
  const toolCurrent = tools?.current ?? stage;
  const toolBase = tools?.base ?? (projectId ? `/project/${projectId}` : null);
  const mode = view ?? (onRedesign ? 'one-page' : familyViewMode(toolCurrent ?? stage ?? null));
  const eyebrowTool = toolLabel ?? (toolCurrent ? PHASES.find((p) => p.key === toolCurrent)?.label : undefined);
  const ToolIcon = onRedesign ? Route : toolCurrent ? TOOL_ICONS[toolCurrent] : null;
  // The "Re-design ›" group: on Analyze and on the Re-design page, of a project and of the demo (`/demo/redesign`).
  // One next step for the tool row's tag and the bar at the foot (journey review 26.11.2026): one source, never two.
  const journey = useJourneyNext({
    steps: tools?.steps ?? null,
    here: onRedesign ? 'redesign' : toolCurrent ?? null,
    projectId,
    demo,
    loaded: demo || Boolean(project),
  });
  // The tag names the next step itself, never the one after it: standing on that step, the row shows no tag (Q3);
  // a stale analysis keeps Analyze as the step, not the tool past it (preservation RC-delivery-blocked-source-changed).
  const wayKey = journey?.next?.key ?? null;
  const journeyNextKey: PhaseKey | null | undefined = journey === null ? undefined : wayKey && wayKey !== 'decide' ? wayKey : null;
  // The slim head (M1): shown once the title has passed half under the shell bar. Read on every scroll of the document or
  // of a scrolling container, once per frame.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [slim, setSlim] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let frame = 0;
    const read = () => {
      frame = 0;
      const el = titleRef.current;
      if (!el) return;
      // Half of the title under the shell bar: what is left of it no longer reads as the page's name.
      const r = el.getBoundingClientRect();
      setSlim((r.top + r.bottom) / 2 < SHELL_BAR_PX);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    read();
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  const viewLabel = mode === 'switch' ? VIEW_LABELS[stageViewOf(search)] : null;
  // The lead (Q2): the page's own, else the tool's.
  const lead = children ?? (onRedesign ? null : toolCurrent ? TOOL_LEADS[toolCurrent] : null);
  // "From the engine" once for the page (Q5): on every tool and on Re-design.
  const pageProvenance = Boolean(eyebrowTool) || onRedesign;
  const slimBack = back.kind === 'link' && back.origin ? { href: back.origin.href, label: back.origin.label } : way.kind === 'link' ? { href: way.href, label: way.place } : null;

  const group: ToolGroup | null =
    // The same row on every tool (journey review 26.11.2026, Q7): the six tools after Analyze always stand in the group.
    (projectId || demo) && (onRedesign || Boolean(toolCurrent))
      ? { href: demo ? demoRedesignHref() : redesignHref(projectId), label: `${REDESIGN_LABEL}`, current: onRedesign }
      : null;


  return (
    <>
    {/* The slim head (M1): a sticky line of no height of its own, so it takes no room in the page; its bar hangs from
        it under the shell bar while the title is out of view. Before the header, so it is already stuck when it shows —
        after it, it would show at its place in the flow, over the lead. Hidden, it is `inert`: not in the tab order,
        not read. */}
    <div className="cc-no-print sticky top-14 z-cc-sticky h-0">
      <div
        data-stage-head-slim=""
        data-shown={slim ? 'true' : 'false'}
        aria-hidden={slim ? undefined : true}
        inert={!slim}
        className={`flex h-11 items-center gap-2 rounded-b-cc-card border border-t-0 border-cc-line bg-cc-surface pr-3 pl-1 shadow-[var(--cc-shadow-strip)] transition-opacity duration-150 motion-reduce:transition-none ${slim ? 'visible opacity-100' : 'invisible opacity-0'}`}
      >
        {slimBack ? (
          <Link
            href={slimBack.href}
            data-stage-head-slim-back=""
            aria-label={`Back to ${slimBack.label}`}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-cc-ink-muted no-underline hover:text-cc-ink"
          >
            <ChevronLeft size={16} aria-hidden={true} />
          </Link>
        ) : null}
        {eyebrowTool || onRedesign ? (
          <span data-stage-head-slim-tool="" className="inline-flex shrink-0 items-center gap-2 cc-text-cell font-semibold text-cc-ink-muted max-sm:hidden">
            <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:size-4">
              {icon ?? (ToolIcon ? <ToolIcon size={16} /> : null)}
            </span>
            {onRedesign ? REDESIGN_LABEL : eyebrowTool}
            <span aria-hidden="true">·</span>
          </span>
        ) : null}
        <span data-stage-head-slim-title="" className="min-w-0 flex-1 truncate text-[15px] leading-5 font-bold text-cc-ink">
          {heading}
        </span>
        {viewLabel ? (
          <span data-stage-head-slim-view="" className="shrink-0 cc-text-meta whitespace-nowrap text-cc-ink-muted">
            {viewLabel} view
          </span>
        ) : null}
      </div>
    </div>
    <header data-stage-header={stage ?? ''} data-family-header="" className={`mt-0 mb-6 ${centred ? 'text-center' : ''}`}>
      {back.kind === 'link' && way.kind === 'link' && (
        <div data-stage-head-row="" className="cc-no-print flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            {back.origin ? (
              // A choice made here was asked for elsewhere (`?origin=`, a key of the closed list in
              // `lib/choice-addresses.ts`): the way back leads there, one level deep.
              <ChoiceBackLink href={back.origin.href} label={back.origin.label} stage />
            ) : (
              <Link
                href={way.href}
                data-stage-back={way.to}
                className={`${BACK_LINK_CLASS} cc-no-print min-w-0 max-w-full max-sm:min-h-11`}
              >
                <ChevronLeft size={16} aria-hidden="true" className="shrink-0" />
                <span data-stage-back-lead="">{way.place}</span>
                {/* On a phone the way back is the place alone, on one line: the program is the title right under it
                    (release 3.5.4, M1 — the program cut short beside "My workspace" broke the row in two). */}
                {family?.title ? (
                  <span data-stage-back-place="" className="inline-flex min-w-0 font-medium max-sm:hidden">
                    <span aria-hidden="true" className="pr-1">·</span>
                    <span data-stage-back-project="" className="inline-block max-w-[20rem] truncate align-bottom">
                      {family.title}
                    </span>
                  </span>
                ) : null}
              </Link>
            )}
          </div>
          <div data-stage-head-end="" className={`flex flex-wrap items-center gap-2 ${mode === 'switch' ? 'max-[720px]:w-full' : ''}`}>
            {mode === 'switch' ? <StageViewSwitch search={search} /> : null}
            {mode === 'one-page' ? (
              // On a phone the note steps back: the header's chrome stays short (UX review 22.11.2026, finding 10).
              <p data-one-page-note="" className="m-0 inline-flex min-h-8 items-center gap-2 cc-text-cell text-cc-ink-muted max-sm:hidden">
                <Users size={16} aria-hidden={true} className="shrink-0" />
                {ONE_PAGE_NOTE}
              </p>
            ) : null}
            {projectId && !demo ? (
              <InviteToView projectId={projectId} projectName={family?.title ?? projectId} ownerId={project?.userId ?? null} />
            ) : null}
          </div>
        </div>
      )}

      {/* The one next step of the journey, at the foot of the window on every tool after Analyze (journey review
          26.11.2026, M2). Not on Re-design: that page is the step list and carries the step as its own action. Not on
          Analyze: there the walk-through leads first and the way on stands in the page (plan AB-4, ADR-099). */}
      {tools && toolCurrent && toolCurrent !== 'analyze' && !onRedesign && toolBase ? <NextStepBar way={journey} base={toolBase} /> : null}
      {tools && (toolCurrent || onRedesign) && toolBase && (
        <div data-stage-toolbar=""className="cc-no-print mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-[36rem]">
            <StageToolBar
              steps={tools.steps}
              current={onRedesign ? undefined : toolCurrent}
              base={toolBase}
              compact={toolsCompact ?? true}
              onTool={onTool}
              group={group}
              journeyNextKey={journeyNextKey}
            />
          </div>
          {toolsNote ? (
            <p data-stage-tools-note="" className="m-0 cc-text-meta font-medium text-cc-ink-muted">
              {toolsNote}
            </p>
          ) : null}
          {toolsAfter ? <div className="basis-full">{toolsAfter}</div> : null}
        </div>
      )}

      <div className={centred ? 'mt-4' : 'mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between'}>
        <div className="min-w-0">
          {(eyebrowTool || onRedesign) && (
            <div className={`flex flex-wrap items-center gap-2 ${centred ? 'justify-center' : ''}`}>
              <p data-stage-tool="" className="m-0 inline-flex items-center gap-2 cc-text-label text-cc-ink-muted">
                <span aria-hidden="true" data-stage-icon="" className="inline-flex shrink-0 [&>svg]:size-4">
                  {icon ?? (ToolIcon ? <ToolIcon size={16} /> : null)}
                </span>
                <span>{onRedesign ? REDESIGN_LABEL : <>Tool · {eyebrowTool}</>}</span>
              </p>
              {pageProvenance ? (
                <span data-stage-page-provenance="" className="inline-flex">
                  <FamilyChip kind="engine" keep title={PAGE_PROVENANCE_MEANING} />
                </span>
              ) : null}
              {eyebrow}
            </div>
          )}

          {/* A program name without spaces ("Z_SALES_ORDER_CREATOR" until it has a business name) breaks inside itself
              rather than widening a phone's page. */}
          <h1 data-stage-title className="m-0 mt-1 cc-text-title text-cc-ink text-balance [overflow-wrap:anywhere]" ref={titleRef}>
            {heading}
          </h1>
          {programId ? (
            <p data-stage-program="" className="m-0 font-cc-mono cc-text-meta text-cc-ink-muted [overflow-wrap:anywhere]">
              {programId}
            </p>
          ) : null}

          {lead ? (
            <p data-stage-lead="" className={`m-0 mt-1 cc-text-body text-cc-ink-muted ${centred ? 'max-w-2xl mx-auto' : 'max-w-3xl'}`}>
              {lead}
            </p>
          ) : null}
        </div>

        {actions && <div className={`flex flex-wrap gap-3 ${centred ? 'justify-center mt-6' : 'shrink-0'}`}>{actions}</div>}
      </div>
    </header>
    </>
  );
}
