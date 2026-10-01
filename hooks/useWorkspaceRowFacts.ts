'use client';

import { useEffect, useRef, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import type { ItFindingsSource } from '@/lib/it-findings';
import type { ProcessStateView } from '@/lib/process-states';
import { levelsOf, rulesOf, LOADING_FACTS, type RowFacts } from '@/lib/workspace-row-facts';

/**
 * Levels and confirmed rules for the rows of "My workspace" that are on screen
 * — mockup s7. See `lib/workspace-row-facts.ts` for what each figure means.
 *
 * Asked only for the rows the reader can see (the table shows five until "Show
 * all"), two projects at a time, and once per project and source: the findings
 * route runs the engine over the source, and a list of twenty-five is not a
 * reason to run it twenty-five times on every visit. A row whose key changes —
 * its source was replaced — is asked again.
 *
 * Read-only: both routes write nothing, and neither calls a model.
 */
const PARALLEL = 2;

async function authHeader(): Promise<Record<string, string>> {
  const token = await getAuth().currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function factsFor(projectId: string): Promise<RowFacts> {
  const headers = await authHeader();
  const id = encodeURIComponent(projectId);
  const [findings, states] = await Promise.all([
    fetch(`/api/projects/${id}/findings`, { headers })
      .then(async (res) => (res.ok ? ((await res.json()) as ItFindingsSource) : null))
      .catch(() => null),
    fetch(`/api/projects/${id}/process-states`, { headers })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { view?: ProcessStateView; code?: string } | null;
        return res.ok ? { view: body?.view ?? null, code: null } : { view: null, code: body?.code ?? null };
      })
      .catch(() => ({ view: null, code: null })),
  ]);
  return {
    levels: levelsOf(findings),
    rules: rulesOf(states.view, findings ? findings.rulesDerived : null, states.code),
  };
}

/**
 * @param wanted project id → a key that changes when the project's source
 *   changes. Rows without a source are not passed in — there is nothing to read.
 */
export function useWorkspaceRowFacts(wanted: ReadonlyMap<string, string>): Record<string, RowFacts> {
  const [facts, setFacts] = useState<Record<string, RowFacts>>({});
  const asked = useRef<Map<string, string>>(new Map());
  const queue = useRef<string[]>([]);
  const running = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const pump = () => {
      while (running.current < PARALLEL && queue.current.length > 0) {
        const id = queue.current.shift() as string;
        running.current += 1;
        factsFor(id)
          .then((value) => {
            if (alive.current) setFacts((prev) => ({ ...prev, [id]: value }));
          })
          .finally(() => {
            running.current -= 1;
            if (alive.current) pump();
          });
      }
    };
    const fresh: string[] = [];
    for (const [id, key] of wanted) {
      if (asked.current.get(id) === key) continue;
      asked.current.set(id, key);
      fresh.push(id);
    }
    if (fresh.length === 0) return;
    setFacts((prev) => {
      const next = { ...prev };
      for (const id of fresh) next[id] = LOADING_FACTS;
      return next;
    });
    queue.current.push(...fresh.filter((id) => !queue.current.includes(id)));
    pump();
  }, [wanted]);

  return facts;
}
