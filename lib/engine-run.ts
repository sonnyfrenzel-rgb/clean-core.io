import { getAuth } from '@/lib/firebase';
import type { AssessmentTarget } from '@/lib/assessment-target';
import type { ModelReceipt } from '@/lib/model-receipt';

/**
 * The signed engine-only run a new project starts with (ADR-072).
 *
 * A project used to open its workspace with source and no run, so the process
 * map — which is drawn only from source a signed run read (`lib/signed-source.ts`)
 * — was an empty box that sent the reader to Analyze (owner, 03.10.2026: "the
 * complete process map has to be there at once, otherwise you lose the
 * overview"). The start now signs the engine's reading straight away.
 *
 * **What this is, exactly.** The same `POST /api/runs/create` every analysis
 * ends in, with no narrative: the route recomputes the evidence, the scores,
 * the worklist and the assessment profile from the stored source itself and
 * signs that, so nothing the browser could compute is sent — not even the
 * source, which the route reads from the project, so the run's fingerprint is
 * the fingerprint of exactly the text the map is then drawn from. The
 * narrative is the one thing a run may lack (roadmap 1.2); this run carries it
 * only when the model is on and answered in time (below), and otherwise makes
 * **no model call** at all.
 *
 * **What it costs** is what the route decides by the rules it always applied
 * (`reserveRunQuota`): the first run of an unchanged shipped example is free,
 * any other new source uses one of the account's analysis runs once the run is
 * signed, the same source again is free. Every start screen says so before the
 * click (`lib/run-cost.ts`); nothing here grants or meters anything.
 *
 * Not `lib/analysis-run.ts`: that sequence computes the evidence in the browser
 * for its stage list, which pulls the engine and the 4.3 MB catalog into the
 * workspace route. The server computes it anyway, and signs its own.
 *
 * **With the model on** (owner decision 03.10.2026): when the account's
 * analysis stage is on and a key is available, the start asks the model for
 * the narrative first (`lib/start-narrative.ts`) and this one request then
 * carries it, with the receipt `/api/gemini` issued over exactly that text, so
 * the one signed run has the narrative. A narrative that did not arrive in time
 * is left out and the same request signs the engine's reading alone — still
 * one run, never a second one after it.
 */

/** The start's ceiling for the model, kept with the stages in `lib/model-stages.ts`. */
export { START_NARRATIVE_CEILING_MS } from './model-stages';

export interface EngineRunInput {
  projectId: string;
  /** The file name the run records — the uploaded or example file. */
  fileName: string;
  /** The edition the run is assessed against, as the list report's Run decides it. */
  deployment: 'public' | 'private';
  /** The declared half of the target profile, when the project has one. */
  targetProfile?: AssessmentTarget;
  /**
   * The model's narrative, as `/api/gemini` returned it, byte for byte, with
   * the receipt issued over it. Absent, the run has no narrative.
   */
  narrative?: { text: string; receipt: ModelReceipt | null } | null;
  signal?: AbortSignal;
}

export interface EngineRunResult {
  runId: string;
  /** What the route recorded about the model's part in the run. */
  modelParticipation: 'narrative' | 'narrative-attested' | 'none';
}

/** A refusal the route sent, with its own sentence — shown as it is. */
export class EngineRunRefused extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'EngineRunRefused';
    this.status = status;
  }
}

export async function signEngineRun(input: EngineRunInput): Promise<EngineRunResult> {
  const { projectId, fileName, deployment, targetProfile, narrative, signal } = input;
  const idToken = await getAuth().currentUser?.getIdToken();
  const response = await fetch('/api/runs/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    signal,
    body: JSON.stringify({
      projectId,
      s4Deployment: deployment,
      ...(targetProfile ? { targetProfile } : {}),
      // Without a narrative there is no receipt, and the run records that no
      // model took part. With one, the text goes up exactly as the proxy
      // returned it: the receipt is over those bytes, and the route performs
      // its own normalisation before it signs.
      analysis: narrative?.text ?? '',
      ...(narrative?.text && narrative.receipt ? { modelReceipt: narrative.receipt } : {}),
      uploadedFileName: fileName,
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: unknown };
    const message = typeof body.error === 'string' && body.error.trim() ? body.error : 'The run could not be signed.';
    throw new EngineRunRefused(message, response.status);
  }
  const body = (await response.json().catch(() => ({}))) as { runId?: unknown; modelParticipation?: unknown };
  if (typeof body.runId !== 'string' || !body.runId) throw new EngineRunRefused('The run could not be signed.', 500);
  const participation =
    body.modelParticipation === 'narrative' || body.modelParticipation === 'narrative-attested' ? body.modelParticipation : 'none';
  return { runId: body.runId, modelParticipation: participation };
}
