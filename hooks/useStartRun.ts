'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import { declaredTargetOf } from '@/lib/assessment-target';
import { signEngineRun } from '@/lib/engine-run';
import { ownCodeFileName } from '@/lib/own-code-handoff';
import { sourceFileName } from '@/lib/source-file-name';
import type { Project } from '@/lib/types';

/**
 * The signed engine-only run a new project starts with (ADR-066), and the
 * same run started by hand where a project has source and no run yet.
 *
 * Phases, each a fact about this project and this page:
 *
 *   - `none`    — nothing to start: no source, a run already on record, or the
 *                 reader is not the owner (only the owner can sign a run; the
 *                 route refuses everyone else, so the page does not offer it);
 *   - `ready`   — the owner can start it;
 *   - `running` — the request is with the server;
 *   - `signed`  — signed in this page view, and the project has been read
 *                 again, so the map draws from the run;
 *   - `failed`  — the route refused or the request failed, with its sentence.
 *
 * **At most one start per project and page view.** The automatic start is
 * asked for by the first look (`?first=1`, first visit), and React may mount
 * twice in development; a second request would be a second run — for a
 * shipped example after its free first one, a charged run. The guard is a
 * module set, so a remount cannot start another; a reload is a new page and
 * the first look is then marked seen, so it does not start automatically
 * again (the page offers the manual start instead).
 */

export type StartRunPhase = 'none' | 'ready' | 'running' | 'signed' | 'failed';

export interface StartRun {
  phase: StartRunPhase;
  /** The route's own sentence when it failed. */
  message: string | null;
  /** The edition the run is (or would be) assessed against. */
  deployment: 'public' | 'private';
  start: () => void;
}

const started = new Set<string>();

/** The file name the run records: the run's or example's file, the upload's, or one made from the project name. */
function runFileName(project: Project, projectId: string): string {
  const known = sourceFileName(project) ?? ownCodeFileName(projectId);
  if (known) return known;
  const name = typeof project.name === 'string' ? project.name.trim() : '';
  return /^[A-Za-z0-9_/-]{1,60}$/.test(name) ? `${name}.abap` : 'main.abap';
}

export function useStartRun({
  project,
  projectId,
  auto,
  onSigned,
}: {
  project: Project | null;
  projectId: string;
  /** Start without a click — the first look of a new project. */
  auto: boolean;
  /** Read the project again; resolves once the page holds the signed state. */
  onSigned: () => Promise<void>;
}): StartRun {
  const [phase, setPhase] = useState<'idle' | 'running' | 'signed' | 'failed'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const onSignedRef = useRef(onSigned);
  useEffect(() => {
    onSignedRef.current = onSigned;
  }, [onSigned]);

  const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  const hasRun = typeof project?.activeRunId === 'string' && project.activeRunId.trim().length > 0;
  const uid = typeof window === 'undefined' ? null : (getAuth().currentUser?.uid ?? null);
  const owner = !!project && !!uid && project.userId === uid;
  const deployment: 'public' | 'private' = project?.s4Deployment === 'public' ? 'public' : 'private';
  const startable = !!project && owner && source.trim().length > 0 && !hasRun;

  const start = useCallback(() => {
    if (!project || !startable || started.has(projectId)) return;
    started.add(projectId);
    setPhase('running');
    setMessage(null);
    void (async () => {
      try {
        await signEngineRun({
          projectId,
          fileName: runFileName(project, projectId),
          deployment,
          targetProfile: declaredTargetOf(project),
        });
        await onSignedRef.current();
        setPhase('signed');
      } catch (err) {
        // A failed start may be tried again by hand.
        started.delete(projectId);
        setMessage(err instanceof Error && err.message ? err.message : 'The run could not be signed.');
        setPhase('failed');
      }
    })();
  }, [project, projectId, startable, deployment]);

  useEffect(() => {
    if (auto && startable && phase === 'idle') start();
  }, [auto, startable, phase, start]);

  const visible: StartRunPhase =
    phase === 'running' || phase === 'failed' || phase === 'signed' ? phase : startable ? 'ready' : 'none';
  return { phase: visible, message, deployment, start };
}
