import { isModelStage, type ModelStage } from './model-stages';

/**
 * The stage every call to `/api/gemini` names (SEC-01).
 *
 * The seven model stages of `lib/model-stages.ts` are the ones an account can
 * switch off; `glossary` is the help chatbot, which has no switch and no
 * artefact. Until 3.0.21 a call could name no stage at all, and the route then
 * applied no stage rule — no switch, no output bound — to it. Now the stage is
 * required, and it decides the output bound below.
 *
 * Pure: the browser names the stage, the route checks it.
 */
export const PROXY_ONLY_STAGES = ['glossary'] as const;

export type ModelCallStage = ModelStage | (typeof PROXY_ONLY_STAGES)[number];

export function isModelCallStage(value: unknown): value is ModelCallStage {
  return isModelStage(value) || (typeof value === 'string' && (PROXY_ONLY_STAGES as readonly string[]).includes(value));
}

/**
 * The most output tokens (thinking included) one call of a stage may produce
 * on Gemini.
 *
 * Measured on production over 14 days to 22.10.2026, output plus thinking per
 * call: transformation fill up to 33,193; plain wording up to 15,621; testing
 * up to 13,531; analysis up to 10,473; design, naming and documentation up to
 * about 6,000; the help chatbot about 1,000. Each bound is at least twice the
 * largest measured call, and no bound exceeds 65,536, the most the product's
 * Gemini models produce. An answer that reaches its bound ends as incomplete
 * (`lib/model-completion.ts`) — refused, never receipted — so a bound set too
 * low shows up as a named refusal, not as truncated text.
 */
export const STAGE_MAX_OUTPUT_TOKENS: Record<ModelCallStage, number> = {
  analyze: 32_768,
  naming: 16_384,
  statements: 32_768,
  design: 32_768,
  transformation: 65_536,
  documentation: 65_536,
  testing: 65_536,
  glossary: 8_192,
};
