'use client';

import React from 'react';
import Link from 'next/link';
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
import { REDESIGN_LABEL, redesignHref } from '@/lib/redesign';
import StageViewSwitch from '@/components/StageViewSwitch';
import InviteToView from '@/components/family/InviteToView';
import { useLocationSearch } from '@/lib/location-search';
import { familyTitleOf } from '@/lib/family-title';
import { familyViewMode, ONE_PAGE_NOTE } from '@/lib/family-frame';

/**
 * The header of a tool — the frame every tool of the family shares (mock-ups of 15.11.2026: Economics, Design,
 * Transformation, Documentation, Testing, Delivery, Analyze; ADR-126, ADR-139, ADR-140). There is exactly one.
 *
 *   ‹ My workspace · Emergency purchase approval          One page for every reader · [Invite to view]
 *   TOOLS  [✓ Analyze] [Economics] [Design] [Transformation] …                 ✓ done ◐ started ● out of date
 *   ▢ TOOL · ECONOMICS
 *   Emergency purchase approval                                                         [stage actions]
 *   Z_MM_PO_APPROVAL
 *   What keeping, rebuilding, moving to SAP standard or retiring this program would cost.
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
    onRedesign && projectId && familyWay.kind === 'link'
      ? { kind: 'link', href: `/project/${encodeURIComponent(projectId)}/analyze`, place: 'Analyze', to: 'workspace' }
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
  // The "Re-design ›" group: on Analyze and on the Re-design page of a project; the demo has no Re-design page.
  const group: ToolGroup | null =
    projectId && !demo && (onRedesign || toolCurrent === 'analyze')
      ? { href: redesignHref(projectId), label: `${REDESIGN_LABEL}`, current: onRedesign }
      : null;


  return (
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
                className={`${BACK_LINK_CLASS} cc-no-print min-w-0 max-sm:min-h-11`}
              >
                <ChevronLeft size={16} aria-hidden="true" className="shrink-0" />
                <span data-stage-back-lead="">{way.place}</span>
                {family?.title ? (
                  <span data-stage-back-place="" className="inline-flex min-w-0 font-medium">
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

      {tools && (toolCurrent || onRedesign) && toolBase && (
        <div data-stage-toolbar="" className="cc-no-print mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-[36rem]">
            <StageToolBar
              steps={tools.steps}
              current={onRedesign ? undefined : toolCurrent}
              base={toolBase}
              compact={toolsCompact ?? true}
              onTool={onTool}
              group={group}
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
              {eyebrow}
            </div>
          )}

          <h1 data-stage-title className="m-0 mt-1 cc-text-title text-cc-ink text-balance">
            {heading}
          </h1>
          {programId ? (
            <p data-stage-program="" className="m-0 font-cc-mono cc-text-meta text-cc-ink-muted [overflow-wrap:anywhere]">
              {programId}
            </p>
          ) : null}

          {children && (
            <p className={`mt-1 cc-text-body text-cc-ink-muted ${centred ? 'max-w-2xl mx-auto' : 'max-w-3xl'}`}>{children}</p>
          )}
        </div>

        {actions && <div className={`flex flex-wrap gap-3 ${centred ? 'justify-center mt-6' : 'shrink-0'}`}>{actions}</div>}
      </div>
    </header>
  );
}
