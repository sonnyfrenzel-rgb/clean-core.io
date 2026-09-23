'use client';

import React, { useCallback, useEffect, useState } from 'react';
import CcButton from '@/components/cc/Button';
import {
  loadProjectAccess,
  revokeProjectAccess,
  type ProjectAccessList,
} from '@/lib/project-readers-client';

/**
 * Roadmap 5.5 — who has Einsicht into this project, since when, and the one
 * button that takes it away.
 *
 * Both halves come off the server. The address is the one the account actually
 * signed in with when it accepted, the date is the server clock at that moment,
 * and neither was ever typed by a browser — `/api/projects/{id}/readers` reads
 * them out of the invitation the Admin SDK wrote.
 *
 * It renders nothing at all for anyone but the owner, because the route answers
 * nobody else: a reader asking gets the same 404 as a stranger, so there is no
 * list here for an invited person to discover, and no e-mail address of a third
 * party for them to read. The pending invitations are not shown here either —
 * this is the list of who *has* Einsicht, not of who was asked.
 *
 * The revocation is a single write to a single field, and it is that field the
 * read rule consults. When the row disappears, the access is gone at the rules,
 * not merely off this screen.
 */
export default function WorkspaceAccessList({
  projectId,
  beforeWrite,
}: {
  projectId: string;
  /**
   * Asked immediately before the revocation is sent (roadmap 6.9, CR-15).
   * `false` means the process moved on while this screen was open: nothing is
   * sent and the workspace's own notice — not a second one here — offers the
   * reader the two exits. Optional, because this section has to keep working
   * for any caller that does not track a Stand.
   */
  beforeWrite?: () => Promise<boolean>;
}) {
  const [access, setAccess] = useState<ProjectAccessList | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setAccess(await loadProjectAccess(projectId));
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    loadProjectAccess(projectId).then((list) => {
      if (alive) setAccess(list);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const revoke = useCallback(
    async (uid: string) => {
      setBusyUid(uid);
      setError(null);
      try {
        // Before the write, not after it. A revocation is not undoable, and
        // sending one off a screen that has been overtaken is the case CR-15
        // named; the caller's notice takes it from here.
        if (beforeWrite && !(await beforeWrite())) return;
        await revokeProjectAccess(projectId, uid);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The revocation did not go through.');
      } finally {
        setBusyUid(null);
      }
    },
    [projectId, refresh, beforeWrite],
  );

  // Not the owner, or nothing to say yet: no empty frame, no placeholder.
  if (access === null) return null;

  return (
    <section
      data-workspace-access=""
      className="rounded-cc-row border border-cc-line bg-cc-surface px-4 py-3"
      aria-labelledby="workspace-access-title"
    >
      <h2
        id="workspace-access-title"
        className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase"
      >
        Who can read this project
      </h2>

      {access.entries.length === 0 ? (
        <p data-workspace-access-empty className="mt-2 mb-0 text-[13px] text-cc-ink-muted">
          Nobody but you. An invitation gives read access to the whole project, source code
          included — generating, confirming, signing and exporting stay with you.
        </p>
      ) : (
        <ul className="mt-2 mb-0 list-none space-y-2 p-0">
          {access.entries.map((entry) => (
            <li
              key={entry.uid}
              data-workspace-access-row={entry.uid}
              className="flex flex-wrap items-center gap-x-3 gap-y-1"
            >
              <span data-workspace-access-email className="text-[13px] font-medium text-cc-ink">
                {entry.email}
              </span>
              <span data-workspace-access-since className="text-[12px] text-cc-ink-muted">
                Read access since {entry.since.slice(0, 10)}
              </span>
              <span className="ml-auto">
                <CcButton
                  variant="ghost"
                  tone="danger"
                  onClick={() => revoke(entry.uid)}
                  disabled={busyUid === entry.uid}
                  data-workspace-access-revoke={entry.uid}
                >
                  {busyUid === entry.uid ? 'Revoking…' : 'Revoke'}
                </CcButton>
              </span>
            </li>
          ))}
        </ul>
      )}

      {access.unaccountedUids.length > 0 ? (
        // A uid the rules would let read, with no accepted invitation behind
        // it, is a fault worth seeing rather than one worth hiding.
        <p data-workspace-access-unaccounted className="mt-2 mb-0 text-[12px] text-cc-ink-muted">
          {access.unaccountedUids.length} account
          {access.unaccountedUids.length === 1 ? '' : 's'} on the read list without a matching
          invitation. Please report this — it should not happen.
        </p>
      ) : null}

      {error ? (
        <p data-workspace-access-error className="mt-2 mb-0 text-[12px] text-cc-ink">
          {error}
        </p>
      ) : null}
    </section>
  );
}
