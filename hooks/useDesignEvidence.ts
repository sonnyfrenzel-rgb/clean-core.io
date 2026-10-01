'use client';

import { useEffect, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import type { ArchitectureContract } from '@/lib/architecture-contract';
import type { ItFindingRow } from '@/lib/it-findings';

/**
 * What the Design canvas is drawn from, read from the two server routes that
 * hold the catalog — never recomputed in the browser:
 *
 *   - `GET /api/projects/{id}/contract` — the architecture contract (roadmap
 *     8.2/8.3), the one document that says which route was chosen;
 *   - `GET /api/projects/{id}/findings` — the engine's findings with the
 *     catalog's successor for each (roadmap 8.1).
 *
 * A failed or refused read is `absent` with the server's sentence, never a
 * picture guessed from the router's recommendation. `version` re-reads both,
 * after a sign-off has moved the contract.
 */
export type DesignEvidence =
  | { state: 'loading' }
  | { state: 'absent'; reason: string }
  | {
      state: 'ready';
      contract: ArchitectureContract | null;
      /** The server's sentence when it built no contract (an off-track decision, no source). */
      contractSentence: string | null;
      findings: ItFindingRow[];
      /** The findings route failed; the canvas draws the route without the boxes. */
      findingsUnread: string | null;
    };

const UNREAD = 'The architecture contract could not be read. Reload the page to try again.';

async function readJson(url: string, token: string): Promise<{ ok: boolean; body: Record<string, unknown> | null }> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: res.ok, body };
}

export function useDesignEvidence(projectId: string, enabled: boolean, version: number): DesignEvidence {
  const [read, setRead] = useState<{ key: string; value: DesignEvidence } | null>(null);
  const key = `${projectId}#${version}`;
  useEffect(() => {
    if (!enabled || !projectId) return undefined;
    let cancelled = false;
    const done = (value: DesignEvidence) => {
      if (!cancelled) setRead({ key, value });
    };
    (async () => {
      try {
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) return done({ state: 'absent', reason: UNREAD });
        const id = encodeURIComponent(projectId);
        const [contract, findings] = await Promise.all([
          readJson(`/api/projects/${id}/contract`, token),
          readJson(`/api/projects/${id}/findings`, token).catch(() => ({ ok: false, body: null })),
        ]);
        if (!contract.ok || !contract.body) {
          return done({ state: 'absent', reason: (contract.body?.error as string) || UNREAD });
        }
        const decision = contract.body.decision as { ok?: boolean; sentence?: string } | undefined;
        const rows = findings.ok && Array.isArray(findings.body?.rows) ? (findings.body!.rows as ItFindingRow[]) : [];
        done({
          state: 'ready',
          contract: (contract.body.contract as ArchitectureContract | null) ?? null,
          contractSentence: decision && decision.ok === false && decision.sentence ? decision.sentence : null,
          findings: rows,
          findingsUnread: findings.ok
            ? null
            : (findings.body?.error as string) || 'The findings could not be read, so the boxes of the picture are missing.',
        });
      } catch {
        done({ state: 'absent', reason: UNREAD });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, enabled, key]);
  if (!enabled) return { state: 'loading' };
  return read && read.key === key ? read.value : { state: 'loading' };
}
