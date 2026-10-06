'use client';

import React, { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BACK_LINK_CLASS } from '@/components/BackLink';
import { stageBackLink } from '@/lib/workspace-back-href';
import { useShellProjectName } from '@/lib/shell-context';
import StageBackText from '@/components/StageBackText';

const noSubscription = () => () => {};
const readSearch = () => window.location.search;
const serverSearch = () => '';

/**
 * The end of a stage page: the way back to the workspace, at the end of a long
 * page as at its top, to the same view and layer.
 *
 * A stage is a tool of the workspace, and a tool has no "proceed": the next
 * step is the workspace's to say, once, from its rules (roadmap 6.5), not a
 * position in a list of seven (ADR-018 — the toolbar "is not a progress
 * indicator"). Until roadmap 3.0.1 an account without the workspace still got
 * the old back-and-onward button pair here; since then every account has the
 * workspace (ADR-061) and the pair is gone. Nothing was lost by it: no
 * stage's forward button did anything but navigate, and the gates it showed —
 * "Confirm architecture to proceed" — are the stage's own controls above it.
 */
export default function StageFooter() {
  const params = useParams();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : '';
  const search = useSyncExternalStore(noSubscription, readSearch, serverSearch);

  // The name the stage's own read announced to the shell bar (`lib/shell-context.ts`).
  const projectName = useShellProjectName(projectId || null);

  const back = stageBackLink({ projectId, search });
  if (back.kind !== 'link') return null;
  return (
    <div data-stage-footer="" className="cc-no-print mt-10 border-t border-cc-line pt-4">
      <Link href={back.href} className={`${BACK_LINK_CLASS} flex-wrap`}>
        <StageBackText projectName={projectName} search={search} />
      </Link>
    </div>
  );
}
