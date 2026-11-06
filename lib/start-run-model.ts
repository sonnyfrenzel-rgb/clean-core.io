import type { ModelStage } from './model-stages';

/**
 * Whether the first run of a new project asks the model for its narrative
 * (legal review 06.11.2026, 3.0.21, item 3 / N2): the answer of
 * `/api/model-stages` known, a key, the analysis stage on and the account's
 * main switch "Automatic AI steps" on (`lib/auto-model-steps.ts`). Anything
 * else — the main switch off, the stage off, no key, an answer that failed —
 * signs the engine's complete reading alone, with no model call at all
 * (`hooks/useStartRun.ts`).
 *
 * Pure: the hook and the spec read the same line.
 */
export function startCallsModel(model: { known: boolean; autoModelSteps: boolean; enabled: (stage: ModelStage) => boolean }): boolean {
  return model.known && model.autoModelSteps && model.enabled('analyze');
}
