import type { AbapEvidenceReport } from '@/lib/abap/evidence-model';

/**
 * What `GET`/`POST /api/projects/{id}/evidence` answer: the engine's evidence
 * report computed on the server with the catalog snapshot the signed run reads.
 *
 * Types only — the browser imports this module, and nothing here may reach the
 * engine or the catalog (`tests/client-catalog-boundary.spec.ts`).
 */
export interface ProjectEvidence {
  evidence: AbapEvidenceReport;
  /** SHA-256 of the source the report was computed from. */
  sourceSha256: string;
  /** The catalog snapshot the report read — key and digest, as a run records it. */
  catalog: { registryKey: string; sourceSha256: string };
  /** The file name the report was computed under. */
  fileName: string;
  deployment: 'public' | 'private';
}
