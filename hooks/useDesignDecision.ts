'use client';

import { useEffect, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import type { DecisionRead } from '@/lib/management-overview';

/**
 * The program decision as Design reads it (ADR-130 (2)): `GET /api/projects/{id}/decision`, the route the workspace's
 * decision card reads. Read only — Design writes nothing back and adds no field. A failed read is not a decision:
 * the page then works as without one, and says so.
 */
export type DesignDecisionRead =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; answer: DecisionRead };

export function useDesignDecision(projectId: string, enabled: boolean, version = 0): DesignDecisionRead {
  const [read, setRead] = useState<{ key: string; value: DesignDecisionRead } | null>(null);
  const key = `${projectId}#${version}`;
  useEffect(() => {
    if (!enabled || !projectId) return undefined;
    let cancelled = false;
    const done = (value: DesignDecisionRead) => {
      if (!cancelled) setRead({ key, value });
    };
    (async () => {
      try {
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) return done({ state: 'failed' });
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/decision`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json().catch(() => null)) as DecisionRead | null;
        if (!res.ok || !json || !json.draft) return done({ state: 'failed' });
        done({ state: 'ready', answer: json });
      } catch {
        done({ state: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, enabled, key]);
  return read && read.key === key ? read.value : { state: 'loading' };
}
