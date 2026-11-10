import type { ModelAnswer } from './model-completion';

/**
 * The Anthropic path of the model proxy — an account's own Claude key
 * (roadmap 3.0.15, part B).
 *
 * Plain `fetch` against the Messages API and the Models API, not
 * `@anthropic-ai/sdk`: the SDK is not a dependency of this app, and adding one
 * means a lock-file change made with the CI toolchain (CLAUDE.md, "Never
 * regenerate package-lock.json on local Node 20"). Part A (the platform's own
 * calls on Claude) is the step that brings the SDK in.
 *
 * Server-only: the key is a parameter, never read from the environment, never
 * logged, and never part of an error — an error carries the HTTP status and
 * nothing the provider said, because a provider's error body can quote the
 * key or the prompt back (3.0.13 e).
 *
 * What is sent, and what deliberately is not:
 *
 *   - `model`, `max_tokens`, one user message with the prompt — always.
 *   - `inference_geo: "us"` — always (3.0.21): the data region the legal
 *     texts name; the answer's `usage.inference_geo` is read back.
 *   - `output_config.format` (JSON schema) where the stage has a fixed answer
 *     shape (`lib/model-response-schema.ts`), the equivalent of Gemini's
 *     `responseJsonSchema`; the schema is adapted to what structured outputs
 *     accept (`claudeJsonSchema`).
 *   - `output_config.effort` where the Gemini call would have set a thinking
 *     level (`lib/model-thinking.ts`): LOW → `low`, MEDIUM → `medium`, HIGH →
 *     `high`. Otherwise the model's default.
 *   - A one-line system instruction to answer with JSON only, where the call
 *     asks for JSON and has no schema (Claude has no JSON mode).
 *   - No `thinking` parameter (the model's default, adaptive, is what we want,
 *     and some values are refused by current models), no `temperature`, no
 *     `top_p`: a current Claude model refuses sampling parameters it does not
 *     accept, and the Gemini calls do not set them either.
 */

export const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
export const ANTHROPIC_VERSION = '2023-06-01';
export const ANTHROPIC_MESSAGES_URL = `${ANTHROPIC_API_BASE}/v1/messages`;
/** The key test: lists models, spends no tokens. */
export const ANTHROPIC_MODELS_URL = `${ANTHROPIC_API_BASE}/v1/models?limit=1`;

/**
 * The output ceiling of one call. The Transformation answer is a whole package
 * in JSON; thinking counts against it too. The route's deadline
 * (`lib/model-deadline.ts`) bounds the wait, not this number.
 */
export const CLAUDE_MAX_TOKENS = 32_000;

export type ClaudeEffort = 'low' | 'medium' | 'high';

const JSON_ONLY_SYSTEM = 'Answer with one JSON value only: no prose before or after it, and no Markdown code fences.';

/** Keywords structured outputs do not accept; dropped, and checked by the stage's own validation instead. */
const UNSUPPORTED_SCHEMA_KEYS = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems']);

/**
 * A stage's JSON schema, adapted for Claude's structured outputs: every object
 * gets `additionalProperties: false` (required there), and constraints it does
 * not accept are dropped. Pure; the input is not changed.
 */
export function claudeJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(claudeJsonSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (UNSUPPORTED_SCHEMA_KEYS.has(k)) continue;
    if (k === 'properties' && v && typeof v === 'object') {
      out[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([p, s]) => [p, claudeJsonSchema(s)]));
    } else if (k === 'items' || k === 'anyOf' || k === 'allOf' || k === 'oneOf') {
      out[k] = claudeJsonSchema(v);
    } else {
      out[k] = v;
    }
  }
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

export interface ClaudeRequest {
  model: string;
  prompt: string;
  jsonResponse: boolean;
  /** The stage's answer shape, when it has one. */
  schema?: object;
  effort?: ClaudeEffort;
}

/**
 * The data region every call sets (3.0.21, legal review B7): `inference_geo`
 * as a top-level request parameter. A literal here rather than an import, so
 * this module stays free of imports beyond types; `tests/byok-claude.spec.ts`
 * holds it equal to `ANTHROPIC_INFERENCE_GEO` in `lib/model-providers.ts`.
 */
export const CLAUDE_INFERENCE_GEO = 'us';

/** The Messages API request body. Pure, so a spec reads exactly what would be sent. */
export function claudeRequestBody(req: ClaudeRequest): Record<string, unknown> {
  const outputConfig: Record<string, unknown> = {
    ...(req.effort ? { effort: req.effort } : {}),
    ...(req.jsonResponse && req.schema ? { format: { type: 'json_schema', schema: claudeJsonSchema(req.schema) } } : {}),
  };
  return {
    model: req.model,
    max_tokens: CLAUDE_MAX_TOKENS,
    inference_geo: CLAUDE_INFERENCE_GEO,
    ...(req.jsonResponse && !req.schema ? { system: JSON_ONLY_SYSTEM } : {}),
    messages: [{ role: 'user', content: req.prompt }],
    ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
  };
}

