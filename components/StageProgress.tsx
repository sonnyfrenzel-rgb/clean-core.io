'use client';

import React from 'react';
import Stepper from '@/components/Stepper';
import VerificationRail from '@/components/VerificationRail';
import { useUserProfile } from '@/hooks/useUserProfile';
import { workspaceShellEnabled } from '@/lib/workspace-shell';
import type { PhaseKey, RailStep } from '@/lib/workflow-steps';

/**
 * The seven-circle stepper and the rail beside it — for an account that has no
 * workspace yet, and for nobody else.
 *
 * In the workspace a stage is a **tool** (ADR-008, ADR-050, mockup s8): it is
 * opened from the toolbar and left by "Back to workspace", and how far each
 * phase has got is said once, in the workspace's status line and its "Next
 * step" card. A second progress bar above every tool is the linear flow the
 * tool model replaced, and the old one painted the same phases a second time
 * in its own colours (audit 01.10.2026, row 7).
 *
 * Until the workspace is on for every account (roadmap 3.0.1) the dashboard is
 * the only way between stages for everyone else, so for them nothing changes:
 * the stepper and its rail stay, together, exactly as before. While the profile
 * is read neither is drawn — a stepper that appears and then vanishes for a
 * workspace account is worse than one that appears a moment late.
 *
 * Both still read `workflowSteps` — `lib/workflow-steps.ts` stays the one
 * phase contract; this component decides only *whether* they are drawn.
 */
export default function StageProgress({
  steps,
  current,
  projectId,
}: {
  steps: RailStep[];
  current: PhaseKey;
  projectId: string;
}) {
  const { profile, loading } = useUserProfile();
  if (loading || workspaceShellEnabled(profile)) return null;
  return (
    <>
      <VerificationRail steps={steps} current={current} projectId={projectId} />
      <Stepper steps={steps} current={current} projectId={projectId} />
    </>
  );
}
