'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import CcButton from '@/components/cc/Button';
import CcMessageBox from '@/components/cc/MessageBox';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { formatTextDate } from '@/lib/format';
import {
  loadAccountOpenInvitations,
  loadOpenInvitations,
  withdrawInvitation,
  type OpenInvitationEntry,
} from '@/lib/project-readers-client';
import { wt, withdrawSentence } from '@/lib/workspace-messages';

/**
 * Invitations nobody has answered yet — owner decision 01.10.2026: while an
 * invitation is unanswered, the person who sent it sees the address, the date
 * it expires, and a way to withdraw it.
 *
 * Two places, one list. In the share dialog it is one project's
 * (`projectId`); in the sharing section of "My workspace" it is every project
 * this account owns, each entry naming its project. Both read from the owner-
 * only routes and render nothing for anyone else — a reader of a shared
 * project gets the routes' 404 and sees no list, so no third party's address
 * reaches them.
 *
 * The withdrawal is the server's (`DELETE …/invitations/{id}`): the link stops
 * working when it returns, and the entry leaves the list because the list is
 * read again, not because this component decided it was gone.
 */
export default function OpenInvitations({
  projectId,
  refreshKey = 0,
  emptyText,
  onCount,
}: {
  /** One project's invitations; omitted for every project this account owns. */
  projectId?: string;
  /** Changes whenever the caller knows the list changed — after a send, say. */
  refreshKey?: number;
  /** Shown when nothing is waiting. Omitted: the section renders nothing. */
  emptyText?: string;
  /** Told how many are waiting, once read. */
  onCount?: (n: number) => void;
}) {
  const [entries, setEntries] = useState<OpenInvitationEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A withdrawal is not undoable — the link is dead — so it is asked, in a
  // Message Box, like every destructive action (§1.5, §2.6).
  const [asking, setAsking] = useState<OpenInvitationEntry | null>(null);

  const load = useCallback(
    () => (projectId ? loadOpenInvitations(projectId) : loadAccountOpenInvitations()),
    [projectId],
  );

  useEffect(() => {
    let alive = true;
    load().then((list) => {
      if (!alive) return;
      setEntries(list);
      if (list && onCount) onCount(list.length);
    });
    return () => {
      alive = false;
    };
  }, [load, refreshKey, onCount]);

  const withdraw = useCallback(
    async (entry: OpenInvitationEntry) => {
      const owner = projectId ?? entry.projectId;
      if (!owner) return;
      setBusy(entry.id);
      setError(null);
      try {
        await withdrawInvitation(owner, entry.id);
        const list = await load();
        setEntries(list);
        if (list && onCount) onCount(list.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : wt('invites.withdrawFailed'));
      } finally {
        setBusy(null);
      }
    },
    [projectId, load, onCount],
  );

  // Not the owner, or the read failed: no frame and no placeholder.
  if (entries === null) return null;
  if (entries.length === 0 && !emptyText) return null;

  return (
    <section data-open-invitations={projectId ? 'project' : 'account'} aria-labelledby="open-invitations-title">
      <h3
        id="open-invitations-title"
        className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase"
      >
        {wt('invites.waitingTitle')}
      </h3>
      {entries.length === 0 ? (
        <p data-open-invitations-empty="" className="mt-2 mb-0 text-[13px] font-medium text-cc-ink-muted">
          {emptyText}
        </p>
      ) : (
        <ul className="mt-2 mb-0 flex list-none flex-col gap-2 p-0">
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-open-invitation={entry.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2"
            >
              <span className="min-w-0 flex-1 basis-56">
                <span data-open-invitation-email="" className="block truncate text-[13px] font-semibold text-cc-ink">
                  {entry.email}
                </span>
                <span className="block text-[12px] font-medium text-cc-ink-muted">
                  {entry.projectId && !projectId ? (
                    <>
                      <Link
                        href={`/project/${entry.projectId}`}
                        className="font-semibold text-cc-ink underline underline-offset-2"
                      >
                        {entry.projectName || entry.projectId}
                      </Link>
                      {' · '}
                    </>
                  ) : null}
                  <span data-open-invitation-expires="">
                    {wt('invites.expiresOn')} {formatTextDate(entry.expiresAt) ?? entry.expiresAt}
                  </span>
                </span>
              </span>
              <CcButton
                variant="ghost"
                tone="danger"
                busy={busy === entry.id}
                disabled={busy !== null}
                onClick={() => setAsking(entry)}
                data-open-invitation-withdraw={entry.id}
              >
                {wt('invites.withdraw')}
              </CcButton>
            </li>
          ))}
        </ul>
      )}
      <CcMessageBox
        open={asking !== null}
        title={wt('invites.withdrawTitle')}
        confirmLabel={wt('invites.withdraw')}
        onConfirm={() => {
          const entry = asking;
          setAsking(null);
          if (entry) void withdraw(entry);
        }}
        onCancel={() => setAsking(null)}
      >
        <p className="m-0">
          {asking ? withdrawSentence(asking.email) : null}
        </p>
      </CcMessageBox>
      {error ? (
        <div className="mt-2">
          <CcMessageStrip state="error" announce>
            {error}
          </CcMessageStrip>
        </div>
      ) : null}
    </section>
  );
}
