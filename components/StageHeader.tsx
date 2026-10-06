'use client';

import React, { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PHASES, type PhaseKey, type RailStep } from '@/lib/workflow-steps';
import { stageBackLink } from '@/lib/workspace-back-href';
import { useShellProjectName } from '@/lib/shell-context';
import StageBackText from '@/components/StageBackText';
import { DEMO_ROUTE } from '@/lib/demo-marks';
import { BACK_LINK_CLASS } from '@/components/BackLink';
import { StageToolBar } from '@/components/workspace/ToolBar';

/**
 * The header at the top of a workflow stage. There is exactly one.
 *
 * The seven stages had seven different ones. Measured:
 *
 *   analyze         text-4xl            font-extrabold  gray-900   centred
 *   design          text-2xl sm:text-3xl font-bold      gray-900   left
 *   transformation  text-4xl            font-black      gray-900   left
 *   testing         text-3xl md:text-4xl font-black     navy       left
 *   documentation   text-3xl md:text-4xl font-black     navy       left, UPPERCASE
 *   delivery        text-3xl md:text-5xl font-black     gray-900   centred, UPPERCASE
 *   tco             text-3xl md:text-4xl font-black     navy       left, UPPERCASE
 *
 * The first fix made them agree with each other at 30–36 px / 900 — the
 * landing page's scale. Block D (E-3, ADR-050, `DESIGN.md` §2.3) makes them
 * agree with the workspace instead: a stage is a tool of the workspace, so its
 * title stands like the project title, **22 px / 800, `-0.02em`, `--cc-ink`**,
 * as the page's `h1` (`cc-text-title`). 900 does not exist in the workspace
 * (§1.2), and the green bubble behind delivery's rocket said "proven" about a
 * page heading (§1.1) — the icon now stands neutral before the title, 20 px in
 * `--cc-ink-muted`, whatever colour the page handed in.
 *
 * Above the title sits **"Back to project workspace · <project> · <view>"** —
 * a link, not a button, 13 px / 600 in `--cc-ink-muted` (two names for two
 * places, owner 06.10.2026: this is the project's workspace, "My workspace"
 * is the list of all projects). It returns to the view and the layer the stage was
 * opened from when the address carries them (`?view=`, `?from=`), and to the
 * workspace's default view when it does not. Every account has the workspace
 * since roadmap 3.0.1 (ADR-061), so the link leads there for every reader.
 *
 * The link is navigation, and navigation does not print (§7.1): it carries
 * `cc-no-print`, so no stage has to hide it on paper by itself — on paper it
 * would be a bare path in brackets (block D, D.31; Economics did it locally).
 *
 * `stage` names the title from `PHASES` in `lib/workflow-steps.ts`, the list
 * the stepper, the rail and the dashboard read, so a stage that passes it
 * cannot be called one thing in the stepper and another above its own content
 * (UX-169: the documentation stage was "Documentation" in the stepper and
 * "Process Blueprint & Mapping" here).
 *
 * Guarded by `tests/workflow-style-guard.spec.ts`, which loads every stage and
 * compares the computed style of each `[data-stage-title]` against §2.3.
 */

/** A layer id on the workspace page: letters, digits and dashes, nothing that could leave the fragment. */

const noSubscription = () => () => {};
const readSearch = () => window.location.search;
const serverSearch = () => '';

