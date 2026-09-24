import { buildAbapEvidence } from '@/lib/abap/evidence-model';
import { routeExtensibility } from '@/lib/abap/extensibility-router';
import {
  buildArchitectureContract,
  targetRouteOf,
  type ArchitectureContract,
  type ContractDeviation,
  type TargetRoute,
} from '@/lib/architecture-contract';
import type { InputManifest } from '@/lib/input-manifest';
import type { TargetArchitectureCode } from '@/lib/project-commands';

/**
 * The architecture contract of one project — roadmap 8.3, the half that has to
 * run where the catalog is.
 *
 * **Server-only, for the reason `lib/it-findings-build.ts` states.**
 * `buildAbapEvidence` reaches the merged SAP catalog, 4.3 MB of generated JSON,
 * and no browser is sent one to recompute an answer the server can give. It is
 * also the honest place: the contract needs `evidence.coverage`, and the run
 * document stores only `evidenceReport.findings` — a contract assembled from
 * the stored run would report complete coverage it never measured.
 *
 * **One engine, not a second opinion.** `buildAbapEvidence` and
 * `routeExtensibility` over the source on the project: the same deterministic
 * pass `POST /api/runs/create` makes before it signs.
 *
 * **It writes nothing and it signs nothing.** The contract is not part of the
 * run's signed payload (`lib/architecture-contract.ts`, file header); it is
 * derived on request and bound by its fingerprint.
 */

/** The first and, until 8.4 keeps a series, only contract of a project. */
export const FIRST_CONTRACT_ID = 'AC-1';

/** The two architecture codes that name a track this platform generates. */
const ROUTE_OF_ARCHITECTURE: Readonly<Partial<Record<TargetArchitectureCode, TargetRoute>>> =
  Object.freeze({ rap: 'in-app-rap', cap: 'side-by-side-cap' });

/** What the project document has to hold for a contract to be derived from it. */
export interface ContractProjectState {
  activeRunId?: unknown;
  legacyCode?: unknown;
  s4Deployment?: unknown;
  auditMetadata?: { inputFingerprint?: { fileName?: unknown } } | undefined;
  /** The architect's decision — server-only (`lib/project-commands.ts`). */
  targetArchitecture?: unknown;
  /** The reason the command route refuses to omit when the decision departs. */
  architectJustifiedOverride?: unknown;
  originalRecommendation?: unknown;
  extensibilityRoute?: unknown;
}

/**
 * The declared deviation of a project, or `null`, or a decision off both tracks.
 *
 * Read off the *decision*, never off `extensibilityRoute`: that field is on the
 * client-writable allowlist of `firestore.rules` and the Analyze stage flips it
 * from the browser with no reason at all. `targetArchitecture` and
 * `architectJustifiedOverride` are written only by
 * `POST /api/projects/{id}/commands`, which refuses a departure from the
 * recommendation with an empty reason (`override-needs-reason`) — so a
 * deviation that reaches here always carries one, which is exactly what
 * `buildArchitectureContract` throws without.
 *
 * The comparison is made against `targetRouteOf(route)` — the router's own
 * recommendation as the contract records it — rather than against
 * `recommendedArchitecture()`, which reads `originalRecommendation` off the
 * project document. One vocabulary, and the side the contract is built from.
 */
export function declaredDeviation(
  state: ContractProjectState,
  recommended: TargetRoute,
):
  | { kind: 'none'; deviation: null }
  | { kind: 'declared'; deviation: ContractDeviation }
  | { kind: 'off-track'; decided: TargetArchitectureCode } {
  const decided = state.targetArchitecture;
  if (typeof decided !== 'string' || !decided.trim()) return { kind: 'none', deviation: null };
  const asRoute = ROUTE_OF_ARCHITECTURE[decided as TargetArchitectureCode];
  if (!asRoute) {
    // `retire`, `integration`, `event`. Not a deviation of a two-valued route —
    // a decision to build neither of them. Named, not silently overruled.
    return { kind: 'off-track', decided: decided as TargetArchitectureCode };
  }
  if (asRoute === recommended) return { kind: 'none', deviation: null };
  const reason =
    typeof state.architectJustifiedOverride === 'string' ? state.architectJustifiedOverride.trim() : '';
  return {
    kind: 'declared',
    deviation: {
      chosen: asRoute,
      // Never empty: `buildArchitectureContract` throws on an unexplained
      // deviation, and a sign-off with no reason on the record is the state
      // 8.3 exists to end. The sentence says where the reason is missing from
      // rather than inventing one.
      reason:
        reason ||
        `Recorded without a reason on the project document (\`architectJustifiedOverride\` is empty), although the decision departs from the recommended ${recommended}. The departure is applied because it is the decision on the record; the missing reason is stated, not filled in.`,
    },
  };
}

export type ContractBuild =
  | { ok: true; contract: ArchitectureContract }
  | { ok: false; code: 'no-source' | 'off-track'; decided?: TargetArchitectureCode };

/**
 * Build the contract of a project from its source, its signed run manifest and
 * its decision.
 *
 * `inputManifest` comes from the run document, because the contract's target
 * context is read *out of* the manifest rather than passed in beside it — see
 * `buildArchitectureContract`. A project with no run passes `null` and the
 * contract comes back **blocked**, which is the answer, not a failure.
 */
export function contractOfProject(
  state: ContractProjectState,
  inputManifest: InputManifest | null,
  contractId: string = FIRST_CONTRACT_ID,
): ContractBuild {
  const source = typeof state.legacyCode === 'string' ? state.legacyCode : '';
  if (!source.trim()) return { ok: false, code: 'no-source' };

  const fingerprintName = state.auditMetadata?.inputFingerprint?.fileName;
  const fileName = typeof fingerprintName === 'string' && fingerprintName.trim() ? fingerprintName : 'main.abap';
  const deployment =
    state.s4Deployment === 'private' ? 'private' : state.s4Deployment === 'public' ? 'public' : undefined;

  const evidence = buildAbapEvidence(source, fileName, deployment);
  // The router needs a model to score with. `private` is the conservative one —
  // it is the deployment under which fewer constructs are driven off the stack,
  // so an unbound target cannot produce a *stronger* recommendation than a
  // bound one. It changes nothing downstream: with no `target:s4-deployment`
  // in the manifest the contract is blocked and nothing is generated anyway.
  const route = routeExtensibility(evidence, deployment || 'private');
  const recommended = targetRouteOf(route);

  const deviation = declaredDeviation(state, recommended);
  if (deviation.kind === 'off-track') return { ok: false, code: 'off-track', decided: deviation.decided };

  return {
    ok: true,
    contract: buildArchitectureContract({
      contractId,
      runId: typeof state.activeRunId === 'string' ? state.activeRunId : '',
      inputManifest,
      evidence,
      route,
      deviation: deviation.deviation,
    }),
  };
}
