'use client';

import React, { useMemo } from 'react';
import { Play, Plus } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcLinkButton from '@/components/cc/LinkButton';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { t } from '@/lib/cc-messages';
import { NEXT_STEP_PROVENANCE } from '@/lib/next-step';
import type { YourTurnItem } from '@/lib/your-turn';
import { openStageLabel, wt, yourTurnCountLabel } from '@/lib/workspace-messages';

/**
 * "Your turn" — mockup s7, `DESIGN.md` §6.1.2 and §6.2 item 3.
 *
 * Two shapes, and the second is what the card is for once there is work:
 *
 *   - **No project of your own yet** — the mockup's card, word for word: start
 *     with an example (free) or your own code, one primary action.
 *   - **Projects of your own** — what is waiting for *you*: the next open step
 *     of each of your projects, from the same rule-based `nextOpenPoint` the
 *     workspace's "Next step" card reads (no model call, never a step invented
 *     to fill the card). At most three, the ones that moved most recently
 *     first, and a project whose result no longer matches its source before
 *     those — that one is the most urgent thing on the page. A shared project
 *     never appears: its reader can act on nothing in it.
 */
const SHOWN = 3;

export { yourTurnItems } from '@/lib/your-turn';

export default function YourTurnCard({
  hasOwnProjects,
  items,
  onNewProject,
}: {
  hasOwnProjects: boolean;
  items: readonly YourTurnItem[];
  onNewProject: () => void;
}) {
  const shown = useMemo(() => items.slice(0, SHOWN), [items]);

  if (!hasOwnProjects) {
    return (
      <CcCard density="cozy">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-cc-ink-muted">
            <Play size={20} aria-hidden={true} />
          </span>
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="m-0 text-[15px] font-bold text-cc-ink" data-workspace-your-turn="">
              {t('workspace.yourTurn')}
            </h2>
            <p className="mt-1 mb-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
              {t('workspace.yourTurnBody')}
            </p>
          </div>
          <CcButton
            variant="primary"
            icon={<Plus size={16} aria-hidden={true} />}
            onClick={onNewProject}
            data-workspace-new-project=""
          >
            {t('workspace.newProject')}
          </CcButton>
        </div>
      </CcCard>
    );
  }

  return (
    <CcCard density="cozy">
      <div className="flex flex-wrap items-start gap-4" data-workspace-your-turn-list="">
        <span className="mt-1 text-cc-ink-muted">
          <Play size={20} aria-hidden={true} />
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-[15px] font-bold text-cc-ink" data-workspace-your-turn="">
              {t('workspace.yourTurn')}
            </h2>
            <CcProvenanceChip value={NEXT_STEP_PROVENANCE} />
          </div>
          <p className="mt-1 mb-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
            {items.length > 0 ? `${yourTurnCountLabel(items.length)}. ${wt('myWorkspace.yourTurnIntro')}` : wt('myWorkspace.yourTurnNothing')}
          </p>
          {shown.length > 0 ? (
            <ul className="mt-3 mb-0 flex list-none flex-col gap-2 p-0">
              {shown.map(({ row, point }) => (
                <li
                  key={row.id}
                  data-your-turn-item={row.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2"
                >
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block text-[13px] font-semibold text-cc-ink">{row.name}</span>
                    <span className="block text-[12px] leading-snug font-medium text-cc-ink-muted">
                      {point.label} — {point.reason}
                    </span>
                  </span>
                  <CcLinkButton href={`/project/${row.id}/${point.path}`} data-your-turn-open={row.id}>
                    {openStageLabel(point.label)}
                  </CcLinkButton>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {/* "New project" stands in the toolbar of the project list once there
            are projects (mockup s7) — one primary per region, not two. */}
      </div>
    </CcCard>
  );
}
