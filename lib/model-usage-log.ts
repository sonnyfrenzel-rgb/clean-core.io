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
};

const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function modelUsageLog(input: {
  usage: unknown;
  model: string;
  stage?: string | null;
  responseShape?: string | null;
  leased: boolean;
  durationMs: number;
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
  };
}
