'use client';

import React, { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { PHASES, type PhaseKey } from '@/lib/workflow-steps';
import { stageBackLink } from '@/lib/workspace-back-href';
import { workspaceShellEnabled } from '@/lib/workspace-shell';
import { BACK_LINK_CLASS } from '@/components/BackLink';

/**
 * The header at the top of a workflow stage. There is exactly one.
 *
 * The seven stages had seven different ones. Measured:
 *
 *   analyze         text-4xl            font-extrabold  gray-900   centred
 *   design          text-2xl sm:text-3xl font-bold      gray-900   left
 *   transformation  text-4xl            font-black      gray-900   left
 *   testing         text-3xl md:text-4xl font-black     #0b1c30    left
 *   documentation   text-3xl md:text-4xl font-black     #0b1c30    left, UPPERCASE
 *   delivery        text-3xl md:text-5xl font-black     gray-900   centred, UPPERCASE
 *   tco             text-3xl md:text-4xl font-black     #0b1c30    left, UPPERCASE
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
 * Above the title sits **"Back to workspace"** — a link, not a button, 13 px /
 * 600 in `--cc-ink-muted`. It returns to the view and the layer the stage was
 * opened from when the address carries them (`?view=`, `?from=`), and to the
 * workspace's default view when it does not. The object-page workspace exists
 * only behind the admin switch until 3.0 (`lib/workspace-shell.ts`); for every
 * other account the workspace is still `/dashboard`, and the link goes there —
 * a link into a 404 would be worse than no link.
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
  title,
  eyebrow,
  icon,
  actions,
  align = 'left',
  children,
}: {
  /** The stage this header belongs to; its name comes from `PHASES`. */
  stage?: PhaseKey;
  /** A title of the stage's own, for the few headers that are not the stage's name (an empty state). */
  title?: React.ReactNode;
  /** Badges or labels that sit above the title, where a stage has them. */
  eyebrow?: React.ReactNode;
  /** A mark before the title — delivery's rocket. Drawn neutral, 20 px. */
  icon?: React.ReactNode;
  /** Buttons that belong to the stage as a whole, right-aligned on desktop. */
  actions?: React.ReactNode;
  align?: 'left' | 'center';
  /** The lead sentence. */
  children?: React.ReactNode;
}) {
  const centred = align === 'center';
  const heading = title ?? (stage ? PHASES.find((p) => p.key === stage)?.label : undefined);

  // The demo (`/demo/[stage]`) has no project behind it and no workspace to go
  // back to; it renders the header without the link.
  const params = useParams();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : '';
  const { profile, loading: profileLoading } = useUserProfile();
  const shell = workspaceShellEnabled(profile);

  // Read from the address in the browser only: the query is not part of the
  // server render (`''` there), and a statically generated demo page must not
  // depend on it — `useSearchParams` would force it to render on demand.
  const search = useSyncExternalStore(noSubscription, readSearch, serverSearch);

  // Only once the profile is read: before that `shell` is false for every
  // account, and a click in that moment would send a workspace user to the
  // dashboard (QA review of 472315d93455, f8d5367e0a00). The place is kept, so
  // nothing below moves when the link appears.
  const back = stageBackLink({ projectId, profileLoading, shell, search });

  return (
    <header
      data-stage-header={stage ?? ''}
      className={`mt-6 mb-8 ${centred ? 'text-center' : ''}`}
    >
      {back.kind === 'pending' && (
        <span aria-hidden="true" className={`${BACK_LINK_CLASS} mb-3 invisible`}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to workspace
        </span>
      )}
      {back.kind === 'link' && (
        <Link
          href={back.href}
          data-stage-back={back.to}
          className={`${BACK_LINK_CLASS} mb-3`}
        >
          <ArrowLeft size={16} aria-hidden="true" /> Back to workspace
        </Link>
      )}

      <div
        className={
          centred ? '' : 'flex flex-col gap-4 md:flex-row md:items-start md:justify-between'
        }
      >
        <div className="min-w-0">
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
