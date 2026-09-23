'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import { createStandProbe, standMoved, type RevisionStand } from '@/lib/workspace-revision';

/**
 * The workspace's Stand, and the two exits when it has moved — roadmap 6.9,
 * CR-15.
 *
 * The shell used to say nothing about which revision of the process it was
 * drawn from. A second tab, or a colleague with read-and-confirm access, moved
 * the Stand and the open screen carried on looking authoritative. The finding
 * asks for three things and this hook is all three:
 *
 *   - the **Stand** the screen is showing, for the badge;
 *   - a **check** at the three moments it is worth asking — the screen coming
 *     back into focus, a reload, and immediately before a writing action;
 *   - when it has moved, the two exits and only those two: *keep* the old
 *     Stand, which dismisses the notice and changes nothing, or *refresh*,
 *     which fetches the page again. There is deliberately no third exit that
 *     merges anything: this hook knows a number, not what is on the screen.
 *
 * **What it costs.** Every check goes through one `createStandProbe`, held for
 * the life of the component: one request per ten-second window, under any
 * concurrency, whichever of the three triggers fires. The reasoning and the
 * arithmetic are in `lib/workspace-revision.ts`; what matters here is that the
 * probe is created once per project and never per event, because a probe
 * created inside a handler bounds nothing.
 *
 * **Nothing is written.** Not the view, not the focus, not the Stand. The
 * check is a GET; `keep` and `refresh` touch no store. Management/Business/IT
 * are views and never an attribute on an artefact (`docs/ROADMAP.md` §8,
 * `tests/view-attribute-guard.spec.ts`), and a Stand notice that recorded
 * anything would be the first place that rule broke.
 *
 * **No model call.** The Stand is a number out of a Firestore document.
 */

/** The address of the cheap Stand read — one document, not the history. */
export function revisionStandPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/process-revisions?stand=1`;
}

/**
 * The newest revision of a project's process, or `null` when it cannot be read.
 *
 * A failure is `null` and never a throw: a Stand that could not be fetched is
 * not a change, and a notice raised by a flaky network would be worse than no
 * notice at all.
 */
export async function fetchRevisionStand(projectId: string): Promise<RevisionStand | null> {
  try {
    const user = getAuth().currentUser;
    const headers: Record<string, string> = user
      ? { Authorization: `Bearer ${await user.getIdToken()}` }
      : {};
    const res = await fetch(revisionStandPath(projectId), { headers, cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { latest?: unknown };
    return { revision: typeof body.latest === 'number' ? body.latest : null };
  } catch {
    return null;
  }
}

export interface WorkspaceRevision {
  /** The Stand this screen is showing, or `undefined` before the first check. */
  held: number | null | undefined;
  /** The newest Stand seen, or `undefined` before the first check. */
  seen: number | null | undefined;
  /** True exactly while the two exits are the reader's only sensible next move. */
  moved: boolean;
  /** "Keep the old Stand": the notice goes, the screen does not change. */
  keep: () => void;
  /** "Refresh": fetch the page again — query and `#fragment` included. */
  refresh: () => void;
  /**
   * The check before a writing action. Resolves `true` when the caller may go
   * ahead, `false` when the Stand has moved and the notice is now up.
   *
   * It answers from the last verdict inside the probe's window rather than
   * forcing a read. That is safe because it is not what protects anything: the
   * routes behind every write carry the `baseRevision` the screen was made on
   * and refuse a stale one themselves. This is what keeps a reader from typing
   * into a dead screen, not what keeps the store consistent.
   */
  checkBeforeWrite: () => Promise<boolean>;
}

export function useWorkspaceRevision(
  projectId: string,
  options?: {
    /** Injected for the spec — the browser's own reload otherwise. */
    reload?: () => void;
    read?: (projectId: string) => Promise<RevisionStand | null>;
  },
): WorkspaceRevision {
  const read = options?.read ?? fetchRevisionStand;
  const reload = options?.reload;

  const [held, setHeld] = useState<number | null | undefined>(undefined);
  const [seen, setSeen] = useState<number | null | undefined>(undefined);

  // One probe per project, for the life of the screen. Created in a `useMemo`
  // rather than in the effect below, because the "before a write" check is
  // raised from a handler and has to share the same window as the focus check —
  // two probes would be two windows and twice the reads.
  const probe = useMemo(
    () => createStandProbe(() => (projectId ? read(projectId) : Promise.resolve(null))),
    [projectId, read],
  );

  // The first answer is the Stand this screen is *on*, not a change to report.
  const first = useRef(true);
  useEffect(() => {
    first.current = true;
  }, [projectId]);

  const check = useCallback(async (): Promise<number | null | undefined> => {
    const stand = await probe();
    if (!stand) return undefined;
    setSeen(stand.revision);
    if (first.current) {
      first.current = false;
      setHeld(stand.revision);
      return stand.revision;
    }
    return stand.revision;
  }, [probe]);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    // On mount — which is also what a reload is, from this hook's side.
    void check();
    const onFocus = () => {
      if (alive) void check();
    };
    const onVisible = () => {
      if (alive && document.visibilityState === 'visible') void check();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [projectId, check]);

  const keep = useCallback(() => {
    // The reader chose the screen they have. Holding what was seen is what
    // makes the notice stay away until the Stand moves *again*.
    setHeld(seen);
  }, [seen]);

  const refresh = useCallback(() => {
    if (reload) {
      reload();
      return;
    }
    // A full reload rather than a router refresh: the project is hydrated in a
    // client effect, so a server re-render would not fetch it again. It also
    // keeps the address exactly as it is — query *and* `#fragment` — which is
    // the same promise the view switch makes (CR-14).
    if (typeof window !== 'undefined') window.location.reload();
  }, [reload]);

  const checkBeforeWrite = useCallback(async () => {
    const latest = await check();
    // A Stand that could not be read is not a change: a write must not be
    // blocked because the network hiccuped, and the route will refuse it on
    // `baseRevision` if it really is stale.
    if (latest === undefined) return true;
    return !standMoved(held, latest);
  }, [check, held]);

  return {
    held,
    seen,
    moved: standMoved(held, seen),
    keep,
    refresh,
    checkBeforeWrite,
  };
}
