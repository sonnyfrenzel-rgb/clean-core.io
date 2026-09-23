import { getAuth } from '@/lib/firebase';
import { callGeminiWithReceipt } from '@/lib/gemini';
import type { ModelReceipt } from '@/lib/model-receipt';
import { buildAnalysisPrompt } from '@/lib/analysis-prompt';
import { buildAbapEvidence, type EvidenceFinding } from '@/lib/abap/evidence-model';
import { routeExtensibility } from '@/lib/abap/extensibility-router';
import {
  extractCodeInventory,
  extractDataCoupling,
  computeComplexityScore,
  computeCriticalityScore,
} from '@/lib/abap/code-assessment';
import { absenceFromError, type ModelAbsence, type ModelParticipation } from '@/lib/model-stages';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';

/**
 * One analysis run, startable from more than one screen.
 *
 * Until roadmap 1.8 the only way to start an analysis was the Analyze stage,
 * because the whole sequence — evidence, narrative, signed run — lived inside
 * `app/(app)/project/[projectId]/analyze/page.tsx` as one 200-line function
 * body. The workspace list report (`DESIGN.md` §2.2, mockup s7) has to start the
 * same run from a table row and show it running there, and a second copy of a
 * sequence that ends in a *signed* artefact is the one kind of duplication this
 * product cannot afford: the two copies would sign different things and nobody
 * would have a reason to compare them.
 *
 * So the sequence is here, and the pieces it is made of are the ones that were
 * already shared — `buildAbapEvidence`, `routeExtensibility`, the two assessment
 * scores, `buildAnalysisPrompt`, `callGemini`, `POST /api/runs/create`.
 *
 * Three properties the callers depend on, each of them a rule from `DESIGN.md`
 * §2.8 (ADR-019):
 *
 *   1. **Stages, not percentages.** `onStages` is called with the whole list
 *      every time one of them moves. There is no progress number anywhere in
 *      here, because there is no progress number to have.
 *   2. **The model is one stage of the run, not the run.** With
 *      `callModel: false` — roadmap 1.2's zero-LLM path — the narrative stage is
 *      simply absent and everything else happens exactly as it otherwise would,
 *      ending in the same signed evidence state.
 *   3. **Cancelling is honest about what it can cancel.** The `signal` aborts
 *      this browser's two `fetch` calls. It does not stop the server: a model
 *      call already sent runs to completion behind `/api/gemini`, and a request
 *      that reached `/api/runs/create` creates and signs the run whatever this
 *      tab does next. The sentence that says so on screen is the catalogue key
 *      `run.cancelReach` in `lib/cc-messages.ts`, written once so no screen can
 *      soften it on its own.
 */

export type AnalysisRunStageId = 'evidence' | 'narrative' | 'sign';

export interface AnalysisRunStage {
  id: AnalysisRunStageId;
  /** "Code read", "Analysis narrative", "Run signed". */
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  /** What the stage found, once it is done. Announced with the label, once. */
  result?: string;
}

const STAGE_LABELS: Record<AnalysisRunStageId, string> = {
  evidence: 'Code read',
  narrative: 'Analysis narrative',
  sign: 'Run signed',
};

export interface AnalysisRunInput {
  projectId: string;
  legacyCode: string;
  /** The uploaded file name, as the run records it. */
  fileName: string;
  deployment: 'public' | 'private';
  // `byokUsed` used to be here, taken from `profile.byokConfigured` and sent to
  // the run route inside a client-supplied `modelCard`. The route has not read
  // that since 1.2, and since the model receipt the answer comes from the
  // server's own record of the call (`lib/model-receipt.ts`) or from the profile
  // the route reads itself. A parameter nobody reads is a claim waiting to be
  // trusted again.
  /**
   * Whether to ask a model for the narrative. False is roadmap 1.2's path, not
   * a degraded one: the run it produces is signed over the same evidence.
   */
  callModel: boolean;
  signal?: AbortSignal;
  onStages?: (stages: AnalysisRunStage[]) => void;
}

export interface AnalysisRunResult {
  runId: string;
  findingCount: number;
  cleanCoreScore: number;
  modelParticipation: ModelParticipation;
  /** Why there is no narrative, or `null` when there is one. */
  narrativeAbsence: ModelAbsence;
}

/** Thrown when the caller's `AbortSignal` fired. Not an error to report as one. */
export class AnalysisRunCancelled extends Error {
  constructor() {
    super('The analysis was cancelled in this browser.');
    this.name = 'AnalysisRunCancelled';
  }
}

