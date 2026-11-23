'use client';

import React, { useEffect, useRef } from 'react';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import { VIEW_LABELS, WORKSPACE_VIEWS } from '@/lib/workspace-model';
import { stageViewOf, switchStageView } from '@/lib/location-search';
import { wt } from '@/lib/workspace-messages';
import type { WorkspaceView } from '@/lib/workspace-model';

/**
 * A switch made from the switch itself (arrow keys, or a click on a segment) hands the focus on to the switch of the
 * view it opened. Analyze draws its Management view as a page of its own, so the switch there is a new element and the
 * focus would otherwise fall back to the page: a keyboard reader pressing the arrow again would move nothing. Held for a
 * minute at most (a slow line may take that long to draw the next view), so a switch that never appears does not take
 * the focus later.
 */
let focusHandOff: { view: WorkspaceView; at: number } | null = null;
const HAND_OFF_MS = 60_000;

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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handOff = focusHandOff;
    if (!handOff || handOff.view !== view) return;
    focusHandOff = null;
    if (Date.now() - handOff.at > HAND_OFF_MS) return;
    const box = ref.current;
    if (!box || box.contains(document.activeElement)) return;
    box.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus({ preventScroll: true });
  }, [view]);
  const onChange = (next: WorkspaceView) => {
    focusHandOff = ref.current?.contains(document.activeElement) ? { view: next, at: Date.now() } : null;
    switchStageView(next);
  };
  return (
    <div ref={ref} data-stage-view-switch={view} className="cc-no-print shrink-0 max-[600px]:w-full">
      <CcSegmentedControl
        stretch
        label={wt('page.view')}
        value={view}
        onChange={onChange}
        segments={WORKSPACE_VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] }))}
      />
    </div>
  );
}
