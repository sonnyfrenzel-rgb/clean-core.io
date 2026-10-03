import { callGeminiWithReceipt } from '@/lib/gemini';
import type { ModelReceipt } from '@/lib/model-receipt';
import { buildAnalysisPrompt } from '@/lib/analysis-prompt';
import { routeExtensibility } from '@/lib/abap/extensibility-router';
import { previewRunEvidence } from '@/hooks/useProjectEvidence';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import type { AssessmentTarget } from '@/lib/assessment-target';

/**
 * The narrative a new project's start asks for when the model is on (owner
 * decision 03.10.2026, amending ADR-072).
 *
 * The same analysis Analyze runs, from the same pieces: the evidence the run
 * will sign, read from the server with the run's own inputs
 * (`previewRunEvidence`), the extensibility route over it, the one prompt of
 * the Analyze stage (`buildAnalysisPrompt`) and the proxy under the `analyze`
 * stage, which checks the account's switch and issues the receipt. Nothing of
 * the prompt is written here, so the narrative of a start and the narrative of
 * Analyze cannot drift apart.
 *
 * It runs while the first look builds up, not before or after it (owner,
 * 03.10.2026: "use the time of the first steps"): the build-up paints the
 * engine's own reading, which needs no model, and only its last moment waits
 * for the answer — never past `START_NARRATIVE_CEILING_MS` (`lib/engine-run.ts`).
 *
 * The answer is checked the way `lib/analysis-run.ts` checks it — readable JSON,
 * one object — and handed on byte for byte; the run route normalises its own
 * copy before it signs. A narrative that is not readable is not a narrative.
 */

export interface StartNarrativeInput {
  projectId: string;
  source: string;
  fileName: string;
  deployment: 'public' | 'private';
  targetProfile: AssessmentTarget;
  signal?: AbortSignal;
}

export interface StartNarrative {
  text: string;
  receipt: ModelReceipt | null;
}

export async function writeStartNarrative(input: StartNarrativeInput): Promise<StartNarrative> {
  const { projectId, source, fileName, deployment, targetProfile, signal } = input;
  const evidenceReport = await previewRunEvidence(projectId, { source, fileName, deployment, targetProfile });
  if (signal?.aborted) throw new DOMException('The wait for the narrative ended.', 'AbortError');
  const routeReport = routeExtensibility(evidenceReport, deployment);
  const prompt = buildAnalysisPrompt({ targetDeployment: deployment, evidenceReport, routeReport, code: source });
  const generated = await callGeminiWithReceipt(prompt, PRODUCT_GEMINI_MODEL, true, 'analyze', signal);
  const cleaned = generated.text.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
  const parsed: unknown = JSON.parse(cleaned);
  const obj = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!obj || typeof obj !== 'object') throw new Error('the narrative was not an object');
  return { text: generated.text, receipt: generated.receipt };
}

/** The reasons and their sentences live in the import-free half, so a spec or a server can read them. */
export { missingFrom, startNarrativeMissingReason, type StartNarrativeMissing } from './start-narrative-basics';
