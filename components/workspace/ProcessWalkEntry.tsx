'use client';

import React from 'react';
import { ArrowDown, Footprints } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import { PROCESS_WALK_ID, requestProcessWalk } from '@/lib/process-walk-request';
import { walkAnsweredSoFar, wt } from '@/lib/workspace-messages';

/**
 * The way into the walk-through, at the top of the Business view — roadmap
 * "3.0.20 — with it", part (1). The owner's report of 21.10.2026: the walk sat
 * under the first look and the map, below the fold of the first screen, where
 * a business reader did not find it. The walk itself stays with the map it
 * selects steps on (`WorkspaceProcess`); this card stands right under "Your
 * next step", says what the walk gives, and opens it where the reader left off.
 *
 * Says nothing it cannot know here: how many steps were answered comes from
 * the answers on record; how many there are is counted by the walk.
 */
export default function ProcessWalkEntry({ projectId, answered }: { projectId: string; answered: number }) {
  const open = () => {
    requestProcessWalk(projectId);
    document.getElementById(PROCESS_WALK_ID)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  return (
    <section
      data-workspace-walk-entry=""
      aria-labelledby="workspace-walk-entry-title"
      className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3"
    >
      <span aria-hidden={true} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cc-surface-muted text-cc-ink">
        <Footprints size={20} />
      </span>
      <div className="min-w-0 flex-1 basis-72">
        <p className="m-0 text-[12px] font-semibold tracking-[0.04em] text-cc-ink-muted uppercase">{wt('walk.eyebrow')}</p>
        <h2 id="workspace-walk-entry-title" className="m-0 mt-1 text-[15px] leading-snug font-bold text-cc-ink">
          {wt('walk.title')}
        </h2>
        <p className="m-0 mt-1 text-[13px] leading-snug font-medium text-cc-ink-muted">
          {wt('walk.entryLead')}
          {answered > 0 ? (
            <>
              {' '}
              <span data-workspace-walk-entry-answered={answered} className="font-semibold text-cc-ink">
                {walkAnsweredSoFar(answered)}
              </span>
            </>
          ) : null}
        </p>
      </div>
      <span className="cc-no-print">
        <CcButton variant="secondary" onClick={open} data-workspace-walk-entry-open="">
          {wt('walk.entryOpen')}
          <ArrowDown size={16} aria-hidden={true} />
        </CcButton>
      </span>
    </section>
  );
}
