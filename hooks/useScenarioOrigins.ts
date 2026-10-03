'use client';

import { useEffect, useMemo, useState } from 'react';
import { sha256Hex } from '@/lib/artefact-digest';
import { signedSourceAbsence, signedSourceOf } from '@/lib/signed-source';
import { findingObjects, type OriginEngine, type OriginFindingInput } from '@/lib/scenario-origin';
import type { Project } from '@/lib/types';
import type { ProjectEvidenceState } from '@/hooks/useProjectEvidence';

/**
 * The engine a test scenario's origin is checked against — the business rules,
 * decision points and steps of the source the active run signed, and the
 * findings the server read with the run's catalog.
 *
 * Derived, never stored: the same source gives the same objects, so the check
 * runs again on every display (`readScenarioOrigin`), and a result stored at
 * generation is never what decides once the source can be read.
 */

/** The signed source and its digest, or why there is none — in words a reader can act on. */
export interface SignedForOrigin {
  signed: { source: string; sha256: string } | null;
  /** Why the origin cannot be checked. Empty when there is a signed source. */
  reason: string;
}

export function signedForOrigin(project: Project | null): SignedForOrigin {
  const signed = signedSourceOf(project);
  if (signed) return { signed: { source: signed.source, sha256: sha256Hex(signed.source) }, reason: '' };
  switch (signedSourceAbsence(project)) {
    case 'no-source':
      return { signed: null, reason: 'No source is stored on this project, so the origin of a scenario cannot be checked.' };
    case 'no-run':
      return { signed: null, reason: 'No signed run exists for this source yet, so the origin of a scenario cannot be checked.' };
    default:
      return {
        signed: null,
        reason: 'The source has changed since the signed run, so the origin of a scenario is not checked until the source is analysed again.',
      };
  }
}

/** The findings of the evidence answer, when it was computed from exactly the signed source. */
export function findingsForOrigin(evidence: ProjectEvidenceState, sha256: string | null): OriginFindingInput[] | null {
  if (!sha256 || evidence.state !== 'ready' || evidence.value.sourceSha256 !== sha256) return null;
  return evidence.value.evidence.findings.map((f) => ({ id: f.id, title: f.title, lineStart: f.lineStart, lineEnd: f.lineEnd }));
}

/** Build the engine for a signed source — for the generation, which stores the check beside each scenario. */
export async function originEngineFor(
  signed: { source: string } | null,
  findings: OriginFindingInput[] | null,
): Promise<OriginEngine | null> {
  if (!signed) return null;
  const { buildOriginEngine } = await import('@/lib/scenario-origin-engine');
  return buildOriginEngine(signed.source, findings);
}

export interface ScenarioOriginEngineState {
  engine: OriginEngine | null;
  /** The digest of the signed source, or null when there is none. */
  signedSha256: string | null;
  /** Why there is no engine. Empty when there is one. */
  reason: string;
}

export const ORIGIN_LOADING = 'The origin is being checked against the signed source.';
export const ORIGIN_FAILED = 'The engine could not read the signed source, so the origin of a scenario is not checked.';

export function useScenarioOriginEngine(
  project: Project | null,
  findings: OriginFindingInput[] | null,
): ScenarioOriginEngineState {
  const { signed, reason } = useMemo(() => signedForOrigin(project), [project]);
  const sha = signed?.sha256 ?? null;
  const [built, setBuilt] = useState<{ sha: string; base: OriginEngine | null; failed: boolean } | null>(null);

  const source = signed?.source ?? null;
  useEffect(() => {
    if (source === null || sha === null) return undefined;
    let cancelled = false;
    // Findings are attached below, so a late evidence answer does not rebuild the rules.
    originEngineFor({ source }, null).then(
      (engine) => {
        if (!cancelled) setBuilt({ sha, base: engine, failed: false });
      },
      (err: unknown) => {
        console.error('The origin check could not read the signed source:', err);
        if (!cancelled) setBuilt({ sha, base: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [source, sha]);

  return useMemo(() => {
    if (sha === null) return { engine: null, signedSha256: null, reason };
    if (!built || built.sha !== sha) return { engine: null, signedSha256: sha, reason: ORIGIN_LOADING };
    if (built.failed || !built.base) return { engine: null, signedSha256: sha, reason: ORIGIN_FAILED };
    return {
      engine: {
        ...built.base,
        findings: findings ? findingObjects(findings) : null,
      },
      signedSha256: sha,
      reason: '',
    };
  }, [sha, built, findings, reason]);
}
