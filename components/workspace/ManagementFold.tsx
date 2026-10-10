'use client';

import React, { useEffect, useRef, useState } from 'react';
import CcDisclosure from '@/components/cc/Disclosure';
import { wt } from '@/lib/workspace-messages';

/**
 * The one named fold under the Management answer — "Evidence": every object
 * per bucket and the open questions (ADR-087; owner 03.10.2026: "an enormous
 * number of boxes … at the start the user cannot grasp it"; ADR-037 "show
 * less, lose nothing"). The "Costs" and "Process" folds are gone: the costs are
 * a row of the decision, the process is the Business view's.
 *
 * **Always starts closed** (owner decision 10.10.2026). It used to remember an
 * opened fold in this browser (ADR-036), so a fold opened once stood open on
 * every later visit — and the first screen was no longer the first screen.
 * Nothing about it is stored anywhere now. A link to anything inside it
 * ("Every object, with its evidence", `#not-determined`) still opens it and
 * scrolls to the target.
 *
 * The children stay mounted while folded (`CcDisclosure` hides, it does not
 * unmount), so what they read keeps loading and a printed page still shows
 * them (§7.1).
 */
export type ManagementFoldId = 'evidence';

const TITLE: Record<ManagementFoldId, Parameters<typeof wt>[0]> = {
  evidence: 'mgmtFold.evidence',
};

export default function ManagementFold({
  id,
  summary,
  count,
  children,
}: {
  id: ManagementFoldId;
  /** One sentence that stays visible while folded: what is inside, or why it is still empty and what fills it. */
  summary: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // A link to the fold, or to anything inside it, opens it and then scrolls
    // to the target.
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const target = document.getElementById(hash);
      if (!target || !ref.current?.contains(target)) return;
      setOpen(true);
      window.requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [id]);

  return (
    <div
      ref={ref}
      id={`management-${id}`}
      data-management-fold={id}
      className="rounded-cc-card border border-cc-line bg-cc-surface px-4 py-2"
    >
      <CcDisclosure title={wt(TITLE[id])} count={count} summary={summary} level={2} open={open} onOpenChange={setOpen}>
        <div className="pb-2">{children}</div>
      </CcDisclosure>
    </div>
  );
}
