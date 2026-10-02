import { useEffect, useState } from 'react';

/**
 * The deterministic evidence engine, loaded when a screen needs it rather than
 * with the page (external audit PERF-01, 02.10.2026).
 *
 * `lib/abap/evidence-model.ts` reads the merged SAP catalog, and the catalog is
 * ~4.5 MB of generated JSON (`lib/abap/generated/`). A static import from a
 * client component put all of it into a chunk every workspace and stage page
 * loaded before it could paint. The dynamic `import()` below gives the engine
 * a chunk of its own that is fetched the first time a screen asks for it.
 *
 * The engine is the same module and the same call — only *when* it arrives
 * changes. Nothing here computes a finding; callers call `buildAbapEvidence`
 * exactly as they did. The signed run is still computed on the server
 * (`app/api/runs/create`), which never went through this path.
 *
 * Once loaded the module is held here, so a second screen in the same visit
 * gets it synchronously on its first render and shows no loading state.
 *
 * `tests/client-catalog-boundary.spec.ts` names this file as one of the few
 * places allowed to reach the catalog, and only through a dynamic import.
 */
export type EvidenceEngine = typeof import('@/lib/abap/evidence-model');

let loaded: EvidenceEngine | null = null;
let pending: Promise<EvidenceEngine> | null = null;

/** The engine module; one network fetch per visit, however many callers ask. */
export function loadEvidenceEngine(): Promise<EvidenceEngine> {
  if (loaded) return Promise.resolve(loaded);
  if (!pending) {
    pending = import('@/lib/abap/evidence-model').then(
      (m) => {
        loaded = m;
        return m;
      },
      (err: unknown) => {
        // A failed chunk fetch may succeed on the next attempt.
        pending = null;
        throw err;
      },
    );
  }
  return pending;
}

export interface EvidenceEngineState {
  /** The module once it is here; `null` while it loads, or when it failed. */
  engine: EvidenceEngine | null;
  /** The chunk could not be loaded. A caller says so rather than showing an empty result. */
  failed: boolean;
}

/**
 * The engine for a component. `wanted` is false while there is nothing to
 * analyse, so a screen with no source never fetches it.
 */
export function useEvidenceEngine(wanted: boolean): EvidenceEngineState {
  const [engine, setEngine] = useState<EvidenceEngine | null>(loaded);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!wanted || engine) return;
    let cancelled = false;
    loadEvidenceEngine().then(
      (m) => {
        if (!cancelled) {
          setFailed(false);
          setEngine(() => m);
        }
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [wanted, engine]);

  return { engine, failed };
}