/** Gemini's thinking level, as `lib/model-thinking.ts` sets it, in Claude's effort words. */
export function claudeEffortFor(thinking: { thinkingLevel?: unknown } | undefined): ClaudeEffort | undefined {
  const level = String(thinking?.thinkingLevel ?? '').toUpperCase();
  if (level === 'LOW') return 'low';
  if (level === 'MEDIUM') return 'medium';
  if (level === 'HIGH') return 'high';
  return undefined;
}

/** The counts `lib/model-usage-log.ts` logs, from a Messages API `usage`. */
export interface ClaudeUsage {
  promptTokenCount: number | null;
  candidatesTokenCount: number | null;
  thoughtsTokenCount: null;
  totalTokenCount: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * A Messages API answer, read the way `lib/model-completion.ts` reads a Gemini
 * one: the stop reason mapped onto Gemini's finish reasons, so the same rule
 * decides whether it is a result. `end_turn` is a natural end (`STOP`);
 * `max_tokens` is cut off (`MAX_TOKENS`); `refusal` is the provider's filter
 * (`SAFETY`); anything else is not a finished answer.
 */
export function claudeAnswerOf(json: unknown): { answer: ModelAnswer; usage: ClaudeUsage; inferenceGeo: string | null } {
  const m = (json ?? {}) as { content?: unknown; stop_reason?: unknown; usage?: Record<string, unknown> };
  const blocks = Array.isArray(m.content) ? m.content : [];
  const text = blocks
    .filter((b): b is { type: 'text'; text: string } => !!b && (b as { type?: unknown }).type === 'text' && typeof (b as { text?: unknown }).text === 'string')
    .map((b) => b.text)
    .join('');
  const stop = typeof m.stop_reason === 'string' ? m.stop_reason : null;
  const finishReason =
    stop === 'end_turn' ? 'STOP' : stop === 'max_tokens' ? 'MAX_TOKENS' : stop === 'refusal' ? 'SAFETY' : stop ? `CLAUDE_${stop.toUpperCase()}` : null;
  const input = num(m.usage?.input_tokens);
  const output = num(m.usage?.output_tokens);
  return {
    answer: { text, finishReason },
    usage: {
      promptTokenCount: input,
      candidatesTokenCount: output,
      thoughtsTokenCount: null,
      totalTokenCount: input !== null && output !== null ? input + output : null,
    },
    // Where the provider says inference ran — a short region word, never free text.
    inferenceGeo: typeof m.usage?.inference_geo === 'string' && /^[a-z_-]{1,16}$/.test(m.usage.inference_geo) ? m.usage.inference_geo : null,
  };
}

/**
 * A refusal from Anthropic's API, by status only. The message names `429` /
 * `UNAVAILABLE` where the provider asks to come back later, so
 * `isTransientModelError` (`lib/model-retry.ts`) retries it as it retries
 * Gemini's.
 */
export class AnthropicHttpError extends Error {
  constructor(readonly status: number) {
    const transient = status === 429 ? ' RESOURCE_EXHAUSTED' : status === 529 || status >= 500 ? ' UNAVAILABLE' : '';
    super(`Anthropic API answered HTTP ${status}${transient}`);
    this.name = 'AnthropicHttpError';
  }
}

type Fetch = typeof fetch;

function headersFor(apiKey: string): Record<string, string> {
  return { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION };
}

/** One Messages API call. Throws `AnthropicHttpError` on a non-2xx answer; the body of that answer is not read. */
export async function callClaudeMessages(
  req: ClaudeRequest & { apiKey: string; signal?: AbortSignal },
  fetchImpl: Fetch = fetch,
): Promise<{ answer: ModelAnswer; usage: ClaudeUsage; inferenceGeo: string | null }> {
  const res = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: { ...headersFor(req.apiKey), 'content-type': 'application/json' },
    body: JSON.stringify(claudeRequestBody(req)),
    ...(req.signal ? { signal: req.signal } : {}),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new AnthropicHttpError(res.status);
  }
  return claudeAnswerOf(await res.json());
}

/**
 * The key test for an Anthropic key: `GET /v1/models`. It proves the key is
 * accepted without spending a token. Throws `AnthropicHttpError` when refused.
 */
export async function testAnthropicKey(apiKey: string, fetchImpl: Fetch = fetch, signal?: AbortSignal): Promise<void> {
  const res = await fetchImpl(ANTHROPIC_MODELS_URL, { method: 'GET', headers: headersFor(apiKey), ...(signal ? { signal } : {}) });
  await res.body?.cancel().catch(() => undefined);
  if (!res.ok) throw new AnthropicHttpError(res.status);
}

/**
 * Whether a provider error says the account's own key was refused — so the
 * step can say "your key", not "try again". Read from the status (and, for
 * Gemini, its fixed reason code), never logged.
 */
export function ownKeyRefused(err: unknown): boolean {
  const e = (err ?? {}) as { status?: unknown; message?: unknown };
  if (e.status === 401 || e.status === 403) return true;
  const message = typeof e.message === 'string' ? e.message : '';
  // Gemini answers an invalid key with 400 and the reason API_KEY_INVALID.
  return e.status === 400 && /API_KEY_INVALID|API key not valid/.test(message);
}
