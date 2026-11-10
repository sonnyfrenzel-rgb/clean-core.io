'use client';

import React from 'react';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import { VIEW_LABELS, WORKSPACE_VIEWS } from '@/lib/workspace-model';
import { stageViewOf, switchStageView } from '@/lib/location-search';
import { wt } from '@/lib/workspace-messages';

/**
 * The view a tool is read in, and the switch to the other two — top right of
 * every tool's header (owner decision 22.10.2026, roadmap 3.0.21). Until then
 * the view was a few words at the end of the way back ("· Business view"),
 * easy to miss and with no way to change it short of going back.
 *
 * The same segmented control as the workspace's own view switch (`DESIGN.md`
 * §1.5): "Business | IT | Management", the active one in ink. One click
 * changes the view and stays on the same tool, every other parameter of the
 * address kept (`switchStageView`). A view is a view only — it lives in the
 * address and nowhere else, never on an artefact, a run or a signature.
 *
 * On a phone the three segments share the row under the way back (`stretch`).
 */
export default function StageViewSwitch({ search }: { search: string }) {
  const view = stageViewOf(search);
  return (
    <div data-stage-view-switch={view} className="cc-no-print mb-3 shrink-0 max-[600px]:w-full">
      <CcSegmentedControl
        stretch
        label={wt('page.view')}
        value={view}
        onChange={switchStageView}
        segments={WORKSPACE_VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] }))}
      />
    </div>
  );
}
