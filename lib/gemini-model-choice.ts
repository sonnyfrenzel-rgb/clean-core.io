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
