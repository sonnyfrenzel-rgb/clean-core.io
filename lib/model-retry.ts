/**
 * Which model errors are worth asking again.
 *
 * 429 / RESOURCE_EXHAUSTED is a quota the provider lifts after a pause. 503 /
 * UNAVAILABLE is Gemini saying "this model is currently experiencing high
 * demand … usually temporary" — on 24.09.2026 it answered that for over an hour,
 * and every analysis and design generation in that window failed on the first
 * refusal. Both clear on their own; anything else (a bad request, a blocked
 * prompt, a wrong key) will not, and repeating it only spends the wait.
 */
export function isTransientModelError(message: string): boolean {
  return (
    message.includes('429') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('503') ||
    message.includes('UNAVAILABLE')
  );
}
