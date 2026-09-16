/**
 * What an action costs, said before the click — `DESIGN.md` §2.8 (ADR-019).
 *
 * The rule in one line: nothing spends quota without saying so first, and the
 * number comes from the account, never from a mockup. So this module takes the
 * profile the screen already has and the two facts only the screen knows — is
 * this the same source again, is this a shipped example — and returns the
 * sentence. It grants nothing: `/api/runs/create` still decides, and
 * `lib/run-quota-rule.ts` is still the rule this reads.
 *
 * Two statements, not one, and that is the point of the shape. Quota and model
 * call are different questions — a stage after the analysis calls the model and
 * costs nothing, the analysis itself costs a run and may not call the model at
 * all — and a single sentence that tries to carry both ends up saying neither
 * ("Free AI analysis"). So: `quota` and `modelCall`, always both.
 */

import {
  quotaExhausted,
  runsAreSelfFunded,
  runsRemaining,
  starterExampleIsFree,
  type QuotaSubject,
} from './run-quota-rule';

export interface RunCostInput {
  profile: QuotaSubject | null | undefined;
  /**
   * False for everything downstream of the analysis — the six later stages and
   * the chat are unmetered (`lib/constants.ts`, COMMUNITY_QUOTA).
   */
  metered: boolean;
  /** The same ABAP source this account already analysed: free by the same rule. */
  sameSourceAgain?: boolean;
  /** Object name of a shipped starter example, where this is one (roadmap 0.9). */
  starterExample?: string;
  /** Whether this action calls the language model at all. */
  callsModel: boolean;
}

export interface RunCost {
  /** The quota sentence — always present, always specific. */
  quota: string;
  /** The model sentence — a separate claim, §2.8. */
  modelCall: string;
  /** True when the action would be refused for want of quota. */
  blocked: boolean;
}

export function describeRunCost(input: RunCostInput): RunCost {
  const { profile, metered, sameSourceAgain, starterExample, callsModel } = input;

  const modelCall = callsModel ? 'Calls the model' : 'No model call';

  if (!metered) return { quota: 'Not counted', modelCall, blocked: false };

  if (runsAreSelfFunded(profile)) {
    return { quota: 'Uses your own Gemini key', modelCall, blocked: false };
  }

  if (sameSourceAgain) {
    return { quota: 'Free — this source was already analysed', modelCall, blocked: false };
  }

  if (starterExample && starterExampleIsFree(profile, starterExample)) {
    return { quota: 'Free — your first run of this example', modelCall, blocked: false };
  }

  const remaining = runsRemaining(profile);
  const limit =
    typeof profile?.transformationsLimit === 'number' ? profile.transformationsLimit : 5;

  if (quotaExhausted(profile)) {
    return {
      quota: `No free analysis runs left (0 of ${limit}) — add your own Gemini key to continue`,
      modelCall,
      blocked: true,
    };
  }

  return {
    quota: `Uses 1 of your ${limit} free analysis runs (${remaining - 1} left)`,
    modelCall,
    blocked: false,
  };
}
