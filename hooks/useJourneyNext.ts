'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAuthIfStarted } from '@/lib/firebase';
import { decisionOfRead, journeyNext, type JourneyNext } from '@/lib/journey-next';
import type { DecisionRead } from '@/lib/management-overview';
import type { RedesignDecision } from '@/lib/redesign';
import type { PhaseKey, RailStep } from '@/lib/workflow-steps';
import { useUserProfile } from '@/hooks/useUserProfile';

/**
 * The one next step for a tool's header (journey review 26.11.2026, M2): computed once and handed to both the tool
 * row's "Next" tag and the next-step bar, so the two can never point to different places. `null` until the project
 * and the decision are read — a step worked out from a project not yet loaded said "Run the analysis first" on a
 * signed project (walk-through 26.11.2026, finding 2).
 */
export function useJourneyNext({
  steps,
  here,
  projectId,
  demo,
  loaded,
}: {
  steps: readonly RailStep[] | null;
  here: PhaseKey | 'redesign' | null;
  projectId: string;
  demo: boolean;
  /** The page's project is read (always true for the demo). */
  loaded: boolean;
}): JourneyNext | null {
  const hasRun = Boolean(steps?.some((s) => s.key === 'analyze' && s.state !== 'empty'));
  // The read is bound to the project it was made for: a read of the previous project never drives this one's way on.
  // `failed` is not "no decision": no step that depends on the decision is named from it.
  const [read, setRead] = useState<{ projectId: string; state: 'ready' | 'failed'; value: DecisionRead | null } | null>(null);
  const { profile } = useUserProfile();

  useEffect(() => {
    if (demo || !projectId || !loaded || !hasRun) return;
    let cancelled = false;
    void (async () => {
      try {
        // `getAuthIfStarted`: this hook stands in every tool's header, the public demo's too, and must never be the one
        // that starts Auth (public-no-google-before-signin-guard); on a project the shell has started it already.
        const token = await getAuthIfStarted()?.currentUser?.getIdToken();
        if (!token) {
          if (!cancelled) setRead({ projectId, state: 'failed', value: null });
          return;
        }
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/decision`, { headers: { Authorization: `Bearer ${token}` } });
        const json = (await res.json().catch(() => null)) as DecisionRead | null;
        if (!cancelled) setRead(res.ok && json && json.draft ? { projectId, state: 'ready', value: json } : { projectId, state: 'failed', value: null });
      } catch {
        if (!cancelled) setRead({ projectId, state: 'failed', value: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo, projectId, loaded, hasRun]);

  return useMemo(() => {
    if (!steps || !loaded) return null;
    // The demo reads the way on as if its reading were signed, as its Re-design page does (`DemoRedesign`).
    const ways = demo ? steps.map((s) => (s.key === 'analyze' ? { ...s, state: 'done' as const, done: true } : s)) : steps;
    const own = read && read.projectId === projectId ? read : null;
    // Not read yet for this project, or the read failed: no step that depends on the decision is named.
    if (!demo && hasRun && (!own || own.state === 'failed')) return null;
    const decision: RedesignDecision = demo || !hasRun ? { stage: 'not-decided', option: null, indicated: null } : decisionOfRead(own?.value ?? null, false);
    return journeyNext(ways, decision, here, profile);
  }, [steps, loaded, demo, hasRun, read, projectId, here, profile]);
}
