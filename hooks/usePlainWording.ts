import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ENGINE_ONLY,
  plainDigestOf,
  plainItemsOf,
  plainLookup,
  shouldAskPlainWording,
  takeFirstAsk,
  type PlainRange,
  type PlainScope,
  type PlainWordingRecord,
  type WordedSentence,
} from '@/lib/plain-wording';

/**
 * The plain wording of one scope's engine sentences — roadmap 3.0.20, owner
 * decision 21.10.2026 (2): automatic, once per project, source and engine.
 *
 * When the sentences are shown (`active`), the stored rewording is read; when
 * there is none for exactly these sentences, the owner's browser asks the model
 * once — only when the account can call a model for the business sentences
 * right now (a key, and that stage switched on). Without a model, without a
 * record, while it loads and when anything is refused, every sentence is the
 * engine's. The reader never sees an error for it.
 *
 * `initial` hands a record in without a fetch — for a rendered test, and for a
 * screen that already holds one.
 */
export function usePlainWording(input: {
  projectId: string | null;
  scope: PlainScope;
  source: string | null;
  sentences: ReadonlyArray<{ text: string; anchor: PlainRange | null }> | null;
  owner: boolean;
  /** Whether the sentences are on screen; nothing is read or asked before. */
  active: boolean;
  /** The account can call a model for the business sentences right now: known, a key, the stage on (`plainModelEnabled`). */
  modelEnabled: boolean;
  initial?: PlainWordingRecord | null;
}): { say: (text: string, anchor: PlainRange | null) => WordedSentence; state: 'engine' | 'asking' | 'worded' } {
  const { projectId, scope, source, sentences, owner, active, modelEnabled, initial = null } = input;
  const [record, setRecord] = useState<PlainWordingRecord | null>(initial);
  const [asking, setAsking] = useState(false);
  // Every project and digest asked for in this browser session (QA review of 45ab7b5f6a4c): one per project, never again for the same one.
  const asked = useRef<Set<string>>(new Set<string>());

  const items = useMemo(() => (sentences ? plainItemsOf(sentences) : []), [sentences]);
  const digest = useMemo(() => (source && items.length ? plainDigestOf(scope, source, items) : ''), [scope, source, items]);

  useEffect(() => {
    if (!active || !projectId || !digest || initial) return;
    let cancelled = false;
    void (async () => {
      const client = await import('@/lib/plain-wording-client');
      const stored = await client.fetchPlainWording(projectId, scope);
      if (cancelled) return;
      setRecord(stored);
      if (!shouldAskPlainWording({ owner, modelEnabled, items: items.length, record: stored, digest })) return;
      // Once per project, scope and digest in this browser, whatever the answer: a refusal is not retried on every render.
      if (!takeFirstAsk(asked.current, projectId, scope, digest)) return;
      setAsking(true);
      const fresh = await client.requestPlainWording(projectId, scope, digest, items);
      if (cancelled) return;
      setAsking(false);
      if (fresh) setRecord(fresh);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, projectId, scope, digest, items, owner, modelEnabled, initial]);

  const say = useMemo(() => (digest ? plainLookup(record, scope, digest) : ENGINE_ONLY), [record, scope, digest]);
  const worded = !!record && record.digest === digest && Object.keys(record.wording).length > 0;
  return { say, state: asking ? 'asking' : worded ? 'worded' : 'engine' };
}