/** The three figures the run computes and a model may not overwrite. */
const MODEL_MUST_NOT_OWN = ['cleanCoreScore', 'complexityScore', 'criticalityScore'] as const;

/**
 * The deterministic half of the initial worklist: one item per grouped finding.
 *
 * Moved here from the Analyze stage so the workspace produces the identical
 * worklist. It is reached from four places now — a parsed narrative, an
 * unparseable one, a run with no narrative at all (roadmap 1.2), and a run
 * started from the list report (roadmap 1.8).
 */
export function findingsWorklist(
  findings: EvidenceFinding[],
  fileName: string,
): Record<string, unknown>[] {
  const grouped = new Map<string, { finding: EvidenceFinding; lines: number[] }>();
  for (const f of findings) {
    const groupKey = `${f.kind}::${f.objectName || f.title}`;
    const existing = grouped.get(groupKey);
    if (existing) {
      existing.lines.push(f.lineStart);
    } else {
      grouped.set(groupKey, { finding: f, lines: [f.lineStart] });
    }
  }
  return Array.from(grouped.values()).map(({ finding: f, lines }, idx) => ({
    id: `finding-${f.kind}-${idx}`,
    title: lines.length > 1 ? `${f.title} (${lines.length}×)` : f.title,
    category: 'Finding',
    level: f.severity === 'Critical' || f.severity === 'High' ? 'not-supported' : 'partial',
    severity: f.severity === 'Critical' || f.severity === 'High' ? 'High' : f.severity === 'Medium' ? 'Medium' : 'Low',
    location: lines.length > 1 ? `${fileName}:${lines.join(', ')}` : `${fileName}:${lines[0]}`,
    recommendation: f.recommendation,
    status: 'open',
    effort: f.severity === 'Critical' ? 'High' : f.severity === 'High' || f.severity === 'Medium' ? 'Medium' : 'Low',
    targetAnchor: f.kind,
    detail: f.technicalDetail,
  }));
}

/** "1 program, 668 lines" — the scope sentence §2.8 asks for before a long run. */
export function runScope(legacyCode: string): string {
  const lines = legacyCode.split(/\r?\n/).length;
  return `Reading 1 program, ${new Intl.NumberFormat('en').format(lines)} lines`;
}

function stagesFor(callModel: boolean): AnalysisRunStage[] {
  const ids: AnalysisRunStageId[] = callModel
    ? ['evidence', 'narrative', 'sign']
    : ['evidence', 'sign'];
  return ids.map((id) => ({ id, label: STAGE_LABELS[id], status: 'pending' }));
}

function aborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/**
 * Runs the analysis and returns the signed run.
 *
 * Every figure below `analysis` is computed here, from the source, and the
 * server recomputes and signs its own. The narrative is the one thing a model
 * writes and the one thing the signature deliberately does not cover.
 */
