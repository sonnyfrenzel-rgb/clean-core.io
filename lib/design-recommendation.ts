/**
 * What the Design stage's decision card names as the target, and what it says
 * about a stored value that disagrees.
 *
 * The page used to title the card with `recommendedArchitecture()` of the
 * project — `originalRecommendation` of the run, else `extensibilityRoute` —
 * while the canvas, the route figure, the card's own sentence and the
 * alternatives all came from the architecture contract, which the server
 * derives from the source *now* (`lib/contract-build.ts`). When the two
 * disagreed the card said "Recommended: Side-by-Side (CAP)" above a sentence
 * recommending RAP, beside an alternatives list calling CAP rejected.
 *
 * They do disagree for real projects, not only for a fixture:
 *   - `extensibilityRoute` is the Analyze stage's route switch, written from the
 *     browser (`firestore.rules` allowlist) — a setting, not a recommendation;
 *   - a project from before signed runs has no `originalRecommendation`, so
 *     whatever `extensibilityRoute` holds is all there is;
 *   - a run's `originalRecommendation` was routed with the rules and catalog of
 *     its day; the contract is routed with today's.
 *
 * So the contract is the answer, and a stored value that differs is named for
 * what it is — "your setting", "the analysis on record" — and never as the
 * recommendation. Pure: no React, no Firestore, so a spec can hold it.
 */
import type { TargetRoute } from './architecture-contract';
import type { TargetArchitectureCode } from './project-commands';

/** Where a stored value came from. */
export type StoredRouteSource = 'run' | 'setting';

export interface StoredRoute {
  code: TargetArchitectureCode;
  source: StoredRouteSource;
}

export type DesignAnswerKind =
  /** The contract's recommendation. */
  | 'recommended'
  /** A declared deviation the contract applies. */
  | 'chosen'
  /** No contract to read; only a stored value, labelled as stored. */
  | 'stored'
  /** The contract is still being read. */
  | 'loading'
  /** Nothing to name. */
  | 'none';

export interface DesignAnswer {
  kind: DesignAnswerKind;
  /** The architecture the card names; `null` for `loading` and `none`. */
  code: TargetArchitectureCode | null;
  /** A stored value that disagrees with the contract, shown as what it is. */
  storedDiffers: StoredRoute | null;
}

export const ARCHITECTURE_OF_ROUTE: Readonly<Record<TargetRoute, TargetArchitectureCode>> = Object.freeze({
  'in-app-rap': 'rap',
  'side-by-side-cap': 'cap',
});

/**
 * The stored recommendation of a project and where it came from:
 * `originalRecommendation` is written by the signed run, `extensibilityRoute`
 * alone is the route switch (or a project from before signed runs).
 */
export function storedRouteOf(
  project: { originalRecommendation?: unknown; extensibilityRoute?: unknown } | null | undefined,
  resolve: (source: { originalRecommendation?: unknown; extensibilityRoute?: unknown }) => TargetArchitectureCode | null,
): StoredRoute | null {
  if (!project) return null;
  const fromRun = resolve({ originalRecommendation: project.originalRecommendation });
  if (fromRun) return { code: fromRun, source: 'run' };
  const fromSetting = resolve({ extensibilityRoute: project.extensibilityRoute });
  return fromSetting ? { code: fromSetting, source: 'setting' } : null;
}

export function designAnswer(args: {
  evidence: 'loading' | 'absent' | 'ready';
  route: { recommended: TargetRoute; chosen: TargetRoute; deviation: boolean } | null;
  stored: StoredRoute | null;
}): DesignAnswer {
  const { evidence, route, stored } = args;
  if (route) {
    const recommended = ARCHITECTURE_OF_ROUTE[route.recommended];
    const chosen = ARCHITECTURE_OF_ROUTE[route.chosen];
    const differs = stored && stored.code !== recommended && stored.code !== chosen ? stored : null;
    return { kind: route.deviation ? 'chosen' : 'recommended', code: chosen, storedDiffers: differs };
  }
  if (evidence === 'loading') return { kind: 'loading', code: null, storedDiffers: null };
  if (stored) return { kind: 'stored', code: stored.code, storedDiffers: null };
  return { kind: 'none', code: null, storedDiffers: null };
}
