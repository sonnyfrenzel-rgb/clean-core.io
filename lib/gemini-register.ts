import { NAMING_GEMINI_MODEL, PRODUCT_GEMINI_MODEL } from './constants';
import { deploymentModelOf, stageModelsOf } from './model-combination';
import { MODEL_STAGES, type ModelStage } from './model-stages';
import { OWN_CLAUDE_MODEL, type ModelKeyProvider } from './model-providers';

/**
 * F-09: server-side model register. Only a model named here may be called, whoever asks.
 *
 * Moved here from `app/api/gemini/route.ts` on 14.11.2026 so that `GET /api/model-stages`
 * can say which model a stage runs on (`servedGeminiModel` below) from the same register
 * the proxy decides with — a route file may export nothing but its handlers. The proxy
 * imports both sets from here; nothing else about them changed.
 *
 * GA = generally available; PREVIEW = opt-in canary that may change or be withdrawn.
 * Dead Gemini 2.0 IDs were removed (lifecycle ended per Google's deprecation page).
 *
 * `gemini-3-flash-preview` was the product default until 23.09.2026 and is the
 * reason this list is now written down properly: it is a *preview* model, the
 * 3-flash line never reached GA, and Google shipped 3.5, 3.6, 3.7 and 3.8 flash
 * as GA while it stayed a canary. A product whose promise is a signed run cannot
 * rest on a model that may be withdrawn. It stays listed — receipts were issued
 * under it and a client may still ask for it — but it is no longer what the
 * product calls.
 *
 * `gemini-2.5-pro` was listed here as "GA — stable fallback" and was neither.
 * A `generateContent` call with the production key answers HTTP 404, "This model
 * models/gemini-2.5-pro is no longer available to new users" (checked 23.09.2026,
 * three times, roadmap 17.1). It is still in the key's `ListModels` answer, which
 * is why nobody noticed: listing a model is not the same statement as serving it,
 * and only the call tells the two apart.
 *
 * It was struck rather than replaced. Google's own 404 points at
 * `gemini-3.1-pro-preview`, and that is a preview — putting it here as a "stable
 * fallback" would repeat exactly the mistake the paragraph above records. No
 * pro-line model is GA for this key today, so the fallbacks are the three flash
 * models that answered. A client that still pins `gemini-2.5-pro` now gets a 400
 * naming the permitted models instead of a 500 from a provider 404, and
 * `GEMINI_MODEL` can no longer be pointed at an emergency exit that is walled up.
 *
 * The same happened twice more, found 12.11.2026: `gemini-3.5-flash` answered
 * but was served by `gemini-3.6-flash` (Google reroutes it), so a receipt would
 * have named a model that did not answer; `gemini-2.5-flash` refuses a thinking
 * level, which the fill and wording calls send, and shuts down on 1.12.2026.
 * Both were struck; `gemini-3.6-flash` is the exit. The probe now sends a
 * thinking level and counts a rerouted answer as not answered.
 *
 * `scripts/check-gemini-register.mjs` makes the call for every entry here and
 * writes what came back to `tests/gemini-register-liveness.json`;
 * `tests/gemini-model-pin.spec.ts` holds the register and that record together
 * without touching the network. Adding a model here means running the script.
 */
export const ALLOWED_MODELS = new Set([
  'gemini-3.8-flash',       // GA — the product default (lib/constants.ts)
  'gemini-3.6-flash',       // GA — the emergency exit: serves itself and takes a thinking level
  'gemini-4-hydrogen',      // NEW — under evaluation; served on the platform key only where the deployment names it (GEMINI_MODEL, GEMINI_STAGE_MODELS)
  'gemini-3-flash-preview', // PREVIEW — the former default, kept for callers that pin it
  'gemini-3.5-flash-lite',  // GA — the naming stage only (lib/constants.ts, roadmap 17.3)
]);

/** Registered, but served only when `GEMINI_MODEL` makes it the product model; a request naming it is refused. */
export const EVALUATION_ONLY_MODELS = new Set(['gemini-4-hydrogen']);

/**
 * The Gemini model a stage's call runs on, as the proxy decides it for a product
 * caller (one that asks for `PRODUCT_GEMINI_MODEL`): the deployment's product
 * model (`GEMINI_MODEL`, register-checked, else the constant — the proxy's
 * `productModel()`), and on the platform key the stage's model where
 * `GEMINI_STAGE_MODELS` names one (`planModelCall`). An own Gemini key runs as
 * the client asked, so it gets the product model. Not covered: the size and
 * fallback rules of the statements stage, which depend on the prompt and the
 * answer and are off in every lane.
 *
 * Server-only in use (it reads the deployment's environment); pure in itself.
 */
export function servedGeminiModel(stage: string, input: { platformKey: boolean; env: Readonly<Record<string, string | undefined>> }): string {
  // The naming client asks for its own model by name (roadmap 17.3), which the proxy serves as asked.
  const asked = stage === 'naming' ? NAMING_GEMINI_MODEL : deploymentModelOf(input.env.GEMINI_MODEL, ALLOWED_MODELS) ?? PRODUCT_GEMINI_MODEL;
  if (!input.platformKey) return asked;
  return stageModelsOf(input.env, ALLOWED_MODELS, new Set(MODEL_STAGES)).get(stage) ?? asked;
}

/**
 * Per model stage, the model a call of it runs on for this account's key — what
 * `GET /api/model-stages` reports as `stageModels`, so a cost line names the
 * model before the click: the platform key follows `servedGeminiModel`, an own
 * Gemini key the product model, an own Anthropic key the one Claude model
 * (`OWN_CLAUDE_MODEL`). No key, no models.
 */
export function stageModelsForKey(input: {
  keySource: 'byok' | 'community' | null;
  provider: ModelKeyProvider | null;
  env: Readonly<Record<string, string | undefined>>;
}): Partial<Record<ModelStage, string>> {
  const out: Partial<Record<ModelStage, string>> = {};
  if (input.keySource === null || input.provider === null) return out;
  for (const stage of MODEL_STAGES) {
    out[stage] = input.provider === 'anthropic'
      ? OWN_CLAUDE_MODEL
      : servedGeminiModel(stage, { platformKey: input.keySource === 'community', env: input.env });
  }
  return out;
}
