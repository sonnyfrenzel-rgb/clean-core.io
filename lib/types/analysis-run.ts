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
