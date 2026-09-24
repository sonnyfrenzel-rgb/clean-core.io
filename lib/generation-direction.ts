/**
 * Where the generation takes its direction from — roadmap 8.3
 * (`docs/ROADMAP.md` §Phase 8): *"Generierung folgt dem Vertrag; eine Abweichung
 * von der Empfehlung wird festgehalten und angewendet."*
 *
 * ## What it replaced, and why it is a module
 *
 * The Transformation stage decided its own target:
 *
 * ```
 * const route = projData?.extensibilityRoute || 'Side-by-Side (SAP BTP)';
 * const isAbapCloud = isAbapCloudTrack(route);
 * ```
 *
 * (`app/(app)/project/[projectId]/transformation/page.tsx`, before this step.)
 *
 * `extensibilityRoute` is on the client-writable allowlist of
 * `firestore.rules` — `affectedKeys().hasOnly([… 'extensibilityRoute' …])` — and
 * the Analyze stage flips it straight from the browser with `updateDoc(docRef,
 * { extensibilityRoute: nextRoute })`, no reason asked, no sign-off touched. So
 * the generation followed *the last person who pressed the toggle*, while the
 * architect's actual decision — `targetArchitecture` together with
 * `architectJustifiedOverride`, both server-only (`lib/project-commands.ts`),
 * the second of which the command route **refuses to omit** when the target
 * departs from the recommendation — was not read by the generator at all. The
 * reason-bearing decision lost to the reasonless one. That is the class of
 * CR-11 (8.8) and 0.12: state that decides something, writable by whoever holds
 * the document.
 *
 * So: one function, on the contract, and the stage asks it. A module rather
 * than three lines in the page because the answer has to be the same one the
 * binding records — a page that decides its track in one place and reports it
 * in another can report a target it did not generate for, which is precisely
 * the claim 8.3 exists to make checkable.
 *
 * ## `chosen`, not `recommended`
 *
 * `lib/architecture-contract.ts` already carries both, and a deviation without
 * a reason throws there. Applying it is this module's half: `route.chosen` is
 * what the generator gets. A contract that says "Side-by-Side" while the
 * generator writes RAP is worse than no contract — it asserts a binding that
 * does not exist.
 *
 * ## `qualified` generates, `blocked` does not
 *
 * Every contract this build produces is `qualified`, because no catalog for a
 * specific edition ships (`catalog-not-edition-specific`). If qualified stopped
 * the generation, nothing would ever generate. `blocked` is the state that
 * stops it — an unbound target, an unbound manifest, unreset core modifications
 * — and then the reader is told which, in the contract's own sentence, rather
 * than shown an empty stage.
 *
 * ## The generated code is not evidence
 *
 * It comes from a model. The binding below carries `provenance: 'proposed'` and
 * never `'proven'`: what is bound is the contract and the inputs, not the
 * output. `contractManifestInput()` is the seam, `source-artefact`, so a
 * contract that moved makes the generated code a statement about a different
 * target — which `invalidatingInputs()` keeps rather than drops.
 *
 * Pure data: no React, no Firestore, no `node:crypto`, no catalog. The page and
 * the route must not be able to answer differently.
 */

import {
  contractCoverage,
  contractManifestInput,
  type ArchitectureContract,
  type ContractDeviation,
  type ContractState,
  type TargetRoute,
} from './architecture-contract';
import type { ManifestInput } from './input-manifest';
import type { ProvenanceValue } from './provenance';

/** The two tracks the Transformation stage can generate, in the words it uses. */
export const TRACK_LABELS: Readonly<Record<TargetRoute, string>> = Object.freeze({
  'in-app-rap': 'In-App ABAP Cloud (RAP)',
  'side-by-side-cap': 'Side-by-Side SAP BTP (CAP)',
});

/** What a generated stand says about the contract it was computed against. */
export interface GenerationBinding {
  contractId: string;
  /** The contract's fingerprint — the one value a later reader compares. */
  contractFingerprint: string;
  /** The run the contract stands on. */
  boundRunId: string;
  /** That run's signed input-manifest hash. */
  boundInputManifestHash: string;
  route: { recommended: TargetRoute; chosen: TargetRoute };
  /** Recorded, and applied: `route.chosen` is the track that was generated. */
  deviation: ContractDeviation | null;
  /** `clear` or `qualified`. A blocked contract never reaches a binding. */
  contractState: Exclude<ContractState, 'blocked'>;
  /** The contract as an entry of this artefact's input manifest. */
  contractInput: ManifestInput;
  /** Model output. Never `proven` — see the file header. */
  provenance: ProvenanceValue;
  /** The digest of the generated package, where the caller has one. */
  codeSha256: string | null;
  generatedAt: string;
}

export interface GenerationDirection {
  ok: true;
  /** What the generator builds. `contract.route.chosen`, never `recommended`. */
  track: TargetRoute;
  /** The predicate the prompt, the file paths and the on-screen words share. */
  isAbapCloud: boolean;
  label: string;
  /** False exactly when a deviation was declared. */
  followsRecommendation: boolean;
  deviation: ContractDeviation | null;
  state: Exclude<ContractState, 'blocked'>;
  /**
   * One sentence for the log and the screen. It names the deviation when there
   * is one: a deviation nobody is shown is applied but not held.
   */
  sentence: string;
}

