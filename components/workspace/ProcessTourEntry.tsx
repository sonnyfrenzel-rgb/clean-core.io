'use client';

import React from 'react';
import { Footprints } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import { requestProcessWalk } from '@/lib/process-walk-request';
import { wt } from '@/lib/workspace-messages';

/**
 * The way into the guided tour on the process map (owner decision 21.10.2026),
 * at the top of the Business view. It replaced the walk-through's entry card,
 * which counted answers: the tour asks for none.
 *
 * The tour itself is opened by the map it moves (`WorkspaceProcess`), which
 * may not be loaded yet — the request is held until it is
 * (`lib/process-walk-request.ts`). Nothing opens by itself: only this button,
 * or the one in the First insights, opens it.
 */
export default function ProcessTourEntry({ projectId, onOpen }: { projectId: string; onOpen?: () => void }) {
  const open = onOpen ?? (() => requestProcessWalk(projectId));
  return (
    <section
      data-tour-entry=""
      aria-labelledby="workspace-tour-entry-title"
      className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3"
    >
      <span aria-hidden={true} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cc-surface-muted text-cc-ink">
        <Footprints size={20} />
      </span>
      <div className="min-w-0 flex-1 basis-72">
        <h2 id="workspace-tour-entry-title" className="m-0 text-[15px] leading-snug font-bold text-cc-ink">
          {wt('walk.title')}
        </h2>
        <p className="m-0 mt-1 text-[13px] leading-snug font-medium text-cc-ink-muted">{wt('walk.entryLead')}</p>
      </div>
      <span className="cc-no-print">
        <CcButton variant="secondary" icon={<Footprints size={16} aria-hidden={true} />} onClick={open} data-tour-entry-open="">
          {wt('walk.entryOpen')}
        </CcButton>
      </span>
    </section>
  );
}
