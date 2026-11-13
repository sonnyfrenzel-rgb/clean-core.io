'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  ANALYZE_PROGRESS_EVENT,
  NO_PROGRESS,
  announceProgress,
  browserStore,
  markLaterToolOpened,
  markWalked,
  progressOfSnapshot,
  progressSnapshot,
  readProgress,
  setNextHidden,
  type AnalyzeProgress,
} from '@/lib/analyze-progress';

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith('cc.analyze.')) onChange();
  };
  window.addEventListener(ANALYZE_PROGRESS_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  // Back from a later tool can restore the page from the back-forward cache.
  window.addEventListener('pageshow', onChange);
  return () => {
    window.removeEventListener(ANALYZE_PROGRESS_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('pageshow', onChange);
  };
}

const SERVER = progressSnapshot(NO_PROGRESS);

/**
 * The reader's progress with Analyze for one project, in this browser (`lib/analyze-progress.ts`). The server and the
 * first client frame answer "nothing yet", so a hint or a card that depends on it appears once the browser was asked,
 * never the other way round. `null` (no project) is "nothing yet" and writes nothing.
 */
export function useAnalyzeProgress(projectId: string | null): {
  progress: AnalyzeProgress;
  markWalked: () => void;
  setNextHidden: (hidden: boolean) => void;
  markLaterToolOpened: () => void;
} {
  const read = useCallback(() => (projectId ? progressSnapshot(readProgress(browserStore(), projectId)) : SERVER), [projectId]);
  const snapshot = useSyncExternalStore(subscribe, read, () => SERVER);
  const progress = useMemo(() => progressOfSnapshot(snapshot), [snapshot]);
  const walked = useCallback(() => {
    if (projectId && markWalked(browserStore(), projectId, new Date())) announceProgress();
  }, [projectId]);
  const hide = useCallback(
    (hidden: boolean) => {
      if (projectId && setNextHidden(browserStore(), projectId, hidden)) announceProgress();
    },
    [projectId],
  );
  const opened = useCallback(() => {
    if (projectId && markLaterToolOpened(browserStore(), projectId)) announceProgress();
  }, [projectId]);
  return { progress, markWalked: walked, setNextHidden: hide, markLaterToolOpened: opened };
}
