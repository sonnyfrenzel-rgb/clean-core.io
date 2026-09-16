import type { EvidenceFinding } from '../abap/evidence-model';
import type { DataCouplingEntry, CodeInventoryItem, WorklistItem } from '../types';

export interface AnalysisRun {
  runId: string;
  projectId: string;
  userId: string;
  createdAt: string;
  status: 'running' | 'completed' | 'failed' | 'superseded';
  inputFingerprint: {
    sha256: string;
    fileName: string;
    lineCount: number;
    byteSize: number;
    objectType: string;
  };
  analyzerVersion: string;
  rulesetVersion: string;
  sapApiCatalogVersion: string;
  /**
   * What this run was computed from — every input with its revision and hash
   * (roadmap 0.5, `lib/input-manifest.ts`). Inside the signed payload, so the
   * signature covers the binding and not only the result.
   *
   * Absent on runs signed before 0.5; those canonicalise and verify exactly as
   * they did, because the hash is recomputed from the stored document
   * (`recomputeStoredRunHash`).
   */
  inputManifest?: import('../input-manifest').InputManifest;
  model: {
    /**
     * Null unless a model call was **observed** for this run — either because
     * none took part (roadmap 1.2, the zero-LLM path) or because the narrative
     * arrived without a verifiable receipt (`lib/model-receipt.ts`). Not absent:
     * absent means an old run that recorded nothing, null means a run that
     * recorded there was nothing to record. `modelParticipation` says which.
     */
    provider: string | null;
    modelId: string | null;
    engineVersion: string;
    /**
     * Whose key served the call, where a receipt established it; otherwise
     * whether BYOK was configured on the account when the run was created.
     */
    byokUsed: boolean;
  };
  /**
   * Roadmap 1.2 — what part a model had in this run, inside the signed payload.
   *
   * `narrative-attested`: `/api/gemini` issued a receipt for exactly this text,
   * to this account, and `/api/runs/create` verified it — `model.provider` and
   * `model.modelId` name what the server actually called.
   * `narrative`: a narrative is present and its origin was not established;
   * `model.provider` and `model.modelId` are null.
   * `none`: nothing was submitted, and the run carries the deterministic
   * evidence alone — which is still a complete, signed evidence state.
   *
   * Absent on runs signed before 1.2; those canonicalise and verify exactly as
   * they did, because the hash is recomputed from the stored document.
   */
  modelParticipation?: import('../model-stages').ModelParticipation;
  // Results
  extensibilityRoute: string;
  cleanCoreScore: number;
  complexityScore: number;
  criticalityScore: number;
  analysis: string;
  /**
   * v1.20 §6 — Server-authoritative narrative separation.
   * The AI narrative (`analysis`) is NOT server-computed and is deliberately
   * EXCLUDED from the signed `runHash`. Only its content hash is committed here,
   * so the signature attests to server-computed evidence, not to client-supplied
   * free text. The narrative is stored for display/downstream but is non-evidentiary.
   */
  aiNarrativeMeta?: {
    /** `null` together with `responseHash` when no narrative was generated. */
    provider: string | null;
    modelId: string | null;
    responseHash: string | null; // sha256 of `analysis`
    evidentiary: false;
  };
  evidenceReport: EvidenceFinding[];
  // v1.17: Audit Pack completeness — fields previously only on the project doc
  dataCoupling?: DataCouplingEntry[];
  codeInventory?: CodeInventoryItem[];
  worklist?: WorklistItem[];
  originalRecommendation?: string;
  recommendationConfidence?: number;
  recommendationJustification?: string;
  // Integrity signatures
  runHash: string;
  signature: string;
}
