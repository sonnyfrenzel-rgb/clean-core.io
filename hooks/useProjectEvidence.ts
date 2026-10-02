'use client';

import { useEffect, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import type { AbapEvidenceReport } from '@/lib/abap/evidence-model';
import type { AssessmentTarget } from '@/lib/assessment-target';
import type { ProjectEvidence } from '@/lib/project-evidence';

/**
 * The engine's evidence for a project, read from the server rather than
 * computed in the browser.
 *
 * The screens that show a project's findings — Analyze, Transformation and the
 * workspace's Public-Cloud-Fit card — used to run `buildAbapEvidence` here, in a
 * chunk of its own (external audit PERF-01), with the default catalog and the
 * file name `main.abap`. The signed run reads the catalog snapshot of the
 * project's target profile and the file name it signed, so a Private Edition
 * project could show findings its run never signed (owner decision 30.09.2026:
 * every display derived from a project reads the catalog of the project's
 * target profile). That snapshot is server-only, so the report is computed by
 * `GET /api/projects/{id}/evidence` with exactly the run's inputs, and neither
 * the engine nor any catalog is downloaded by these screens any more.
 *
 * `loading` while the answer is on its way, `failed` with the reason when it
 * could not be read — never an empty report standing in for one that was not
 * computed.
 */
export type ProjectEvidenceState =
  | { state: 'loading' }
  | { state: 'failed'; reason: string }
  | { state: 'ready'; value: ProjectEvidence };

/** The sentence for a read that failed without a reason of the server's own. */
export const EVIDENCE_UNREAD = 'The evidence for this code could not be read.';

async function readEvidence(url: string, init: RequestInit): Promise<ProjectEvidence> {
  const auth = getAuth();
  // A page opened directly may ask before the signed-in account is restored.
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('You are not signed in.');
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
  } catch {
    // The network, not the server: no sentence of its own to pass on.
    throw new Error(EVIDENCE_UNREAD);
  }
  const body = (await res.json().catch(() => null)) as (Partial<ProjectEvidence> & { error?: unknown }) | null;
  if (!res.ok || !body || !body.evidence || !Array.isArray(body.evidence.findings)) {
    throw new Error(typeof body?.error === 'string' && body.error ? body.error : EVIDENCE_UNREAD);
  }
  return body as ProjectEvidence;
}

/**
 * The evidence of a source that is about to be analysed — the run's first half,
 * read with the catalog the run will read for the same edition and declaration
 * (`POST /api/projects/{id}/evidence`). Owner only, like the run.
 */
export async function previewRunEvidence(
  projectId: string,
  input: { source: string; fileName: string; deployment: 'public' | 'private'; targetProfile: AssessmentTarget },
): Promise<AbapEvidenceReport> {
  const read = await readEvidence(`/api/projects/${encodeURIComponent(projectId)}/evidence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: input.source,
      fileName: input.fileName,
      s4Deployment: input.deployment,
      targetProfile: input.targetProfile,
    }),
  });
  return read.evidence;
}

/**
 * The evidence of the source stored on the project. `enabled` is false while
 * there is nothing to read (no project, no source), so no request is made.
 * `version` re-reads it — the active run id and the stored source, so a new run
 * is followed by the evidence it signed.
 */
export function useProjectEvidence(
  projectId: string | null | undefined,
  enabled: boolean,
  version: string,
): ProjectEvidenceState {
  const key = `${projectId ?? ''}#${version}`;
  const [read, setRead] = useState<{ key: string; value: ProjectEvidenceState } | null>(null);

  useEffect(() => {
    if (!enabled || !projectId) return undefined;
    let cancelled = false;
    readEvidence(`/api/projects/${encodeURIComponent(projectId)}/evidence`, { method: 'GET' }).then(
      (value) => {
        if (!cancelled) setRead({ key, value: { state: 'ready', value } });
      },
      (err: unknown) => {
        if (!cancelled) setRead({ key, value: { state: 'failed', reason: err instanceof Error && err.message ? err.message : EVIDENCE_UNREAD } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, enabled, key]);

  // A read made for another project or another run is not this one's.
  return read && read.key === key ? read.value : { state: 'loading' };
}
