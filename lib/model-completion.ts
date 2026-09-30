/**
 * Whether a model answer is complete — and why an incomplete one is not a result.
 *
 * Roadmap 3.0.13 (a). `/api/gemini` used to check one thing about an answer:
 * that `result.text` was not empty. The SDK's `text` getter
 * (`@google/genai`, `GenerateContentResponse.text`) concatenates whatever text
 * parts the first candidate carries and does not look at why generation
 * stopped. An answer cut off at the output limit (`MAX_TOKENS`), or stopped
 * half-way by the provider's content filter (`SAFETY`, `RECITATION`, …), came
 * back as ordinary text — and the proxy then minted a model receipt over it,
 * which is the server vouching, inside a MAC, that the model wrote this text.
 * A transformation missing its last forty lines is not what the model wrote.
 *
 * So the rule is positive, not a list of bad reasons: an answer is complete
 * only when the provider says generation reached its natural end (`STOP`) and
 * there is text. Everything else — a named abort, an unknown reason, no reason
 * at all — is refused, and nothing is receipted. Refusing an unknown reason is
 * deliberate: a value Google adds later must not be read as "finished" because
 * nobody listed it.
 *
 * Pure: no imports, reads only what it is handed, so the rule is tested without
 * a provider (`tests/byok-hardening.spec.ts`).
 */

/** The code the answer carries, so a screen can branch on it rather than on a sentence. */
export const MODEL_INCOMPLETE_CODE = 'model-incomplete';

/** The finish reasons that mean the provider's filter stopped the answer. */
const FILTERED = new Set([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'LANGUAGE',
  'IMAGE_SAFETY',
  'IMAGE_PROHIBITED_CONTENT',
]);

export interface ModelAnswer {
  /** What the SDK's `text` getter returned. */
  text: string | null | undefined;
  /** `candidates[0].finishReason`. */
  finishReason: string | null | undefined;
  /** `promptFeedback.blockReason` — set when the prompt itself was refused. */
  blockReason?: string | null | undefined;
}

export type IncompleteReason = 'truncated' | 'filtered' | 'empty' | 'unfinished';

export type ModelCompletion =
  | { ok: true; text: string }
  | { ok: false; reason: IncompleteReason; finishReason: string | null };

export function modelCompletion(answer: ModelAnswer): ModelCompletion {
  const finishReason = typeof answer.finishReason === 'string' && answer.finishReason ? answer.finishReason : null;
  if (typeof answer.blockReason === 'string' && answer.blockReason) {
    return { ok: false, reason: 'filtered', finishReason };
  }
  if (finishReason === 'MAX_TOKENS') return { ok: false, reason: 'truncated', finishReason };
  if (finishReason !== null && FILTERED.has(finishReason)) return { ok: false, reason: 'filtered', finishReason };
  if (finishReason !== 'STOP') return { ok: false, reason: 'unfinished', finishReason };
  if (typeof answer.text !== 'string' || answer.text.length === 0) return { ok: false, reason: 'empty', finishReason };
  return { ok: true, text: answer.text };
}

/**
 * The sentence the caller reads. It says what happened and that nothing was
 * kept — not the provider's own words, which can carry the prompt back.
 */
export function incompleteAnswerMessage(reason: IncompleteReason): string {
  const tail = `(${MODEL_INCOMPLETE_CODE}). Nothing from this answer was used or recorded.`;
  switch (reason) {
    case 'truncated':
      return `The model stopped before finishing its answer because it reached its output limit ${tail} Try again, or with a smaller piece of code.`;
    case 'filtered':
      return `The model provider's content filter stopped this answer before it was complete ${tail}`;
    case 'empty':
      return `The model returned an empty answer ${tail} Please try again.`;
    default:
      return `The model did not report a complete answer ${tail} Please try again.`;
  }
}
