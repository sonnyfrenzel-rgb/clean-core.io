'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { ANALYSIS_READ_EVENT, ANALYSIS_READ_KEY, analysisRead } from '@/lib/analysis-read';

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === ANALYSIS_READ_KEY) onChange();
  };
  window.addEventListener(ANALYSIS_READ_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  // Back from Analyze can restore this page from the back-forward cache.
  window.addEventListener('pageshow', onChange);
  return () => {
    window.removeEventListener(ANALYSIS_READ_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('pageshow', onChange);
  };
}

/**
 * Whether this browser has opened Analyze for `key` (`lib/analysis-read.ts`).
 *
 * The server and the first client frame answer "read", so the hint never
 * renders on the server and then disappears: it appears once the browser has
 * been asked. `null` (no key) is "read" — nothing to point at.
 */
export function useAnalysisRead(key: string | null): boolean {
  const read = useCallback(() => (key === null ? true : analysisRead(key)), [key]);
  return useSyncExternalStore(subscribe, read, () => true);
}
