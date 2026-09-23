import { BUDGET, OPENROUTER_ENDPOINT, QA_MODEL } from './config.mjs';
import { firstViolation } from './validate.mjs';

/**
 * The only network call the reviewer makes. It sends a delta and gets JSON back;
 * it has no tools, so the model cannot act on the repository — the guardrail is
 * structural, not a sentence in a prompt.
 *
 * Every error message this module throws is fixed text plus numbers. Callers
 * print it to a public log, so nothing from a response body may ever reach it.
 */

/**
 * Only a rate limit is retried unconditionally. It is a definitive rejection
 * before any generation, so a retry cannot bill twice. A timeout, a reset
 * connection or a 5xx may arrive after the model already generated — retrying
 * those could pay for the same review twice, outside the per-review cost cap
 * (QA review of 221f2d11768c, finding 3b4fedd019e8).
 *
 * That reasoning holds for a 5xx that arrives late and not for one that arrives
 * at once, and the difference is the clock rather than the status. The UX review
 * of v2.14.0 (run 35780745267, 22.09.2026) died on `HTTP 503` **4.5 seconds**
 * after the job started its call: no model generates a review in four seconds,
 * so nothing had been produced and nothing could be billed twice. One unlucky
 * second at the provider cost the whole release's UX review, and the next
 * release would have lost it again.
 *
 * So a gateway status is retried only when it comes back before any generation
 * plausibly began. The window is deliberately far below the minutes a real
 * review call takes and far above a gateway's own round trip. 500 is not in the
 * list: it is the status a provider also returns for a request it will never
 * accept, and retrying that is a slower way to fail.
 */
