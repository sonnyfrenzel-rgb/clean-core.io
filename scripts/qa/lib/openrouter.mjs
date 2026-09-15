import { BUDGET, OPENROUTER_ENDPOINT, QA_MODEL } from './config.mjs';

/**
 * The only network call the reviewer makes. It sends a delta and gets JSON back;
 * it has no tools, so the model cannot act on the repository — the guardrail is
 * structural, not a sentence in a prompt.
 */

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
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

  let lastError;
  for (let attempt = 0; attempt <= BUDGET.retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(OPENROUTER_ENDPOINT, {
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

      if (!res.ok) {
        // The body of an error response can echo the request; only the status leaves this function.
        lastError = new Error(`OpenRouter answered HTTP ${res.status}`);
        if (RETRYABLE.has(res.status) && attempt < BUDGET.retries) {
          await sleep(5_000 * (attempt + 1));
          continue;
        }
        throw lastError;
      }

      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error('OpenRouter returned no review content.');

      let review;
      try {
        review = JSON.parse(content);
      } catch {
        throw new Error('The review was not valid JSON despite the schema.');
      }
      return { review, usage: json.usage || null, model: json.model || QA_MODEL };
    } catch (err) {
      lastError = err;
      const retryable = err?.name === 'AbortError' || /fetch failed|ECONNRESET|ETIMEDOUT/.test(String(err?.message));
      if (retryable && attempt < BUDGET.retries) {
        await sleep(5_000 * (attempt + 1));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
