'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getAuth, getDb } from '@/lib/firebase';
import { isProjectOwner } from '@/lib/project-readers';
import { managementAnswers, runHistoryEntry, type RunHistoryEntry } from '@/lib/management-answers';
import { notDetermined } from '@/lib/workspace-model';
import ManagementOverview from './ManagementOverview';
import type { NextOpenPoint } from '@/lib/next-step';
import type { Project } from '@/lib/types';

/**
 * The Management view's answers — roadmap step 6.4.
 *
 * Everything this component says is derived in `lib/management-answers.ts`; it
 * adds no sentence of its own, and the two figures it would be most tempting to
 * make up — a Clean Core Score without a run, a trend line through one point —
 * it cannot, because the model hands it `null` and the reason instead.
 *
 * **The form of this view is step 3.0.10** — `ManagementOverview.tsx` — made
 * lean by ADR-087. The four detailed answers of 6.4 are no longer rendered:
 * every figure in them has a home on the first screen (the decision, the
 * distance to standard, the trend) or in the header's project status. Their
 * model stays: the overview, the blockers and the steering one-pager draw
 * from the same `ManagementView` rather than from a second derivation.
 *
 * **The run history is read here, not in the model.** `projects/{id}/runs` is
 * owner-only in `firestore.rules`, so an invited reader's read is refused — and
 * that is reported as *the runs could not be read* rather than as an empty
 * list. The two are different statements and only one of them is "no history".
 */
export default function ManagementAnswers({
  project,
  projectId,
  decisionRevision = 0,
  nextStep,
  coach,
  evidenceExtra,
  decision,
  onDecisionChanged,
  beforeWrite,
}: {
  project: Project | null;
  projectId: string;
  /** Passed through to the overview, which rereads the decision when it changes. */
  decisionRevision?: number;
  /** Passed through: the page's one next action, the coach mark slot, and the rest of the "Evidence" fold. */
  nextStep?: NextOpenPoint | null;
  coach?: React.ReactNode;
  evidenceExtra?: React.ReactNode;
  /** The decision record's card — the hero of the Management view. */
  decision?: React.ReactNode;
  /** Passed through: the four-option block chose an option (ADR-079), and the Stand check before it writes. */
  onDecisionChanged?: () => void;
  beforeWrite?: () => Promise<boolean>;
}) {
  /**
   * `undefined` while the read is in flight, `null` when it failed or was
   * refused, an array — possibly empty — when it succeeded. Three states,
   * because a screen that shows "no runs" while it is still asking is the same
   * fabrication as one that shows a zero for something it did not measure.
   */
  const [history, setHistory] = useState<RunHistoryEntry[] | null | undefined>(undefined);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const uid = getAuth().currentUser?.uid ?? null;
      // `projects/{id}/runs` is owner-only (roadmap 5.4, `firestore.rules`), and
      // the filter below is not decoration: a *list* is refused unless the query
      // itself proves it asks only for documents the rule allows — an
      // unconstrained `getDocs` on this collection comes back
      // `permission-denied`, even for the owner and even when there are no runs.
      //
      // For an invited reader the same query is allowed and comes back **empty**,
      // which is the one answer this view must not give: "no runs" and "you may
      // not see the runs" are different statements. So a non-owner is never
      // asked in the first place, and the model reports that the history could
      // not be read.
      if (!isProjectOwner(project, uid) || !uid) {
        if (!cancelled) setHistory(null);
        return;
      }
      try {
        const snap = await getDocs(
          query(collection(getDb(), 'projects', projectId, 'runs'), where('userId', '==', uid)),
        );
        if (cancelled) return;
        const entries = snap.docs
          .map((d) => runHistoryEntry({ runId: d.id, ...d.data() }))
          .filter((e): e is RunHistoryEntry => e !== null);
        setHistory(entries);
      } catch {
        // A refused read and a network fault look the same from here. Either
        // way nothing is known about the history, and the model says so rather
        // than drawing an empty chart.
        if (!cancelled) setHistory(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, project]);

  const open = useMemo(() => notDetermined(project), [project]);
  const view = useMemo(
    () => managementAnswers(project, history ?? null, open),
    [project, history, open],
  );

  // Only the readiness trend waits for the runs (ADR-087). Rendering the trend
  // with `null` here would say "the runs could not be read" for as long as the
  // read is in flight — a wrong answer that then corrects itself, which is
  // worse than a late one — so the trend says it is still reading. The
  // decision, the options and the distance to standard do not depend on the
  // history and are not held back by it.
  return (
    <section
      data-management-view=""
      data-management-history={history === undefined ? 'reading' : 'read'}
      aria-labelledby="management-answers-heading"
      className="cc"
    >
      <ManagementOverview
        project={project}
        projectId={projectId}
        view={view}
        decisionRevision={decisionRevision}
        historyPending={history === undefined}
        nextStep={nextStep}
        coach={coach}
        evidenceExtra={evidenceExtra}
        decision={decision}
        onDecisionChanged={onDecisionChanged}
        beforeWrite={beforeWrite}
      />
    </section>
  );
}
