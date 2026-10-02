import { sha256Hex } from '@/lib/artefact-digest';
import { buildAbapEvidence } from '@/lib/abap/evidence-model';
import { catalogSnapshotRefFor, catalogSnapshotRefForProject } from '@/lib/abap/catalog-snapshots';
import { declaredTargetOf } from '@/lib/assessment-target';
import type { ProjectEvidence } from '@/lib/project-evidence';

/**
 * The engine's evidence report for a project, as the signed run computes it —
 * the builder behind `app/api/projects/[projectId]/evidence/route.ts`.
 *
 * **Server-only.** It reads the catalog snapshot of the project's target
 * profile, and the Private Edition snapshots exist only on the server
 * (`lib/abap/catalog-snapshots.ts`). Its own module rather than code in the
 * route so a spec can hold its answer against the core result without
 * importing a route handler and the Admin SDK with it
 * (`tests/pce-derived-displays.spec.ts`).
 *
 * **One engine, not a second opinion.** `buildAbapEvidence` with the file name
 * and the snapshot the run reads; nothing is added, nothing is judged.
 */

/** `public` or `private` as the run route reads the edition: anything else, and nothing, is Public. */
function editionOf(value: unknown): 'public' | 'private' {
  return value === 'private' ? 'private' : 'public';
}

/**
 * The file name the run signed (`auditMetadata.inputFingerprint.fileName`), the
 * one `GET /findings` reads as well; `main.abap` for a project that never had a
 * run to record one.
 */
export function projectEvidenceFileName(project: Record<string, unknown>): string {
  const fingerprint = (project.auditMetadata as { inputFingerprint?: { fileName?: unknown } } | undefined)?.inputFingerprint;
  return typeof fingerprint?.fileName === 'string' && fingerprint.fileName.trim() ? fingerprint.fileName : 'main.abap';
}

/**
 * The evidence of the source stored on the project, read from the snapshot of
 * the project's current target profile (`catalogSnapshotRefForProject`) — the
 * snapshot the signed run read, and the one `GET /findings` reads.
 */
export function buildProjectEvidence(project: Record<string, unknown>, source: string): ProjectEvidence {
  const catalog = catalogSnapshotRefForProject(project);
  const fileName = projectEvidenceFileName(project);
  const deployment = editionOf(project.s4Deployment);
  return {
    evidence: buildAbapEvidence(source, fileName, deployment, catalog.registryKey),
    sourceSha256: sha256Hex(source),
    catalog,
    fileName,
    deployment,
  };
}

/**
 * The evidence of a source about to be analysed, read exactly as
 * `/api/runs/create` reads it for the same request: the edition sent, the
 * release declared with the run (else the project's), the snapshot
 * `catalogSnapshotRefFor` names for the two, and the run's own fallback file
 * name. What the run then signs is what this answered.
 */
export function buildRunEvidence(
  project: Record<string, unknown>,
  input: { source: string; fileName: string; deployment: 'public' | 'private'; release?: string },
): ProjectEvidence {
  const release = input.release ?? declaredTargetOf(project).release;
  const catalog = catalogSnapshotRefFor(input.deployment, release);
  const fileName = input.fileName || 'unknown_file.abap';
  return {
    evidence: buildAbapEvidence(input.source, fileName, input.deployment, catalog.registryKey),
    sourceSha256: sha256Hex(input.source),
    catalog,
    fileName,
    deployment: input.deployment,
  };
}
