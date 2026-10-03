'use client';

import React from 'react';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcLinkButton from '@/components/cc/LinkButton';
import { useUserProfile } from '@/hooks/useUserProfile';
import { describeRunCost } from '@/lib/run-cost';
import { START_NARRATIVE_CEILING_MS } from '@/lib/engine-run';
import { startNarrativeMissingReason, type StartNarrativeMissing as Missing } from '@/lib/start-narrative';
import { STARTER_EXAMPLES } from '@/lib/starter-examples';
import { stageHref, WORKSPACE_RETURN } from '@/lib/workspace-back-href';
import { wt, bizNarrativeLaterCost } from '@/lib/workspace-messages';
import type { Project } from '@/lib/types';

/**
 * Said once a start that asked the model signed without the narrative (owner
 * decision 03.10.2026, ADR-072): why, and the one action that writes it later,
 * with what that costs — before the click, as every start screen says it.
 *
 * Writing it later is a second analysis of the same source, in Analyze, with
 * the model: by the rules `/api/runs/create` always applied, free for code of
 * one's own (the same source again), one analysis run for a shipped example
 * (its free first run is the start that just signed), and nothing counted on
 * an account that brings its own key. The start itself never signs a second
 * run.
 */
export default function StartNarrativeMissing({
  project,
  projectId,
  view,
  missing,
}: {
  project: Project | null;
  projectId: string;
  view: string;
  missing: Missing;
}) {
  const { profile } = useUserProfile();
  const exampleName =
    project?.fromExample === true && STARTER_EXAMPLES.some((e) => e.name === project?.name) ? project?.name : undefined;
  // The example's free first run is the one the start just signed, whether or
  // not the profile on screen has caught up with it yet.
  const subject =
    exampleName && profile
      ? { ...profile, starterExamplesUsed: { ...(profile.starterExamplesUsed ?? {}), [exampleName]: true } }
      : profile;
  const cost = describeRunCost({
    profile: subject,
    metered: true,
    callsModel: true,
    sameSourceAgain: !exampleName,
    starterExample: exampleName,
  });
  const href = stageHref({ base: `/project/${projectId}`, path: 'analyze', view, from: WORKSPACE_RETURN.tools });
  return (
    <div data-start-narrative="missing" data-missing={missing} className="mb-4">
      <CcMessageStrip
        state="warning"
        headline={wt('biz.narrativeMissingTitle')}
        actions={
          <CcLinkButton href={href} variant="secondary" density="cozy" data-start-narrative-later="">
            {wt('biz.narrativeWriteLater')}
          </CcLinkButton>
        }
      >
        {startNarrativeMissingReason(missing, START_NARRATIVE_CEILING_MS)}{' '}
        <span data-start-narrative-later-cost="">{bizNarrativeLaterCost(cost.quota)}</span>
      </CcMessageStrip>
    </div>
  );
}
