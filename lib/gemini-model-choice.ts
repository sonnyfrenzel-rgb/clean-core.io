import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';

/**
 * Which model a request to `/api/gemini` runs on.
 *
 * Every product caller names `PRODUCT_GEMINI_MODEL` explicitly, so a body
 * default alone never reached the deployment's choice: with `GEMINI_MODEL`
 * pointed at a replacement after Google withdrew the default, the stages kept
 * asking for the withdrawn model. A request for the product default — named or
 * omitted — therefore means "whatever this deployment runs as its product
 * model". A request for any other model (the naming stage's) keeps its choice;
 * the register check after this still decides whether it may run.
 *
 * Pure: the deployment's model is handed in.
 */
export function resolveRequestedModel(requested: string | undefined, deploymentModel: string): string {
  if (requested === undefined || requested === PRODUCT_GEMINI_MODEL) return deploymentModel;
  return requested;
}

/**
 * Whether the resolved model may run: it is in the register, and a model under
 * evaluation runs only when it is this deployment's product model
 * (`GEMINI_MODEL`), never because a client named it. Pure: the register and the
 * deployment's model are handed in.
 */
export function modelServable(
  model: string,
  deploymentModel: string,
  register: ReadonlySet<string>,
  evaluationOnly: ReadonlySet<string>,
): boolean {
  if (!register.has(model)) return false;
  return !evaluationOnly.has(model) || model === deploymentModel;
}
