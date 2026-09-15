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
 * Only a rate limit is retried. It is a definitive rejection before any
 * generation, so a retry cannot bill twice. A timeout, a reset connection or a
 * 5xx may arrive after the model already generated — retrying those could pay
 * for the same review twice, outside the per-review cost cap (QA review of
 * 221f2d11768c, finding 3b4fedd019e8).
 */
const RETRYABLE = new Set([429]);
const FINISH_REASONS = new Set(['stop', 'length', 'content_filter', 'tool_calls', 'function_call', 'error']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function buildRequest({ system, user, schema, effort }) {
  return {
    model: QA_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'qa_review', strict: true, schema } },
    reasoning: { effort },
    max_tokens: BUDGET.maxOutputTokens,
    temperature: 0,
    usage: { include: true },
    // No fallback models: a review from a different model than the one pinned is
    // not the review that was asked for. No provider that stores or trains on
    // prompts: the delta is public code, but the reasoning about its weaknesses is not.
    provider: { allow_fallbacks: false, data_collection: 'deny' },
  };
}

export async function callReviewer({ apiKey, system, user, schema, effort, fetchImpl = fetch, timeoutMs = BUDGET.requestTimeoutMs }) {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set — the QA review cannot run.');
  const body = JSON.stringify(buildRequest({ system, user, schema, effort }));

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(OPENROUTER_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://clean-core.io',
          'X-Title': 'Clean-Core.io QA Review',
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
        if (RETRYABLE.has(res.status) && attempt < BUDGET.retries) {
          await sleep(5_000 * (attempt + 1));
          continue;
        }
        throw new Error(`OpenRouter answered HTTP ${res.status}`);
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
          `OpenRouter returned no review content (finish_reason=${finish}, completion_tokens=${Number(u.completion_tokens) || '?'}, reasoning_tokens=${Number(reasoning) || '?'}, max_tokens=${BUDGET.maxOutputTokens}).`,
        );
      }

      let review;
      try {
        review = JSON.parse(content);
      } catch {
        throw new Error('The review was not valid JSON despite the schema.');
      }
      const violation = firstViolation(schema, review);
      if (violation) throw new Error(`The review did not match the schema at ${violation}.`);
      return { review, usage: json.usage || null, model: json.model || QA_MODEL };
    } finally {
      clearTimeout(timer);
    }
  }
}
