import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { stageBackLabel } from '@/lib/workspace-back-href';

/**
 * The words inside a stage's way back to its project — the same at the top
 * (`StageHeader`) and at the end (`StageFooter`) of every stage:
 *
 *   ← Back to project workspace · Order limit check · IT view, Need & process
 *
 * Owner 06.10.2026: the project's workspace and "My workspace" (the list of
 * all projects) need two different names, or the reader loses track. The
 * project's name is cut at 16rem with an ellipsis; the place wraps under the
 * lead on a phone rather than pushing the page sideways.
 */
/** " · " with no-break spaces, so a flex item does not swallow them. */
const SEP = ' · ';

export default function StageBackText({
  projectName,
  search,
}: {
  projectName?: string | null;
  search: string;
}) {
  const label = stageBackLabel({ projectName, search });
  return (
    <>
      <ArrowLeft size={16} aria-hidden="true" className="shrink-0" />
      <span data-stage-back-lead="">{label.lead}</span>
      {label.project || label.place ? (
        <span data-stage-back-place="" className="inline-flex min-w-0 flex-wrap items-baseline font-medium">
          {label.project ? (
            <>
              <span>{SEP}</span>
              <span data-stage-back-project="" className="inline-block max-w-[16rem] truncate align-bottom">
                {label.project}
              </span>
            </>
          ) : null}
          {label.place ? (
            <>
              <span>{SEP}</span>
              <span data-stage-back-view="">{label.place}</span>
            </>
          ) : null}
        </span>
      ) : null}
    </>
  );
}
