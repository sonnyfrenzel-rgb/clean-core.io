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
    provider: string;
    modelId: string;
    engineVersion: string;
    byokUsed: boolean;
  };
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
    provider: string;
    modelId: string;
    responseHash: string; // sha256 of `analysis`
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
