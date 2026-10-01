import { sha256Hex } from '@/lib/artefact-digest';
import type { SignedSource } from '@/hooks/useProcessMap';
import type { Project } from '@/lib/types';

/**
 * The source the active run signed, and nothing else — the input of every
 * process map (roadmap 2.5, 2.6).
 *
 * The run does not store the source; it stores the SHA-256 of it inside the
 * signature. So the source on the project counts only while it still hashes to
 * that digest — the comparison the Documentation stage makes before it draws
 * its map, written once here so the workspace draws from exactly the same
 * bytes. A map drawn from source the run never saw would carry line anchors
 * that point at other lines, which is worse than no map.
 */
export function signedSourceOf(project: Project | null): SignedSource | null {
  const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  if (!project?.activeRunId || !source.trim()) return null;
  const signed =
    (project as { inputFingerprint?: { sha256?: string; fileName?: string } }).inputFingerprint ??
    project.auditMetadata?.inputFingerprint;
  if (!signed?.sha256 || sha256Hex(source) !== signed.sha256) return null;
  return { source, fileName: signed.fileName || 'source.abap' };
}

/**
 * Why there is no signed source, in the three cases a reader can be in.
 * `null` when there is one.
 */
export type SignedSourceAbsence = 'no-source' | 'no-run' | 'changed';

export function signedSourceAbsence(project: Project | null): SignedSourceAbsence | null {
  const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  if (!source.trim()) return 'no-source';
  if (!project?.activeRunId) return 'no-run';
  return signedSourceOf(project) ? null : 'changed';
}
