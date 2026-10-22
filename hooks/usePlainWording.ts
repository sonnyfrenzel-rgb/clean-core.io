import { useCallback, useEffect, useMemo, useState } from 'react';
import { askModeOf } from '@/lib/auto-steps';
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
 * Every project, scope and digest asked for in this browser session: one ask per
 * project, never again for the same one. Held by the module, not by the hook, so
 * a view that unmounts and comes back does not ask again.
 */
const askedThisSession = new Set<string>();

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
  /**
   * 3.0.21 (owner decision B6): may the rewording be asked for by itself —
   * `useModelAvailability().autoSteps`. False with an own key whose
   * "Automatic steps" are off: then it is offered on a click (`askNow`).
   */
  autoAllowed: boolean;
  initial?: PlainWordingRecord | null;
}): {
  say: (text: string, anchor: PlainRange | null) => WordedSentence;
  state: 'engine' | 'asking' | 'worded';
  /** Set when the rewording waits for a click (own key, automatic steps off); null otherwise. */
  askNow: (() => void) | null;
} {
  const { projectId, scope, source, sentences, owner, active, modelEnabled, autoAllowed, initial = null } = input;
  const [record, setRecord] = useState<PlainWordingRecord | null>(initial);
  const [asking, setAsking] = useState(false);
  // The stored record has been read for this digest — a click is offered only then.
  const [readFor, setReadFor] = useState<string | null>(null);
  const [clicked, setClicked] = useState(false);

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
      setReadFor(digest);
      const mode = askModeOf({ wanted: shouldAskPlainWording({ owner, modelEnabled, items: items.length, record: stored, digest }), autoAllowed });
      // On a click (own key, automatic steps off): nothing is asked here — `askNow` below does it.
      if (mode !== 'auto') return;
      // Once per project, scope and digest in this browser, whatever the answer: a refusal is not retried on every render.
      if (!takeFirstAsk(askedThisSession, projectId, scope, digest)) return;
      setAsking(true);
      const fresh = await client.requestPlainWording(projectId, scope, digest, items, { automatic: true });
      if (cancelled) return;
      setAsking(false);
      if (fresh) setRecord(fresh);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, projectId, scope, digest, items, owner, modelEnabled, autoAllowed, initial]);

  const clickMode =
    !clicked &&
    readFor === digest &&
    !!projectId &&
    askModeOf({ wanted: shouldAskPlainWording({ owner, modelEnabled, items: items.length, record, digest }), autoAllowed }) === 'click';
  const askNow = useCallback(() => {
    if (!projectId || !digest) return;
    setClicked(true);
    setAsking(true);
    void (async () => {
      const client = await import('@/lib/plain-wording-client');
      const fresh = await client.requestPlainWording(projectId, scope, digest, items, { automatic: false });
      setAsking(false);
      if (fresh) setRecord(fresh);
    })();
  }, [projectId, scope, digest, items]);

  const say = useMemo(() => (digest ? plainLookup(record, scope, digest) : ENGINE_ONLY), [record, scope, digest]);
  const worded = !!record && record.digest === digest && Object.keys(record.wording).length > 0;
  return { say, state: asking ? 'asking' : worded ? 'worded' : 'engine', askNow: clickMode ? askNow : null };
}
