'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchFitToStandard, type FitToStandardRead } from '@/lib/fit-to-standard-client';
import { fitReadKey } from '@/lib/fit-to-standard-store';

/**
 * The fit-to-standard reading of one project (roadmap 3.0.20) — the gate and
 * the design, read from the server. Only for a project with source and a signed
 * run: without one the gate is "not determined" and nothing is asked.
 */
export type FitToStandardState =
  | { phase: 'off' }
  | { phase: 'loading' }
  | { phase: 'failed'; code: 'no-source' | 'source-too-large' | 'unreachable' }
  | { phase: 'ready'; value: FitToStandardRead };

type ProjectLike = { legacyCode?: unknown; activeRunId?: unknown; fitToStandard?: unknown } | null | undefined;

export function useFitToStandard(projectId: string | null | undefined, project: ProjectLike): { fit: FitToStandardState; reload: () => void } {
  const runId = typeof project?.activeRunId === 'string' ? project.activeRunId : '';
  const enabled = !!projectId && !!project && typeof project.legacyCode === 'string' && project.legacyCode.trim() !== '' && runId !== '';
  const [tick, setTick] = useState(0);
  // The stored revision and the staged source move the key: a write elsewhere,
  // or an edit of the source, is read again (`fitReadKey`).
  const key = fitReadKey(projectId, project, tick);
  const [result, setResult] = useState<{ key: string; state: FitToStandardState } | null>(null);
  useEffect(() => {
    if (!enabled || !projectId) return;
    let live = true;
    void fetchFitToStandard(projectId, key).then((next) => {
      if (!live) return;
      setResult({ key, state: next.ok ? { phase: 'ready', value: next.value } : { phase: 'failed', code: next.code } });
    });
    return () => {
      live = false;
    };
  }, [enabled, projectId, key]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const fit: FitToStandardState = !enabled ? { phase: 'off' } : result && result.key === key ? result.state : { phase: 'loading' };
  return { fit, reload };
}
