import { EvidenceFinding } from '../abap/evidence-model';

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
  // Integrity signatures
  runHash: string;
  signature: string;
}
