'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import { declaredTargetOf } from '@/lib/assessment-target';
import { signEngineRun, START_NARRATIVE_CEILING_MS } from '@/lib/engine-run';
import { missingFrom, writeStartNarrative, type StartNarrative, type StartNarrativeMissing } from '@/lib/start-narrative';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { ownCodeFileName } from '@/lib/own-code-handoff';
import { sourceFileName } from '@/lib/source-file-name';
import type { Project } from '@/lib/types';

/**
 * The signed engine-only run a new project starts with (ADR-072), and the
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
 *
 * **With the model on** (owner decision 03.10.2026): when the account's
 * analysis stage is on and a key is available, the start first asks the model
 * for the narrative — the same analysis Analyze runs (`lib/start-narrative.ts`)
 * — while the first look builds up, and signs that one run with it. The wait
 * ends at `START_NARRATIVE_CEILING_MS`, on a refusal or failure of the call, or
 * when the reader goes on without it (`continueWithout`); the run is then
 * signed with the engine's reading alone and `narrativeMissing` says why. Each
 * start sends exactly one request to `/api/runs/create`. Model off, or no key:
 * the engine-only run, as before, with no model call.
 */

export type StartRunPhase = 'none' | 'ready' | 'running' | 'signed' | 'failed';

export interface StartRun {
  phase: StartRunPhase;
  /** The route's own sentence when it failed. */
  message: string | null;
  /** The edition the run is (or would be) assessed against. */
  deployment: 'public' | 'private';
  start: () => void;
  /**
   * Whether this start asks the model for the narrative — the account's
   * analysis stage and a key, as `/api/model-stages` answers. What the start
   * screens say before the click reads the same answer.
   */
  callsModel: boolean;
  /** While running: the narrative is being written, or the run is being signed. */
  step: 'narrative' | 'signing' | null;
  /** `Date.now()` when the wait for the narrative began; null when there is none. */
  narrativeSince: number | null;
  /** Stop waiting for the model and sign the engine's reading now. Does nothing once signing has begun. */
  continueWithout: () => void;
  /** Set once a start that asked the model signed without the narrative: why. */
  narrativeMissing: StartNarrativeMissing | null;
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
  const [step, setStep] = useState<'narrative' | 'signing' | null>(null);
  const [narrativeSince, setNarrativeSince] = useState<number | null>(null);
  const [narrativeMissing, setNarrativeMissing] = useState<StartNarrativeMissing | null>(null);
  /** The wait for the narrative in flight, and why it was ended, if it was. */
  const waitRef = useRef<{ controller: AbortController; ended: 'timeout' | 'continued' | null } | null>(null);
  const model = useModelAvailability();
  // The same answer the start screens read. Optimistic while it is unknown, as
  // everywhere: the proxy decides every call, and a refusal ends in the
  // engine-only run with its reason.
  const callsModel = model.enabled('analyze');
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
    setNarrativeMissing(null);
    const fileName = runFileName(project, projectId);
    const targetProfile = declaredTargetOf(project);
    void (async () => {
      try {
        // 1. The narrative, when the model is on — bounded, and never the
        //    reason a run is not signed.
        let narrative: StartNarrative | null = null;
        let missing: StartNarrativeMissing | null = null;
        if (callsModel) {
          const controller = new AbortController();
          const wait: { controller: AbortController; ended: 'timeout' | 'continued' | null } = { controller, ended: null };
          waitRef.current = wait;
          const ceiling = setTimeout(() => {
            wait.ended = 'timeout';
            controller.abort();
          }, START_NARRATIVE_CEILING_MS);
          setStep('narrative');
          setNarrativeSince(Date.now());
          try {
            // Raced against the abort: a request the browser does not cancel
            // (the evidence read) must not hold the start past the ceiling.
            narrative = await Promise.race([
              writeStartNarrative({ projectId, source, fileName, deployment, targetProfile, signal: controller.signal }),
              new Promise<never>((_, reject) => {
                controller.signal.addEventListener('abort', () => reject(new DOMException('ended', 'AbortError')), { once: true });
              }),
            ]);
          } catch (err) {
            narrative = null;
            missing = missingFrom(err, wait.ended);
          } finally {
            clearTimeout(ceiling);
            waitRef.current = null;
          }
        }
        // 2. The one signed run: with the narrative, or the engine's reading alone.
        setStep('signing');
        await signEngineRun({ projectId, fileName, deployment, targetProfile, narrative });
        setNarrativeMissing(missing);
        await onSignedRef.current();
        // The project now carries its run, so `startable` holds the next click
        // back; the module guard would only make a later start, in the same
        // page view, do nothing without a word (QA c52492a3ee43).
        started.delete(projectId);
        setPhase('signed');
      } catch (err) {
        // A failed start may be tried again by hand.
        started.delete(projectId);
        setMessage(err instanceof Error && err.message ? err.message : 'The run could not be signed.');
        setPhase('failed');
      } finally {
        setStep(null);
        setNarrativeSince(null);
      }
    })();
  }, [project, projectId, startable, deployment, source, callsModel]);

  const continueWithout = useCallback(() => {
    const wait = waitRef.current;
    if (!wait || wait.controller.signal.aborted) return;
    wait.ended = 'continued';
    wait.controller.abort();
  }, []);

  // The automatic start waits for the account's model answer, so a start with
  // the model off never asks it, and one with the model on asks it from the
  // first moment of the build-up.
  useEffect(() => {
    if (auto && startable && phase === 'idle' && !model.loading) start();
  }, [auto, startable, phase, start, model.loading]);

  const visible: StartRunPhase =
    phase === 'running' || phase === 'failed' || phase === 'signed' ? phase : startable ? 'ready' : 'none';
  return {
    phase: visible,
    message,
    deployment,
    start,
    callsModel,
    step: phase === 'running' ? step : null,
    narrativeSince: phase === 'running' && step === 'narrative' ? narrativeSince : null,
    continueWithout,
    narrativeMissing: phase === 'signed' ? narrativeMissing : null,
  };
}
