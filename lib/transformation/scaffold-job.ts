import { prepareEngineLed, type EngineLedPreparation, type EngineLedRequest } from './engine-led';

/**
 * The scaffold job (roadmap 3.0.12, step E): the unit plan, the scaffold and
 * the fill requests of one generation, off the page's thread. The worker
 * (`scaffold.worker.ts`) and the in-thread fallback (`scaffold-client.ts`)
 * both run exactly this function, so the page gets the same answer either way.
 *
 * It reads the engine's statements, call graph, rules and the original's
 * contract — never the BPMN map or the process documentation (design §4).
 */
export interface ScaffoldRequest {
  id: number;
  request: EngineLedRequest;
}

export interface ScaffoldResponse {
  id: number;
  preparation: EngineLedPreparation;
}

export function handleScaffoldRequest(message: ScaffoldRequest): ScaffoldResponse {
  return { id: message.id, preparation: prepareEngineLed(message.request) };
}
