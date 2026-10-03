'use client';

import React, { useEffect, useRef, useState } from 'react';
import CcDisclosure from '@/components/cc/Disclosure';
import { wt } from '@/lib/workspace-messages';

/**
 * One named fold under the Management answer — "Evidence", "Options and the
 * decision", "Costs", "Process" (owner 03.10.2026: "an enormous number of boxes
 * … at the start the user cannot grasp it"; ADR-037 "show less, lose nothing").
 *
 * Collapsed by default. The reader's choice is remembered **in this browser
 * only** (`localStorage`, like the density and the coach marks — ADR-036): it
 * is interface state, never written to the project, a run or an account. A
 * browser that refuses storage simply starts folded again.
 *
 * The children stay mounted while folded (`CcDisclosure` hides, it does not
 * unmount), so what they read keeps loading and a printed page still shows
 * them (§7.1).
 */
const KEY = 'cc.management.fold.';

export type ManagementFoldId = 'evidence' | 'options' | 'costs' | 'process';

const TITLE: Record<ManagementFoldId, Parameters<typeof wt>[0]> = {
  evidence: 'mgmtFold.evidence',
  options: 'mgmtFold.options',
  costs: 'mgmtFold.costs',
  process: 'mgmtFold.process',
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
    try {
      if (window.localStorage.getItem(KEY + id) === 'open') setOpen(true);
    } catch {
      // Storage refused (a private window, blocked site data): start folded.
    }
    // A link to the fold, or to anything inside it ("Every object, with its
    // evidence", "#decision-card"), opens it and then scrolls to the target.
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

  const change = (next: boolean) => {
    setOpen(next);
    try {
      if (next) window.localStorage.setItem(KEY + id, 'open');
      else window.localStorage.removeItem(KEY + id);
    } catch {
      // Nothing to remember it in; the fold still works for this visit.
    }
  };

  return (
    <div
      ref={ref}
      id={`management-${id}`}
      data-management-fold={id}
      className="rounded-cc-card border border-cc-line bg-cc-surface px-4 py-2"
    >
      <CcDisclosure title={wt(TITLE[id])} count={count} summary={summary} level={2} open={open} onOpenChange={change}>
        <div className="pb-2">{children}</div>
      </CcDisclosure>
    </div>
  );
}
