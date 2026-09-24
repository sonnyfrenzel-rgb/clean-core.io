/**
 * The boundary between what an audit pack signs and what it merely carries.
 *
 * `/api/audit-pack/create` used to hand the generators `{ ...projectData,
 * ...runData }` — the whole project document under the run — and sign whatever
 * came out. The project document is the owner's: `firestore.rules` lets the
 * signed-in account write `targetArchitecture`, `approvedByArchitect`,
 * `approvedBy`, `architectSignOffAt`, `solutionDesign`, the generated code, the
 * documentation and more, straight from the browser. Two of those fields had
 * already been plugged one at a time (`worklist`, `extensibilityRoute`); the
 * rest still went into hashed, signed files, so a sign-off typed into a form
 * came out as server evidence with a signature on it.
 *
 * This module is the fix, and it is a list rather than a filter: the input to
 * the signed generators is built here from named fields of the run, and nothing
 * reaches them that is not on that list. What the owner stated goes into one
 * separately named file that the manifest lists as attested and the signature
 * does not cover. `tests/audit-pack-signed-input.spec.ts` changes every
 * client-writable field and asserts that no signed byte moves.
 */

import type { Project } from '@/lib/types';
import { buildEvidenceChain, coversOf, type CoverEntry } from '@/lib/evidence-chain';
import {
  generateExecutiveSummary,
  generateExecutiveSummaryDoc,
  generateDecisionRecord,
  generateArchitectureDecisionRecord,
  generateFindingsCsv,
  generateModelCard,
  generateKnownLimitations,
  generateProvenanceManifest,
  generateInputManifestFile,
  generateEvidenceChainFile,
  generateUserAttestations,
  EVIDENCE_CHAIN_FILE,
  INPUT_MANIFEST_FILE,
  USER_ATTESTED_FILE,
  type UserAttestations,
} from '@/lib/audit-pack';

export interface AuditPackSource {
  projectId: string;
  runId: string;
  /** The immutable run document, already verified against its own signature. */
  run: Record<string, unknown>;
  /**
   * Written by the Admin SDK in `runs/create` and not in the client update
   * allowlist — but it sits on the project document, so it is named here
   * rather than spread. Only the two sub-records the generators read.
   */
  auditMetadata?: Project['auditMetadata'];
  /** The owner's own statements. Never reach a signed file. */
  attested: UserAttestations;
}

export interface AuditPackContents {
  /** Hashed, listed under `files`, covered by the signature. */
  signed: Record<string, string>;
  /** Listed under `attested`; the name is bound, the contents are not. */
  attested: Record<string, string>;
}

/**
 * The fields of a run the signed generators are allowed to see, by name.
 * Adding a field here is a deliberate act with a diff to review; a spread was
 * neither.
 */
const RUN_FIELDS = [
  'status',
  'createdAt',
  'inputFingerprint',
  'analyzerVersion',
  'rulesetVersion',
  'sapApiCatalogVersion',
  // Roadmap 0.5 — what the run was computed from. Server-written, inside the
  // run's own signature; the pack repeats it in a file of its own.
  'inputManifest',
  'model',
  'extensibilityRoute',
  'cleanCoreScore',
  'complexityScore',
  'criticalityScore',
  'evidenceReport',
  'dataCoupling',
  'codeInventory',
  'worklist',
  'originalRecommendation',
  'recommendationConfidence',
  'recommendationJustification',
  'runHash',
] as const;

export function signedGeneratorInput(src: AuditPackSource): Project {
  const input: Record<string, unknown> = { id: src.projectId, activeRunId: src.runId };
  for (const key of RUN_FIELDS) {
    if (src.run[key] !== undefined) input[key] = src.run[key];
  }
  // The pack's own evidence class, and the only project-level record that is
  // not the owner's to write.
  if (src.auditMetadata) {
    input.auditMetadata = {
      inputFingerprint: src.auditMetadata.inputFingerprint,
      modelCard: src.auditMetadata.modelCard,
    };
  }
  // Evidence comes from the run, never from the project — and never from a
  // missing run field either: an absent worklist is an empty one, not the
  // project's interactive copy.
  input.worklist = Array.isArray(src.run.worklist) ? src.run.worklist : [];
  return input as unknown as Project;
}

export function buildAuditPackContents(src: AuditPackSource): AuditPackContents {
  const project = signedGeneratorInput(src);
  const signed: Record<string, string> = {
    '00-executive-summary.md': generateExecutiveSummary(project),
    '00-executive-summary.doc': generateExecutiveSummaryDoc(project),
    '00-provenance.md': generateProvenanceManifest(project),
    '01-input-fingerprint.json': JSON.stringify(
      project.auditMetadata?.inputFingerprint || { note: 'No fingerprint available.' },
      null,
      2,
    ),
    '02-decision-record.json': JSON.stringify(generateDecisionRecord(project), null, 2),
    '03-findings.csv': generateFindingsCsv(project),
    '04-model-card.md': generateModelCard(project),
    '05-known-limitations.md': generateKnownLimitations(),
    '06-architecture-decision-record.md': generateArchitectureDecisionRecord(project),
    [INPUT_MANIFEST_FILE]: generateInputManifestFile(project),
    [EVIDENCE_CHAIN_FILE]: generateEvidenceChainFile(project),
  };
  const attested: Record<string, string> = {
    [USER_ATTESTED_FILE]: generateUserAttestations(src.attested, {
      projectId: src.projectId,
      runId: src.runId,
      engineRecommendation:
        (typeof src.run.originalRecommendation === 'string' && src.run.originalRecommendation) ||
        (typeof src.run.extensibilityRoute === 'string' ? src.run.extensibilityRoute : undefined),
    }),
  };
  return { signed, attested };
}

/**
 * The handover chain's coverage rows for this pack's manifest (roadmap 8.5).
 *
 * Built from the same signed input as `09-evidence-chain.json`, so the rows the
 * signature binds and the rows the archive explains cannot say two different
 * things. Nothing the owner writes reaches it — a `covers[]` a form could move
 * would be a signed statement about the signature that the signed-over party
 * controls.
 */
export function auditPackCovers(src: AuditPackSource): CoverEntry[] {
  const project = signedGeneratorInput(src);
  return coversOf(
    buildEvidenceChain({
      projectId: src.projectId,
      runId: src.runId,
      inputManifest: project.inputManifest,
      sourceSha256: project.auditMetadata?.inputFingerprint?.sha256,
      modelParticipation: project.auditMetadata?.modelCard?.modelParticipation,
    }),
  );
}

/** The owner's statements, picked from the project document by name. */
export function attestationsOf(projectData: Record<string, unknown>): UserAttestations {
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  return {
    name: str(projectData.name),
    status: str(projectData.status),
    targetArchitecture: str(projectData.targetArchitecture),
    approvedByArchitect: projectData.approvedByArchitect === true,
    approvedBy: str(projectData.approvedBy),
    architectSignOffAt: projectData.architectSignOffAt,
    architectJustifiedOverride: str(projectData.architectJustifiedOverride),
  };
}
