import { getAuth } from '@/lib/firebase';
import type { AssessmentTarget } from '@/lib/assessment-target';

/**
 * The signed engine-only run a new project starts with (ADR-066).
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
 * narrative is the one thing a run may lack (roadmap 1.2), and this run lacks
 * it by design: **no model call**.
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
 */

export interface EngineRunInput {
  projectId: string;
  /** The file name the run records — the uploaded or example file. */
  fileName: string;
  /** The edition the run is assessed against, as the list report's Run decides it. */
  deployment: 'public' | 'private';
  /** The declared half of the target profile, when the project has one. */
  targetProfile?: AssessmentTarget;
  signal?: AbortSignal;
}

export interface EngineRunResult {
  runId: string;
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
  const { projectId, fileName, deployment, targetProfile, signal } = input;
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
      // No narrative, so no receipt: the run records that no model took part.
      analysis: '',
      uploadedFileName: fileName,
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: unknown };
    const message = typeof body.error === 'string' && body.error.trim() ? body.error : 'The run could not be signed.';
    throw new EngineRunRefused(message, response.status);
  }
  const body = (await response.json().catch(() => ({}))) as { runId?: unknown };
  if (typeof body.runId !== 'string' || !body.runId) throw new EngineRunRefused('The run could not be signed.', 500);
  return { runId: body.runId };
}
