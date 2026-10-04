'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { readSpecRecord, type RequirementsSpec, type SpecRecord } from '@/lib/requirements-spec';

/**
 * Saves the requirements specification while it is written — the Economics
 * pattern (a quiet "Saved", "Saving…", or "Not saved" with Retry), one save
 * per pause in typing.
 *
 * Every save names the revision it was made on; the route refuses a save over
 * a newer one (409), and then nothing is retried by itself — the page says the
 * document was saved elsewhere and offers to reload. A failed save keeps the
 * text on screen and says so; leaving with unsaved text asks first.
 */
export type SpecSaveState =
  | { state: 'idle' }
  | { state: 'pending' }
  | { state: 'saving' }
  | { state: 'saved'; at: string; revision: number }
  | { state: 'failed'; message: string }
  | { state: 'conflict' };

interface Pending {
  spec: RequirementsSpec;
  derivedFrom: string;
  change: string;
}

async function authHeader(): Promise<Record<string, string>> {
  const { getAuth } = await import('@/lib/firebase');
  const user = getAuth().currentUser;
  return user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {};
}

export function useSpecAutosave({
  projectId,
  enabled,
  baseRevision,
  onSaved,
  delayMs = 800,
}: {
  projectId: string | null;
  enabled: boolean;
  /** The revision on screen when the page read it; 0 when nothing was stored. */
  baseRevision: number;
  onSaved: (record: SpecRecord) => void;
  delayMs?: number;
}) {
  const [save, setSave] = useState<SpecSaveState>({ state: 'idle' });
  const pending = useRef<Pending | null>(null);
  const revision = useRef(baseRevision);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const stopped = useRef(false);
  const onSavedRef = useRef(onSaved);
  /** The save function, for the retry it schedules after itself. */
  const runRef = useRef<() => Promise<void>>(async () => undefined);
  useEffect(() => {
    onSavedRef.current = onSaved;
  });
  useEffect(() => {
    revision.current = baseRevision;
  }, [baseRevision]);

  const run = useCallback(async (): Promise<void> => {
    if (!projectId || !enabled || stopped.current) return;
    if (inFlight.current) return;
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    inFlight.current = true;
    setSave({ state: 'saving' });
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/requirements-spec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ spec: next.spec, baseRevision: revision.current, derivedFrom: next.derivedFrom, change: next.change }),
      });
      const body = (await res.json().catch(() => ({}))) as { record?: unknown; error?: string; code?: string };
      if (res.status === 409 && body.code === 'conflict') {
        stopped.current = true;
        pending.current = next;
        setSave({ state: 'conflict' });
        return;
      }
      const record = res.ok ? readSpecRecord(body.record) : null;
      if (!record) {
        // Kept for Retry — unless a newer edit has replaced it meanwhile.
        pending.current = pending.current ?? next;
        setSave({ state: 'failed', message: body.error || `the server answered ${res.status}` });
        return;
      }
      revision.current = record.revision;
      onSavedRef.current(record);
      setSave(pending.current ? { state: 'pending' } : { state: 'saved', at: record.savedAt, revision: record.revision });
    } catch (err) {
      pending.current = pending.current ?? next;
      setSave({ state: 'failed', message: err instanceof Error && err.message ? err.message : 'the connection failed' });
    } finally {
      inFlight.current = false;
    }
    // An edit made while this save was on its way goes out now.
    if (pending.current && !stopped.current) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void runRef.current(), 0);
    }
  }, [projectId, enabled]);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  /** Queue the document; it goes out after a pause. */
  const schedule = useCallback(
    (spec: RequirementsSpec, derivedFrom: string, change: string, immediately = false) => {
      if (!enabled || stopped.current) return;
      pending.current = { spec, derivedFrom, change };
      setSave((s) => (s.state === 'saving' ? s : { state: 'pending' }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void run(), immediately ? 0 : delayMs);
    },
    [enabled, run, delayMs],
  );

  const retry = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    void run();
  }, [run]);

  // Leaving with text that is not stored asks first (DESIGN.md §2.8).
  useEffect(() => {
    if (!enabled) return undefined;
    const onLeave = (event: BeforeUnloadEvent) => {
      if (pending.current || inFlight.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [enabled]);

  // Leaving the page inside the app (Back to Design, a tool) sends what waits, at once.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current && !stopped.current) void run();
    },
    [run],
  );

  return { save, schedule, retry };
}
