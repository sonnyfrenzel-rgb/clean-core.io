'use client';

import { useMemo } from 'react';
import { useProjectEvidence } from '@/hooks/useProjectEvidence';
import { keyUserGateOpen, keyUserModeOf, keyUserStepsOf, type KeyUserMode } from '@/lib/key-user-route';
import type { KeyUserStepList } from '@/lib/key-user-steps';
import type { KeyUserReading } from '@/lib/abap/key-user-candidates';

/**
 * The engine's key-user step list for a stage that does not read the evidence
 * itself — Testing, Economics, Design (roadmap 3.0.19). Read from
 * `GET /api/projects/{id}/evidence`, the same report Analyze and
 * Transformation show, and only where the signed run's engine names key-user
 * candidates (`keyUserGateOpen`): a project analysed by an older engine makes
 * no request and sees no change.
 */
export type KeyUserStepsState =
  | { state: 'off' }
  | { state: 'loading' }
  | { state: 'failed'; reason: string }
  | { state: 'ready'; list: KeyUserStepList | null; mode: KeyUserMode; /** The engine's reading the list is built from (the Design prompt's facts). */ reading: KeyUserReading | null };

type ProjectLike = {
  legacyCode?: unknown;
  activeRunId?: unknown;
  targetArchitecture?: unknown;
  approvedByArchitect?: unknown;
  analyzerVersion?: unknown;
  auditMetadata?: unknown;
} | null | undefined;

export function useKeyUserSteps(projectId: string | null | undefined, project: ProjectLike): KeyUserStepsState {
  const enabled = !!project && typeof project.legacyCode === 'string' && project.legacyCode.trim() !== '' && keyUserGateOpen(project);
  const evidence = useProjectEvidence(projectId, enabled, typeof project?.activeRunId === 'string' ? project.activeRunId : '');
  return useMemo<KeyUserStepsState>(() => {
    if (!enabled) return { state: 'off' };
    if (evidence.state === 'loading') return { state: 'loading' };
    if (evidence.state === 'failed') return { state: 'failed', reason: evidence.reason };
    const list = keyUserStepsOf(evidence.value.evidence, project);
    return { state: 'ready', list, mode: keyUserModeOf(project, list), reading: list ? evidence.value.evidence.keyUser ?? null : null };
  }, [enabled, evidence, project]);
}
