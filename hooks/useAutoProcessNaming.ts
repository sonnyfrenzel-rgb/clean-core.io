import { useCallback, useEffect, useRef, useState } from 'react';
import { askModeOf } from '@/lib/auto-steps';
import { sha256Hex } from '@/lib/artefact-digest';
import {
  PROCESS_NAMING_STORED_EVENT,
  namingModelEnabled,
  shouldAskNaming,
  takeFirstNamingAsk,
  type NamingAvailability,
  type NamingState,
} from '@/lib/process-naming';

/**
 * Every project and source digest asked for in this browser session — kept
 * outside the component, so switching views or reopening the project does not
 * ask again for the same source, whatever the first answer was.
 */
const ASKED = new Set<string>();

/**
 * The business names of a project's process, asked for automatically — owner
 * decision 21.10.2026, the same way as the plain wording (`hooks/usePlainWording.ts`).
 *
 * Once the map is drawn (`state` is the naming state of the drawn map) and has
 * no naming for exactly this source, the owner's browser asks the model once —
 * only when the availability answer is in, a key is there and the naming stage
 * is on. Every server check of the naming route stands: the skeleton is rebuilt
 * there, every name is validated against it, the answer's receipt is verified.
 * A stored naming is announced (`onStored` and `PROCESS_NAMING_STORED_EVENT`),
 * so every reader of it on the page reads it again. Without a model, while it
 * loads, and when anything is refused, the engine's plain names stand and the
 * reader sees no error.
 *
 * 3.0.21 (owner decision B6): with the account's own key and "Automatic steps"
 * off for it (`autoAllowed` false), nothing is asked by itself — the hook hands
 * the page a click instead (`askNow`), once per project and source like the
 * automatic ask, and the call goes out only on that click.
 */
export function useAutoProcessNaming(input: {
  projectId: string | null;
  source: string | null;
  owner: boolean;
  availability: NamingAvailability | null;
  state: NamingState | null;
  onStored?: () => void;
  /** May the names be asked for by itself — `useModelAvailability().autoSteps`. */
  autoAllowed: boolean;
}): { state: 'idle' | 'asking'; askNow: (() => void) | null } {
  const { projectId, source, owner, availability, state, onStored, autoAllowed } = input;
  const [asking, setAsking] = useState(false);
  const [clickedFor, setClickedFor] = useState<string | null>(null);
  const modelEnabled = namingModelEnabled(availability);
  // Primitives for the dependency list: the availability object is new on every render.
  const keyAvailable = availability?.keyAvailable === true;
  const known = availability?.known === true;
  // `onStored` is a callback of the page, new on every render: read through a
  // ref, so a new one never asks again.
  const storedRef = useRef(onStored);
  useEffect(() => {
    storedRef.current = onStored;
  }, [onStored]);

  const ask = useCallback(
    (pid: string, src: string, automatic: boolean) => {
      // Not cancelled by a later render: the ask is taken once, so its answer
      // is always announced and the wait always ends.
      void (async () => {
        setAsking(true);
        try {
          const [naming, client] = await Promise.all([import('@/lib/process-naming'), import('@/lib/process-naming-client')]);
          const outcome = await client.requestProcessNaming(
            pid,
            naming.namingContextOf(src),
            { known, keyAvailable, stages: { [naming.NAMING_STAGE]: modelEnabled } },
            undefined,
            { automatic },
          );
          if (!outcome.ok) return;
          window.dispatchEvent(new CustomEvent(PROCESS_NAMING_STORED_EVENT, { detail: pid }));
          storedRef.current?.();
        } catch {
          // The plain names stand.
        } finally {
          setAsking(false);
        }
      })();
    },
    [known, keyAvailable, modelEnabled],
  );

  const digest = source ? sha256Hex(source) : null;
  const mode = projectId && digest ? askModeOf({ wanted: shouldAskNaming({ owner, modelEnabled, state }), autoAllowed }) : null;

  useEffect(() => {
    if (!projectId || !source || !digest || mode !== 'auto') return;
    if (!takeFirstNamingAsk(ASKED, projectId, digest)) return;
    ask(projectId, source, true);
  }, [projectId, source, digest, mode, ask]);

  const askNow = useCallback(() => {
    if (!projectId || !source || !digest) return;
    setClickedFor(digest);
    if (!takeFirstNamingAsk(ASKED, projectId, digest)) return;
    ask(projectId, source, false);
  }, [projectId, source, digest, ask]);

  return {
    state: asking ? 'asking' : 'idle',
    askNow: mode === 'click' && clickedFor !== digest && !asking ? askNow : null,
  };
}
