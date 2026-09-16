import { useCallback, useEffect, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import { MODEL_STAGES, modelStagesOf, type ModelStage } from '@/lib/model-stages';

/**
 * Whether a stage can call a model right now, and why not when it cannot.
 *
 * Roadmap 1.2. Two facts, one of which the browser cannot work out for itself:
 * the account's per-stage switch (readable from its own profile, but written
 * only by the server) and whether a Gemini key exists at all — the community
 * key lives in the server environment and a BYOK secret lives in a collection
 * the Firestore rules close to every client. `GET /api/model-stages` answers
 * both without the key leaving the server.
 *
 * Optimistic while it loads: `enabled` is true and `known` is false, so a
 * screen never flashes "not generated" at a reader whose key is fine. Nothing
 * is granted by that — the server decides every call, and a stage that is off
 * comes back refused with a reason.
 */

export interface ModelAvailability {
  /** True while the answer has not arrived — every field below is a guess until then. */
  loading: boolean;
  /** False when the request failed or was refused; the screen then says nothing about keys. */
  known: boolean;
  stages: Record<ModelStage, boolean>;
  keyAvailable: boolean;
  keySource: 'byok' | 'community' | null;
  /** The whole point: may this stage generate, given both facts? */
  enabled: (stage: ModelStage) => boolean;
  refresh: () => Promise<void>;
}

const ALL_ON = modelStagesOf(null);

export function useModelAvailability(): ModelAvailability {
  const [loading, setLoading] = useState(true);
  const [known, setKnown] = useState(false);
  const [stages, setStages] = useState<Record<ModelStage, boolean>>(ALL_ON);
  const [keyAvailable, setKeyAvailable] = useState(true);
  const [keySource, setKeySource] = useState<'byok' | 'community' | null>(null);

  const load = useCallback(async () => {
    try {
      const user = getAuth().currentUser;
      if (!user) {
        setLoading(false);
        return;
      }
      const idToken = await user.getIdToken();
      const res = await fetch('/api/model-stages', { headers: { Authorization: `Bearer ${idToken}` } });
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = (await res.json()) as {
        stages?: Record<string, boolean>;
        keyAvailable?: boolean;
        keySource?: 'byok' | 'community' | null;
      };
      setStages(modelStagesOf({ modelStages: data.stages }));
      setKeyAvailable(data.keyAvailable === true);
      setKeySource(data.keySource ?? null);
      setKnown(true);
    } catch {
      /* the screen falls back to "assume it works and let the server answer" */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // The profile is loaded by an auth listener elsewhere; this only needs a
    // user, so it retries briefly rather than racing sign-in.
    const attempt = async (left: number) => {
      if (cancelled) return;
      if (!getAuth().currentUser && left > 0) {
        setTimeout(() => attempt(left - 1), 500);
        return;
      }
      await load();
    };
    attempt(10);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const enabled = useCallback(
    (stage: ModelStage) => {
      if (!known) return true;
      return keyAvailable && stages[stage] === true;
    },
    [known, keyAvailable, stages],
  );

  return { loading, known, stages, keyAvailable, keySource, enabled, refresh: load };
}

export { MODEL_STAGES };
