'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { BACK_LINK_CLASS } from '@/components/BackLink';
import { familyBackLink } from '@/lib/workspace-back-href';
import { useShellProjectName } from '@/lib/shell-context';
import { familyTitleOf } from '@/lib/family-title';
import { useLocationSearch } from '@/lib/location-search';

/**
 * The end of a tool page: the family's one way back (`familyBackLink`, ADR-140), at the end of a long page as at its
 * top — the same place and the same program title as the header's (`StageHeader`), so the two never disagree.
 *
 * A tool has no "proceed" here: the next step is said once, by the page's answer card or by Re-design, not by a
 * position in a list of seven (ADR-018 — the tool bar "is not a progress indicator"). `toMyWorkspace` is the header's
 * `backToMyWorkspace`: the project's entry (Analyze) leads back to My workspace.
 */
export default function StageFooter({ toMyWorkspace = false }: { toMyWorkspace?: boolean } = {}) {
  const params = useParams();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : '';
  const search = useLocationSearch();

  // The name the stage's own read announced to the shell bar (`lib/shell-context.ts`), as the header's title reads it.
  const projectName = useShellProjectName(projectId || null);
  const title = familyTitleOf(projectName ? { name: projectName } : null)?.title ?? null;

  const way = familyBackLink({ projectId, search, toMyWorkspace });
  if (way.kind !== 'link') return null;
  return (
    <div data-stage-footer="" className="cc-no-print mt-10 border-t border-cc-line pt-4">
      <Link href={way.href} data-stage-back={way.to} className={`${BACK_LINK_CLASS} min-w-0 flex-wrap max-sm:min-h-11`}>
        <ChevronLeft size={16} aria-hidden="true" className="shrink-0" />
        <span data-stage-back-lead="">{way.place}</span>
        {title ? (
          <span data-stage-back-place="" className="inline-flex min-w-0 font-medium">
            <span aria-hidden="true" className="pr-1">·</span>
            <span data-stage-back-project="" className="inline-block max-w-[20rem] truncate align-bottom">
              {title}
            </span>
          </span>
        ) : null}
      </Link>
    </div>
  );
}
