'use client';

import { useEffect, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import type { ItFindingsSource } from '@/lib/it-findings';

/**
 * The findings route's answer for a project (`/api/projects/<id>/findings`): the findings with both catalog views,
 * what the code uses, the catalog snapshot and the DDIC types — read on the server, because the engine behind them
 * reaches a 4.3 MB catalog that has no business in a browser (`lib/first-look.ts`).
 *
 * `undefined` while the read is in flight, `null` when it failed or was refused, the answer when it answered — `null`
 * is not "none". A client navigation that changes `projectId` reads again; an answer of the previous project is never
 * returned for the next. Read by Analyze's IT view (AB-9) and the demo's IT answers.
 */
export function useItFindings(projectId: string, enabled: boolean): ItFindingsSource | null | undefined {
  const [loaded, setLoaded] = useState<{ projectId: string; source: ItFindingsSource | null } | null>(null);

  useEffect(() => {
    if (!projectId || !enabled) return;
    let cancelled = false;
    const setSource = (value: ItFindingsSource | null) => {
      if (!cancelled) setLoaded({ projectId, source: value });
    };
    (async () => {
      try {
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) {
          setSource(null);
          return;
        }
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/findings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        // A refused read and a network fault look the same from here: nothing is known about the findings.
        if (!res.ok) {
          setSource(null);
          return;
        }
        setSource((await res.json()) as ItFindingsSource);
      } catch {
        setSource(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, enabled]);

  return loaded && loaded.projectId === projectId ? loaded.source : undefined;
}
