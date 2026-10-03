import { absenceFromError, modelAbsenceReason, type ModelAbsence } from './model-stages';

/**
 * The half of `lib/start-narrative.ts` that imports nothing but the stage
 * rules: why a start that asked the model signed without the narrative, and
 * the sentence that says so. Kept apart so it can be read without the browser
 * modules the narrative call needs.
 */

/**
 * Why a start that asked the model signed without the narrative.
 *
 * The three absences `lib/model-stages.ts` names for a refused or failed call,
 * and two that belong to the start alone: the ceiling ran out, or the reader
 * chose to go on without waiting.
 */
export type StartNarrativeMissing = Exclude<ModelAbsence, null | 'declined'> | 'timeout' | 'continued';

/** Which absence an ended wait describes — the reason the abort carried first, the proxy's code otherwise. */
export function missingFrom(err: unknown, ended: 'timeout' | 'continued' | null): StartNarrativeMissing {
  if (ended) return ended;
  return absenceFromError(err) as StartNarrativeMissing;
}

/** The sentence a start says when it signed without the narrative. Never a guess dressed as a reason. */
export function startNarrativeMissingReason(missing: StartNarrativeMissing, ceilingMs: number): string {
  switch (missing) {
    case 'timeout':
      return `The model did not answer within ${Math.round(ceilingMs / 1000)} seconds, so the run was signed without the narrative.`;
    case 'continued':
      return 'You went on without waiting, so the run was signed without the narrative.';
    default:
      return `${modelAbsenceReason(missing, 'analyze')} The run was signed without the narrative.`;
  }
}
