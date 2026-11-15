/**
 * The fields of the route's per-call usage log line (`gemini usage`).
 *
 * On 13.10.2026 an engine-led Transformation made fill calls of 9–292 s with
 * prompts of about 4,000 tokens, and nothing in the logs could say where the
 * time went — input, output or thinking. The provider reports it in
 * `usageMetadata`; this keeps the counts and nothing else.
 *
 * Only numbers, names the route already validated and a yes/no: the prompt and
 * the answer never reach a log (their text is the customer's source). Every
 * count is copied only when it is a finite number, so whatever else the
 * provider puts into `usageMetadata` is not carried along.
 *
 * Pure: no SDK, no Next.
 */

export type ModelUsageFields = {
  route: 'api/gemini';
  model: string;
  stage: string | null;
  responseShape: string | null;
  leased: boolean;
  durationMs: number;
  promptTokenCount: number | null;
  candidatesTokenCount: number | null;
  thoughtsTokenCount: number | null;
  totalTokenCount: number | null;
  /** The provider call threw: no answer, and no counts unless it sent some. */
  failed: boolean;
  /**
   * How the provider ended the answer (`STOP`, `MAX_TOKENS`, …), or null when it
   * said nothing or the call threw. Added 13.11.2026: an answer cut off at the
   * output bound is a completed call that the route then refuses
   * (`lib/model-completion.ts`), and a log line with `failed: false` and 32,768
   * tokens said nothing about it.
   */
  finishReason: string | null;
};

const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function modelUsageLog(input: {
  usage: unknown;
  model: string;
  stage?: string | null;
  responseShape?: string | null;
  leased: boolean;
  durationMs: number;
  failed?: boolean;
  finishReason?: string | null;
}): ModelUsageFields {
  const u = (typeof input.usage === 'object' && input.usage !== null ? input.usage : {}) as Record<string, unknown>;
  return {
    route: 'api/gemini',
    model: input.model,
    stage: input.stage ?? null,
    responseShape: input.responseShape ?? null,
    leased: input.leased,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    promptTokenCount: count(u.promptTokenCount),
    candidatesTokenCount: count(u.candidatesTokenCount),
    thoughtsTokenCount: count(u.thoughtsTokenCount),
    totalTokenCount: count(u.totalTokenCount),
    failed: input.failed === true,
    finishReason: typeof input.finishReason === 'string' && input.finishReason ? input.finishReason : null,
  };
}
