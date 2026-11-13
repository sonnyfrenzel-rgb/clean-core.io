/**
 * Which Gemini model answers a call of a stage, and which one is asked when the
 * first does not finish — the model combination of the statements stage
 * (study of 13.11.2026, `docs/design/model-combination.md`).
 *
 * Three deterministic rules, all off unless the deployment sets them, all read
 * on the server and decided by the stage, the prompt's length and the answer's
 * finish reason — never by a case, a customer or the content of the code:
 *
 *   - **the model per stage** (`GEMINI_STAGE_MODELS`): owner decision
 *     13.11.2026 — the stages move to the second model one by one, dev first,
 *     as each is measured. Every call of a named stage follows it, its answer
 *     shapes included (a fill, a plain wording, the business layer), except the
 *     rewording of the statements, which is the product model's work by design.
 *   - **routing by size**: a prompt of a combination stage longer than
 *     `GEMINI_LARGE_PROMPT_CHARS` characters is answered by
 *     `GEMINI_LARGE_PROMPT_MODEL`. Measured on the process benchmark: the
 *     second model's advantage grows with the program (correlation 0.48 with
 *     the line count); against the second model at its right level the rule
 *     gained nothing over giving it the whole stage, which `0` does.
 *   - **cascade on an incomplete answer**: when the first model's answer is not
 *     complete (truncated at the output bound, empty, unfinished — not stopped
 *     by the provider's filter), `GEMINI_FALLBACK_MODEL` is asked once, with its
 *     own thinking level, under the same bound and the same deadline. The
 *     product model lost 5 of 150 learn and 13 of 150 holdout benchmark cases
 *     to its own thinking loop; the fallback answered every one.
 *
 * A model named here must be in the route's register. A model under evaluation
 * may be named — it is the operator's choice, like `GEMINI_MODEL` — and still
 * never a client's: the client's request is checked before this runs, and this
 * reads nothing a client sent except the stage, the shape and the prompt's
 * length. The values are written by the deploy pipeline per environment
 * (`.github/workflows/deploy.yml`, `env-ctx`), so a change is a reviewed commit.
 *
 * Only on the platform key. An account with its own Gemini key runs as it
 * asked: its owner chose a key, not a second model, and the second model may
 * not be served to that key at all.
 *
 * Pure: the environment, the register and the request's facts are handed in.
 */
export const LARGE_PROMPT_MODEL_ENV = 'GEMINI_LARGE_PROMPT_MODEL';
export const LARGE_PROMPT_CHARS_ENV = 'GEMINI_LARGE_PROMPT_CHARS';
export const FALLBACK_MODEL_ENV = 'GEMINI_FALLBACK_MODEL';
/** `stage=model,stage=model` — the stages that run on another model. */
export const STAGE_MODELS_ENV = 'GEMINI_STAGE_MODELS';

/** The answer shapes that stay on the product model whatever their stage's model: the product model's work by design. */
const SHAPES_ON_PRODUCT_MODEL: ReadonlySet<string> = new Set(['statements-rewording']);

/** The stages the size and fallback rules were measured on; they apply to no other. */
export const COMBINATION_STAGES: ReadonlySet<string> = new Set(['statements']);

/**
 * About 200 ABAP lines of the statements prompt: on the 150 learn cases the
 * prompt of a 170–230-line program had a median of 12,600 characters (the
 * instructions and the element list are about 2,500 of them).
 */
export const DEFAULT_LARGE_PROMPT_CHARS = 12_500;

export interface ModelCallPlan {
  /** The model the provider is asked first. */
  model: string;
  /** Whether a rule moved the call off the model the request resolved to. */
  routed: boolean;
  /** The model asked once when the first answer is incomplete, or null. */
  fallback: string | null;
}

/** A model the deployment names, when it is in the register; otherwise null (an unknown or misspelt name is ignored, never trusted). */
export function deploymentModelOf(named: string | undefined, register: ReadonlySet<string>): string | null {
  const name = named?.trim();
  return name && register.has(name) ? name : null;
}

/** The stages that run on another model, register-checked, a stage once at most (the first entry wins). */
export function stageModelsOf(env: Readonly<Record<string, string | undefined>>, register: ReadonlySet<string>, stages: ReadonlySet<string>): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const pair of (env[STAGE_MODELS_ENV] ?? '').split(',')) {
    const at = pair.indexOf('=');
    if (at < 1) continue;
    const stage = pair.slice(0, at).trim();
    const model = deploymentModelOf(pair.slice(at + 1), register);
    if (stages.has(stage) && model && !out.has(stage)) out.set(stage, model);
  }
  return out;
}

/**
 * The length above which a prompt is "large". `0`, set explicitly, means every
 * prompt of the stage — the stage runs on the named model, and the rest of the
 * product stays on the product model. Unset or invalid: the measured default.
 */
export function largePromptThreshold(env: Readonly<Record<string, string | undefined>>): number {
  const raw = (env[LARGE_PROMPT_CHARS_ENV] ?? '').trim();
  if (raw === '') return DEFAULT_LARGE_PROMPT_CHARS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LARGE_PROMPT_CHARS;
}

export function planModelCall(input: {
  stage: string;
  /** The answer shape within the stage, when the request named one. */
  shape?: string;
  promptLength: number;
  /** The model the request resolved to and the register admitted. */
  model: string;
  /** Whether the platform key pays for this call. */
  platformKey: boolean;
  env: Readonly<Record<string, string | undefined>>;
  register: ReadonlySet<string>;
  /** The model stages the deployment may name (`MODEL_STAGES`); the route hands them in. Without them no stage model applies. */
  stages?: ReadonlySet<string>;
}): ModelCallPlan {
  const asAsked: ModelCallPlan = { model: input.model, routed: false, fallback: null };
  if (!input.platformKey) return asAsked;
  const named = deploymentModelOf(input.env[FALLBACK_MODEL_ENV], input.register);
  // The stage's model, when the deployment set one — every call of the stage except the shapes that are the
  // product model's work by design.
  const stageModel = input.stages ? stageModelsOf(input.env, input.register, input.stages).get(input.stage) ?? null : null;
  if (stageModel && !(input.shape !== undefined && SHAPES_ON_PRODUCT_MODEL.has(input.shape))) {
    return { model: stageModel, routed: stageModel !== input.model, fallback: named && named !== stageModel ? named : null };
  }
  // The size and fallback rules: the statements stage's own answer only.
  if (input.shape !== undefined || !COMBINATION_STAGES.has(input.stage)) return asAsked;
  const large = deploymentModelOf(input.env[LARGE_PROMPT_MODEL_ENV], input.register);
  const routed = large !== null && large !== input.model && input.promptLength > largePromptThreshold(input.env);
  const model = routed && large ? large : input.model;
  // A fallback that is the model just asked would repeat the same call into the same limit.
  const fallback = named && named !== model ? named : null;
  return { model, routed, fallback };
}
