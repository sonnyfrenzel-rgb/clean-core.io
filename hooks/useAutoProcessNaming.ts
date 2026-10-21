import { useEffect, useState } from 'react';
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
 */
export function useAutoProcessNaming(input: {
  projectId: string | null;
  source: string | null;
  owner: boolean;
  availability: NamingAvailability | null;
  state: NamingState | null;
  onStored?: () => void;
}): 'idle' | 'asking' {
  const { projectId, source, owner, availability, state, onStored } = input;
  const [asking, setAsking] = useState(false);
  const modelEnabled = namingModelEnabled(availability);
  // Primitives for the dependency list: the availability object is new on every render.
  const keyAvailable = availability?.keyAvailable === true;
  const known = availability?.known === true;

  useEffect(() => {
    if (!projectId || !source) return;
    if (!shouldAskNaming({ owner, modelEnabled, state })) return;
    if (!takeFirstNamingAsk(ASKED, projectId, sha256Hex(source))) return;
    // Not cancelled by a later render: the ask is taken once, so its answer is
    // always announced and the wait always ends.
    void (async () => {
      setAsking(true);
      try {
        const [naming, client] = await Promise.all([import('@/lib/process-naming'), import('@/lib/process-naming-client')]);
        const outcome = await client.requestProcessNaming(projectId, naming.namingContextOf(source), {
          known,
          keyAvailable,
          stages: { [naming.NAMING_STAGE]: modelEnabled },
        });
        if (!outcome.ok) return;
        window.dispatchEvent(new CustomEvent(PROCESS_NAMING_STORED_EVENT, { detail: projectId }));
        onStored?.();
      } catch {
        // The plain names stand.
      } finally {
        setAsking(false);
      }
    })();
    // `onStored` is a callback of the page; a new one on every render must not ask again (and cannot: the ask is taken).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, source, owner, modelEnabled, state, known, keyAvailable]);

  return asking ? 'asking' : 'idle';
}
