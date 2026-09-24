'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import CcCard from '@/components/cc/Card';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { getAuth, getDb } from '@/lib/firebase';
import { isProjectOwner } from '@/lib/project-readers';
import {
  managementAnswers,
  runHistoryEntry,
  type ManagementFigure,
  type RunHistoryEntry,
} from '@/lib/management-answers';
import { notDetermined } from '@/lib/workspace-model';
import ManagementOverview from './ManagementOverview';
import type { Project } from '@/lib/types';

/**
 * The Management view's answers — roadmap step 6.4.
 *
 * Everything this component says is derived in `lib/management-answers.ts`; it
 * adds no sentence of its own, and the two figures it would be most tempting to
 * make up — a Clean Core Score without a run, a trend line through one point —
 * it cannot, because the model hands it `null` and the reason instead.
 *
 * **The form of this view is step 3.0.10** — `ManagementOverview.tsx`: the one
 * answer sentence, the charts and *not determined* as a visible area of each.
 * These four answers sit under it, one action deeper (§2.11), and the overview
 * draws from the same `ManagementView` rather than from a second derivation.
 * The one thing that step could not have added afterwards is the coverage of
 * each figure, so every figure arrives with it and is printed beside the
 * number rather than in a popover.
 *
 * **The run history is read here, not in the model.** `projects/{id}/runs` is
 * owner-only in `firestore.rules`, so an invited reader's read is refused — and
 * that is reported as *the runs could not be read* rather than as an empty
 * list. The two are different statements and only one of them is "no history".
 */
export default function ManagementAnswers({
  project,
  projectId,
}: {
  project: Project | null;
  projectId: string;
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

  // Nothing is answered before the runs have been asked for. Rendering the
  // model with `null` here would say "the runs could not be read" for as long
  // as the read is in flight — a wrong answer that then corrects itself, which
  // is worse than a late one (`components/workspace/WorkspaceShell.tsx` makes
  // the same choice for the coach marks).
  if (history === undefined) {
    return (
      <div data-management-view="loading" role="status" className="py-8">
        <span className="sr-only">Reading the runs of this project…</span>
      </div>
    );
  }

  return (
    <section data-management-view="" aria-labelledby="management-answers-heading" className="cc">
      {/* Roadmap 3.0.10: the overview answers first — one sentence and at most
          six cards, each with its answer as its title. The four detailed
          answers below stay one action deeper (§2.11: nothing lost, nothing
          first); the headline the overview prints is this view's own sentence
          wherever there is no signed run to say more about. */}
      <ManagementOverview
        project={project}
        projectId={projectId}
        view={view}
        detailCount={view.answers.length}
      >
      <div className="space-y-4">
        {view.answers.map((answer) => (
          <div key={answer.id} data-management-answer={answer.id}>
            <CcCard
              title={answer.headline}
              meta={
                <span className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
                  {answer.question}
                </span>
              }
            >
              {answer.figures.length > 0 ? (
                <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
                  {answer.figures.map((figure) => (
                    <Figure key={figure.key} figure={figure} />
                  ))}
                </ul>
              ) : null}

              {answer.items.length > 0 ? (
                <ul className="m-0 mt-3 list-none space-y-2 p-0">
                  {answer.items.map((item) => (
                    <li
                      key={item.key}
                      data-management-item={item.key}
                      className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-cc-ink">{item.label}</span>
                        <CcProvenanceChip value={item.provenance} />
                      </div>
                      <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
                        {item.detail}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CcCard>
          </div>
        ))}
      </div>
      </ManagementOverview>
    </section>
  );
}

/**
 * One figure, its coverage and what it is worth.
 *
 * The coverage line is text next to the number and not a tooltip: roadmap
 * 3.0.10 asks for every figure in a diagram to be reachable as text as well,
 * and the cheapest way to keep that promise is for the text to be the thing
 * that exists first.
 */
function Figure({ figure }: { figure: ManagementFigure }) {
  return (
    <li
      data-management-figure={figure.key}
      className="rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        {figure.value === null ? (
          <span data-figure-absent="" className="text-[13px] font-semibold text-cc-ink-muted">
            Not determined
          </span>
        ) : (
          <span data-figure-value="" className="text-[18px] leading-none font-bold text-cc-ink">
            {figure.value}
          </span>
        )}
        <span className="text-[12px] font-medium text-cc-ink-muted">{figure.label}</span>
        <CcProvenanceChip value={figure.provenance} />
      </div>
      {figure.value === null && figure.absentReason ? (
        <p
          data-figure-absent-reason=""
          className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted"
        >
          {figure.absentReason}
        </p>
      ) : null}
      <p data-figure-coverage="" className="m-0 mt-1 text-[11px] leading-snug font-medium text-cc-ink-muted">
        {figure.coverage.sentence}
      </p>
    </li>
  );
}