export async function runAnalysis(input: AnalysisRunInput): Promise<AnalysisRunResult> {
  const { projectId, legacyCode, fileName, deployment, callModel, signal, onStages } = input;

  const stages = stagesFor(callModel);
  const publish = () => onStages?.(stages.map((s) => ({ ...s })));
  const move = (id: AnalysisRunStageId, status: AnalysisRunStage['status'], result?: string) => {
    const stage = stages.find((s) => s.id === id);
    if (!stage) return;
    stage.status = status;
    if (result !== undefined) stage.result = result;
    publish();
  };

  publish();
  if (aborted(signal)) throw new AnalysisRunCancelled();

  // 1. The deterministic evidence. No network, no model — this is the half that
  //    the signature is over.
  move('evidence', 'running');
  const evidenceReport = buildAbapEvidence(legacyCode, fileName, deployment);
  const routeReport = routeExtensibility(evidenceReport, deployment);
  const findingCount = evidenceReport.findings.length;
  move(
    'evidence',
    'done',
    `${new Intl.NumberFormat('en').format(findingCount)} findings, Clean Core Score ${routeReport.cleanCoreScore}`,
  );
  if (aborted(signal)) throw new AnalysisRunCancelled();

  // 2. The narrative, if this run is meant to have one.
  //
  // What travels to the run route is the model's text as the proxy returned it,
  // byte for byte, together with the receipt the proxy issued over exactly that
  // text (`lib/model-receipt.ts`). Rewriting it here would make an honest run
  // fail the origin check, so the normalisation below is for this function's own
  // worklist only; the route performs the same normalisation before it signs.
  let narrative = '';
  let modelReceipt: ModelReceipt | null = null;
  let narrativeAbsence: ModelAbsence = null;
  let worklist = findingsWorklist(evidenceReport.findings, fileName);

  if (!callModel) {
    // The reader's own choice, not a limit of the account — `lib/model-stages.ts`
    // owns that distinction and the sentence that goes with it.
    narrativeAbsence = 'declined';
  } else {
    move('narrative', 'running');
    try {
      const prompt = buildAnalysisPrompt({
        targetDeployment: deployment,
        evidenceReport,
        routeReport,
        code: legacyCode,
      });
      const generated = await callGeminiWithReceipt(prompt, PRODUCT_GEMINI_MODEL, true, 'analyze', signal);
      if (aborted(signal)) throw new AnalysisRunCancelled();
      const responseText = generated.text;
      const cleaned = responseText.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
      const parsed = JSON.parse(cleaned);
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!obj || typeof obj !== 'object') throw new Error('the narrative was not an object');
      // The deterministic figures belong to the run, not to the model. Dropped
      // from this function's copy; the route drops them from the one it signs.
      for (const owned of MODEL_MUST_NOT_OWN) delete obj[owned];
      narrative = responseText;
      modelReceipt = generated.receipt;
      const gaps = Array.isArray(obj.gaps) ? obj.gaps : [];
      worklist = [
        ...worklist,
        ...gaps.map((g: Record<string, unknown>, idx: number) => ({
          id: `gap-${idx}`,
          title: g.title,
          category: 'Functional Gap',
          severity: g.severity,
          location: 'S/4HANA Configuration',
          recommendation: g.rationale,
          strategy: g.strategy,
          status: 'open',
          effort: g.complexity,
        })),
      ];
      move('narrative', 'done', 'written');
    } catch (err) {
      if (err instanceof AnalysisRunCancelled || aborted(signal)) throw new AnalysisRunCancelled();
      // A narrative that did not arrive is a stage that failed, not a run that
      // failed: the evidence below is signed either way (roadmap 1.2).
      narrativeAbsence = absenceFromError(err);
      narrative = '';
      modelReceipt = null;
      worklist = findingsWorklist(evidenceReport.findings, fileName);
      move('narrative', 'failed');
    }
  }

  if (aborted(signal)) throw new AnalysisRunCancelled();

  // 3. The signed run. The server recomputes the evidence and signs its own
  //    canonical payload; what goes up is the input, not the verdict.
  move('sign', 'running');
  const idToken = await getAuth().currentUser?.getIdToken();
  let response: Response;
  try {
    response = await fetch('/api/runs/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      signal,
      body: JSON.stringify({
        projectId,
        legacyCode,
        s4Deployment: deployment,
        analysis: narrative,
        ...(modelReceipt ? { modelReceipt } : {}),
        extensibilityRoute: routeReport.recommendedRoute,
        cleanCoreScore: routeReport.cleanCoreScore,
        complexityScore: computeComplexityScore(legacyCode),
        criticalityScore: computeCriticalityScore(legacyCode),
        worklist,
        codeInventory: extractCodeInventory(legacyCode),
        dataCoupling: extractDataCoupling(legacyCode),
        evidenceReport: JSON.parse(JSON.stringify(evidenceReport)),
        originalRecommendation: routeReport.recommendedRoute === 'Side-by-Side (SAP BTP)' ? 'cap' : 'rap',
        recommendationConfidence: routeReport.confidenceScore,
        recommendationJustification: routeReport.rationale,
        uploadedFileName: fileName,
        // No `modelCard`. It was a client-supplied claim about which model had
        // run, the route has not read it since 1.2, and what the run records now
        // comes from the receipt the server issued to itself.
      }),
    });
  } catch (err) {
    move('sign', 'failed');
    if (aborted(signal) || (err instanceof Error && err.name === 'AbortError')) {
      throw new AnalysisRunCancelled();
    }
    throw err;
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    move('sign', 'failed');
    throw new Error(errData.error || 'The run could not be recorded.');
  }

  const runResult = await response.json();
  move('sign', 'done', `Clean Core Score ${routeReport.cleanCoreScore}`);

  return {
    runId: runResult.runId,
    findingCount,
    cleanCoreScore: routeReport.cleanCoreScore,
    // The server's answer, not this function's guess. Whether the narrative's
    // origin was established is decided by the receipt check inside the route,
    // and a caller told `narrative` by a browser that had no way to know would
    // be reading the same unchecked claim one layer out.
    modelParticipation: (runResult.modelParticipation as ModelParticipation | undefined) ?? (narrative ? 'narrative' : 'none'),
    narrativeAbsence,
  };
}
