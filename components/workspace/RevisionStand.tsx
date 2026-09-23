'use client';

import React from 'react';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { CcTag } from '@/components/cc/Tag';
import { revisionBadge } from '@/lib/workspace-revision';

/**
 * What Stand the workspace is showing, and what to do when it has moved —
 * roadmap 6.9, CR-15.
 *
 * Two surfaces, deliberately unequal in weight:
 *
 *   - the **badge** sits beside the title and is the quietest vocabulary the
 *     design system has (`CcTag`, §4.1). It is on the screen the whole time and
 *     is not news; a coloured status chip here would claim something about the
 *     revision's quality, and this says only which one it is.
 *   - the **notice** appears only when somebody else has moved the Stand, as a
 *     Message Strip at the top of the thing it is about (§2.6) with `announce`
 *     set, because it appears in answer to something and the reader is not
 *     looking here.
 *
 * **Two exits and no default.** *Keep this Stand* dismisses the notice and
 * changes nothing on the screen — a reader in the middle of a thought is
 * allowed to finish it. *Refresh* fetches the page again. Neither is the
 * primary: choosing for the reader is exactly what a screen that silently
 * reloaded under them was doing wrong, and §2.8 asks a notice to end in an
 * action rather than a dead end.
 *
 * It renders the badge even before the first check has landed — as "Revision …"
 * would be a claim, the badge simply is not there until a number exists.
 */
export default function WorkspaceRevisionStand({
  held,
  seen,
  moved,
  onKeep,
  onRefresh,
}: {
  held: number | null | undefined;
  seen: number | null | undefined;
  moved: boolean;
  onKeep: () => void;
  onRefresh: () => void;
}) {
  if (held === undefined) return null;

  return (
    <>
      <span data-workspace-revision={held === null ? 'none' : String(held)}>
        <CcTag>{revisionBadge(held)}</CcTag>
      </span>
      {moved ? (
        <div data-workspace-revision-banner="" className="mt-2 w-full">
          <CcMessageStrip
            state="warning"
            headline="This process has moved on."
            announce={true}
            actions={
              <>
                <CcButton variant="ghost" onClick={onKeep} data-workspace-revision-keep="">
                  Keep this Stand
                </CcButton>
                <CcButton variant="secondary" onClick={onRefresh} data-workspace-revision-refresh="">
                  Refresh
                </CcButton>
              </>
            }
          >
            {revisionBadge(seen ?? null)} was written somewhere else while this screen was open. You are
            reading {revisionBadge(held).toLowerCase()}. Nothing here has changed and nothing of yours was
            overwritten.
          </CcMessageStrip>
        </div>
      ) : null}
    </>
  );
}