export interface GenerationRefusal {
  ok: false;
  code: 'no-contract' | 'contract-blocked' | 'decision-off-track';
  /** What the reader is told instead of being shown an empty stage. */
  sentence: string;
  /** What ends it. Never an empty list. */
  remedy: string;
}

export type GenerationDecision = GenerationDirection | GenerationRefusal;

/**
 * Whether anything may be generated, and for which track.
 *
 * The three answers, in the order they are asked:
 *
 *   1. **No contract** — refused. Not defaulted to the recommendation and not
 *      to `'Side-by-Side (SAP BTP)'`, which is what the stage used to fall back
 *      to: the most permissive answer is the wrong one to guess.
 *   2. **Blocked** — refused, with the contract's own coverage sentence.
 *   3. **Otherwise** — `route.chosen`, deviation applied.
 */
export function generationDirection(
  contract: ArchitectureContract | null | undefined,
): GenerationDecision {
  if (!contract) {
    return {
      ok: false,
      code: 'no-contract',
      sentence:
        'This project has no architecture contract, so there is no target to generate against. Nothing was generated — a track is not guessed from the most permissive option.',
      remedy: 'Run the analysis, so a contract is derived from the signed run, and open this stage again.',
    };
  }
  const coverage = contractCoverage(contract);
  if (coverage.state === 'blocked') {
    return {
      ok: false,
      code: 'contract-blocked',
      sentence: coverage.sentence,
      remedy:
        'The contract has to be bindable before anything is generated against it. Clear what it names above — the target deployment, the bound inputs, or the core modifications — and generate again.',
    };
  }
  const { recommended, chosen, deviation } = contract.route;
  const state = coverage.state as Exclude<ContractState, 'blocked'>;
  const sentence = deviation
    ? `Generating ${TRACK_LABELS[chosen]} against contract ${contract.contractId} — a declared deviation from the recommended ${TRACK_LABELS[recommended]}: ${deviation.reason}`
    : `Generating ${TRACK_LABELS[chosen]} against contract ${contract.contractId}, the recommended route.`;
  return {
    ok: true,
    track: chosen,
    isAbapCloud: chosen === 'in-app-rap',
    label: TRACK_LABELS[chosen],
    followsRecommendation: !deviation,
    deviation,
    state,
    sentence,
  };
}

/**
 * The refusal for a decision that is neither of the two tracks this stage can
 * write — `retire`, `integration`, `event` (`TARGET_ARCHITECTURES` in
 * `lib/project-commands.ts`).
 *
 * The contract's route is two-valued by construction, so such a decision cannot
 * be expressed as a deviation of it. Generating RAP or CAP code anyway would
 * make the stage contradict a sign-off that is on the record with a reason —
 * the same defect as following the toggle, one decision later. It is refused
 * and named instead.
 */
export function offTrackRefusal(decided: string): GenerationRefusal {
  return {
    ok: false,
    code: 'decision-off-track',
    sentence: `This project is signed off for \`${decided}\`, which is neither of the two targets this stage generates (ABAP Cloud/RAP, BTP/CAP). Nothing was generated.`,
    remedy:
      'Either the decision names one of the two tracks, or this stage produces nothing for it — the later stages read the decision, not a package generated past it.',
  };
}

/**
 * What a generated stand records about the contract it was computed against.
 *
 * Throws on a blocked contract, through `contractManifestInput()`, for the
 * reason that function throws: a refusal that can still be signed is not a
 * refusal.
 */
export function generationBinding(
  contract: ArchitectureContract,
  args?: { codeSha256?: string | null; generatedAt?: string },
): GenerationBinding {
  const contractInput = contractManifestInput(contract);
  const state = contractCoverage(contract).state as Exclude<ContractState, 'blocked'>;
  return {
    contractId: contract.contractId,
    contractFingerprint: contract.fingerprint,
    boundRunId: contract.boundRunId,
    boundInputManifestHash: contract.boundInputManifestHash,
    route: { recommended: contract.route.recommended, chosen: contract.route.chosen },
    deviation: contract.route.deviation,
    contractState: state,
    contractInput,
    // The code came from a model. `lib/provenance.ts`: proposed, not proven.
    provenance: 'proposed',
    codeSha256: args?.codeSha256 ?? null,
    generatedAt: args?.generatedAt || new Date().toISOString(),
  };
}

/**
 * Does a stored binding still describe the contract in front of us?
 *
 * The fingerprint is the whole comparison — `status` sits outside it on
 * purpose, so confirming a contract does not make every stand generated against
 * it read as stale.
 */
export function bindingMatchesContract(
  binding: Pick<GenerationBinding, 'contractFingerprint'> | null | undefined,
  contract: ArchitectureContract | null | undefined,
): boolean {
  if (!binding || !contract) return false;
  return binding.contractFingerprint === contract.fingerprint;
}

/**
 * The generated track a stored binding names, or `null` where none was recorded.
 *
 * A stand with no binding is a stand from before 8.3: it is not reported as
 * following the contract, because nothing says which contract it followed.
 */
export function boundTrack(binding: GenerationBinding | null | undefined): TargetRoute | null {
  return binding?.route?.chosen ?? null;
}