const RETRYABLE = new Set([429]);
const RETRYABLE_IF_EARLY = new Set([502, 503, 504]);
const EARLY_FAILURE_MS = 20_000;
const FINISH_REASONS = new Set(['stop', 'length', 'content_filter', 'tool_calls', 'function_call', 'error']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param user   the user message: a string, or an array of content parts (text and
 *               image_url) for a reviewer that also looks at screenshots
 * @param model  pinned per agent; defaults to the QA reviewer
 */
export function buildRequest({ system, user, schema, effort, model = QA_MODEL, maxTokens = BUDGET.maxOutputTokens, name = 'qa_review' }) {
  return {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
    reasoning: { effort },
    max_tokens: maxTokens,
    temperature: 0,
    usage: { include: true },
    // No fallback models: a review from a different model than the one pinned is
    // not the review that was asked for. No provider that stores or trains on
    // prompts: the delta is public code, but the reasoning about its weaknesses is not.
    provider: { allow_fallbacks: false, data_collection: 'deny' },
  };
}

/**
 * What a rejection usually means, as fixed text. The response body is never
 * read for this: the status alone selects the hint. 403 is how OpenRouter
 * answers a model gated behind an account setting (Muse Spark 1.3 requires an
 * 18+ confirmation, 15.09.2026) — without the hint that reads like a bad key.
 */
const STATUS_HINTS = {
  401: 'key rejected',
  402: 'credit limit of the key reached',
  403: 'key or account not permitted for this model — check the model requirements in the OpenRouter settings',
  404: 'model or endpoint not found — or no provider matches the data policy',
  413: 'request too large',
};

/**
 * @param earlyFailureMs how soon after the request a gateway status still counts as "before generation" and may be retried
 * @param retries  rate-limit retries; a pipeline of many calls to one provider (the security audit) needs more
 * @param retryDelayMs (attempt) => ms — the pause before retry `attempt` when the provider names no sane wait. The default
 *                 grows by 5 s per attempt; the security audit waits longer, because its report is lost when the last
 *                 call of a long run meets a rate limit.
 * @param coerce   (answer) => answer, applied before validation — for a pipeline whose report must not be lost to a
 *                 severity written in English or a number sent as text. The result is still validated; coercion
 *                 fixes types and empties an absent field, it never writes a statement.
 */
export async function callReviewer({ apiKey, system, user, schema, effort, model, maxTokens, name, title = 'Clean-Core.io QA Review', fetchImpl = fetch, timeoutMs = BUDGET.requestTimeoutMs, retries = BUDGET.retries, retryDelayMs = (attempt) => 5_000 * (attempt + 1), earlyFailureMs = EARLY_FAILURE_MS, coerce = null }) {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set — the review cannot run.');
  const body = JSON.stringify(buildRequest({ system, user, schema, effort, model, maxTokens, name }));

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    let res;
    try {
      res = await fetchImpl(OPENROUTER_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://clean-core.io',
          'X-Title': title,
        },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      throw new Error(err?.name === 'AbortError' ? `OpenRouter did not answer within ${Math.round(timeoutMs / 60_000)} min.` : 'OpenRouter could not be reached.');
    }

    try {
      if (!res.ok) {
        // The body of an error response can echo the request; only the status leaves this function.
        const early = Date.now() - startedAt < earlyFailureMs;
        if ((RETRYABLE.has(res.status) || (RETRYABLE_IF_EARLY.has(res.status) && early)) && attempt < retries) {
          // The provider's own wait, when it names one in seconds and it is sane; otherwise a growing pause.
          const after = Number(res.headers?.get?.('retry-after'));
          await sleep(Number.isFinite(after) && after > 0 && after <= 120 ? after * 1_000 : retryDelayMs(attempt));
          continue;
        }
        throw new Error(`OpenRouter answered HTTP ${res.status}${STATUS_HINTS[res.status] ? ` (${STATUS_HINTS[res.status]})` : ''}`);
      }

      let json;
      try {
        json = await res.json();
      } catch {
        // A SyntaxError from the parser quotes part of the input — never let it through.
        throw new Error('OpenRouter returned a response that is not JSON.');
      }

      const choice = json?.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        // Counts and the finish reason only — enough to tell a reasoning budget
        // that ran out ("length") from a refusal, without any content.
        const u = json?.usage || {};
        const reasoning = u.completion_tokens_details?.reasoning_tokens;
        // Only known finish reasons are echoed; anything else, however harmless it looks, is not.
        const finish = FINISH_REASONS.has(choice?.finish_reason) ? choice.finish_reason : 'unrecognised';
        throw new Error(
          `OpenRouter returned no review content (finish_reason=${finish}, completion_tokens=${Number(u.completion_tokens) || '?'}, reasoning_tokens=${Number(reasoning) || '?'}, max_tokens=${maxTokens ?? BUDGET.maxOutputTokens}).`,
        );
      }

      let review;
      try {
        // A model that wraps its JSON in a code fence despite the schema is still answering in JSON.
        review = JSON.parse(content.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, ''));
      } catch {
        // The same counts as for empty content, for the same reason: the second
        // attempt of the release audit of 33471220d6e9 (2026-09-16) ended here,
        // and the one line it left could not say whether the CISO had written
        // prose or had run out of output tokens halfway through its JSON. The
        // content itself stays out of the message; the finish reason and the
        // numbers are enough to tell "cut off" from "answered wrong".
        const u = json?.usage || {};
        const reasoning = u.completion_tokens_details?.reasoning_tokens;
        const finish = FINISH_REASONS.has(choice?.finish_reason) ? choice.finish_reason : 'unrecognised';
        const why = finish === 'length' ? 'cut off at max_tokens' : 'despite the schema';
        throw new Error(
          `The review was not valid JSON ${why} (finish_reason=${finish}, completion_tokens=${Number(u.completion_tokens) || '?'}, reasoning_tokens=${Number(reasoning) || '?'}, max_tokens=${maxTokens ?? BUDGET.maxOutputTokens}).`,
        );
      }
      if (coerce) review = coerce(review);
      const violation = firstViolation(schema, review);
      if (violation) throw new Error(`The review did not match the schema at ${violation}.`);
      return { review, usage: json.usage || null, model: json.model || model || QA_MODEL };
    } finally {
      clearTimeout(timer);
    }
  }
}
