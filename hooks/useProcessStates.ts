'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { readProcessStatesOutcome, type StatesReadOutcome } from '@/lib/process-states-client';
import type { ProcessStateView } from '@/lib/process-states';

/**
 * The confirmations of one project's rules — roadmap 3.5 — read once per page.
 *
 * Two places on the Business view ask the same question: the first look's
 * "Rules confirmed x of n" and the rule list under *Need & process*. One store
 * per project id, so both read one answer and a save in the editor updates the
 * figure in the card above it in the same render, instead of two requests and,
 * for a moment, two different numbers on one screen.
 *
 * Nothing here is stored in the browser beyond the life of the page: it is a
 * cache of a GET, filled again on the next visit.
 */
export interface ProcessStatesState {
  /** `null` while the first read is in flight. */
  outcome: StatesReadOutcome | null;
}

type Entry = { state: ProcessStatesState; listeners: Set<() => void>; loading: boolean };

const STORE = new Map<string, Entry>();
const EMPTY: ProcessStatesState = { outcome: null };

function entryOf(projectId: string): Entry {
  let entry = STORE.get(projectId);
  if (!entry) {
    entry = { state: EMPTY, listeners: new Set(), loading: false };
    STORE.set(projectId, entry);
  }
  return entry;
}

function publish(projectId: string, state: ProcessStatesState) {
  const entry = entryOf(projectId);
  entry.state = state;
  for (const listener of entry.listeners) listener();
}

async function load(projectId: string) {
  const entry = entryOf(projectId);
  if (entry.loading) return;
  entry.loading = true;
  try {
    publish(projectId, { outcome: await readProcessStatesOutcome(projectId) });
  } finally {
    entry.loading = false;
  }
}

/** Hand the store a view a save returned, so every reader of it moves at once. */
export function publishProcessStates(projectId: string, view: ProcessStateView) {
  publish(projectId, { outcome: { ok: true, view } });
}

export function useProcessStates(projectId: string, enabled = true) {
  const subscribe = useCallback(
    (listener: () => void) => {
      const entry = entryOf(projectId);
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    [projectId],
  );
  const state = useSyncExternalStore(
    subscribe,
    () => entryOf(projectId).state,
    () => EMPTY,
  );

  useEffect(() => {
    if (!enabled || !projectId) return;
    if (entryOf(projectId).state.outcome === null) void load(projectId);
  }, [projectId, enabled]);

  const reload = useCallback(() => load(projectId), [projectId]);
  return { outcome: state.outcome, reload };
}