export default function StageHeader({
  stage,
  projectName,
  title,
  eyebrow,
  icon,
  actions,
  align = 'left',
  tools,
  children,
}: {
  /** The stage this header belongs to; its name comes from `PHASES`. */
  stage?: PhaseKey;
  /**
   * The project the tool works on. In the workspace a stage is a tool of that
   * project (ADR-008), and the eyebrow says so — "Tool · Emergency purchase
   * approval" (mockup s8) — so a reader who arrived by a link knows whose
   * figures these are without the old seven-step bar above the title.
   */
  projectName?: string | null;
  /** A title of the stage's own, for the few headers that are not the stage's name (an empty state). */
  title?: React.ReactNode;
  /** Badges or labels that sit above the title, where a stage has them. */
  eyebrow?: React.ReactNode;
  /** A mark before the title — delivery's rocket. Drawn neutral, 20 px. */
  icon?: React.ReactNode;
  /** Buttons that belong to the stage as a whole, right-aligned on desktop. */
  actions?: React.ReactNode;
  align?: 'left' | 'center';
  /**
   * The seven tools under the way back (ADR-060, Sonny 02.10.2026): the
   * phases from `workflowSteps` (or the demo's rail), the stage the reader is
   * on (defaults to `stage`), and the base of the links (`/demo` for the demo;
   * the project otherwise). Drawn for every account and in the demo; it is the
   * one way across — the old seven-circle stepper went with roadmap 3.0.1.
   */
  tools?: { steps: RailStep[]; current?: PhaseKey; base?: string };
  /** The lead sentence. */
  children?: React.ReactNode;
}) {
  const centred = align === 'center';
  const heading = title ?? (stage ? PHASES.find((p) => p.key === stage)?.label : undefined);

  // The demo (`/demo/[stage]`) has no project behind it and no workspace to go
  // back to; it renders the header without the link.
  const params = useParams();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : '';

  // Read from the address in the browser only: the query is not part of the
  // server render (`''` there), and a statically generated demo page must not
  // depend on it — `useSearchParams` would force it to render on demand.
  const search = useSyncExternalStore(noSubscription, readSearch, serverSearch);

  // The demo's stages hand their tools the `/demo` base; their way back is
  // the demo workspace (owner 02.10.2026), by the same rule as a project's.
  const demo = tools?.base === DEMO_ROUTE;
  const back = stageBackLink({ projectId, search, demo });
  // Where the link leads, in words — the project, then the view and the layer
  // the stage was opened from (mockup s8; owner 06.10.2026: the project's
  // workspace and "My workspace" carry two different names). The name is the
  // page's own read, or the one the loader announced to the shell bar.
  const announcedName = useShellProjectName(projectId || null);
  const backName = projectName || announcedName;
  const toolEyebrow = projectName || null;
  const toolCurrent = tools?.current ?? stage;
  const toolBase = tools?.base ?? (projectId ? `/project/${projectId}` : null);

  return (
    <header
      data-stage-header={stage ?? ''}
      className={`mt-6 mb-8 ${centred ? 'text-center' : ''}`}
    >
      {back.kind === 'link' && (
        <Link
          href={back.href}
          data-stage-back="workspace"
          className={`${BACK_LINK_CLASS} cc-no-print mb-3 flex-wrap`}
        >
          <StageBackText projectName={backName} search={search} />
        </Link>
      )}

      {tools && toolCurrent && toolBase && (
        <div data-stage-toolbar="" className="cc-no-print mb-4">
          <StageToolBar steps={tools.steps} current={toolCurrent} base={toolBase} />
        </div>
      )}

      <div
        className={
          centred ? '' : 'flex flex-col gap-4 md:flex-row md:items-start md:justify-between'
        }
      >
        <div className="min-w-0">
          {toolEyebrow && (
            <p
              data-stage-tool=""
              className={`m-0 mb-1 cc-text-label text-cc-ink-muted break-words ${centred ? 'text-center' : ''}`}
            >
              Tool · {toolEyebrow}
            </p>
          )}
          {eyebrow && (
            <div className={`mb-2 flex flex-wrap items-center gap-2 ${centred ? 'justify-center' : ''}`}>
              {eyebrow}
            </div>
          )}

          <div className={`flex items-center gap-2 ${centred ? 'justify-center' : ''}`}>
            {icon && (
              <span
                data-stage-icon
                aria-hidden="true"
                className="inline-flex shrink-0 text-cc-ink-muted [&>svg]:size-5 [&>svg]:text-cc-ink-muted"
              >
                {icon}
              </span>
            )}
            <h1 data-stage-title className="m-0 cc-text-title text-cc-ink text-balance">
              {heading}
            </h1>
          </div>

          {children && (
            <p
              className={`mt-1 cc-text-body text-cc-ink-muted ${
                centred ? 'max-w-2xl mx-auto' : 'max-w-3xl'
              }`}
            >
              {children}
            </p>
          )}
        </div>

        {actions && (
          <div className={`flex flex-wrap gap-3 ${centred ? 'justify-center mt-6' : 'shrink-0'}`}>
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
