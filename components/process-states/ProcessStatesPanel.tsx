'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CcCard from '@/components/cc/Card';
import CcMessageStrip from '@/components/cc/MessageStrip';
import StateChoice from '@/components/process-states/StateChoice';
import StateSummary from '@/components/process-states/StateSummary';
import {
  STATE_MEANING,
  markAffectedDerivations,
  markFor,
  readProcessStates,
  subjectIdsOf,
  type ElementState,
  type ProcessStateView,
  type StateSubject,
} from '@/lib/process-states';
import { confirmOutcomeSentence, confirmProcessStates, fetchProcessStates } from '@/lib/process-states-client';

/**
 * Keep · Change deliberately · Drop · Clarify, for every rule and every element
 * of a process — roadmap 3.5.
 *
 * Drop it in with the project id; it does the rest:
 *
 * ```tsx
 * const ProcessStatesPanel = dynamic(
 *   () => import('@/components/process-states/ProcessStatesPanel'),
 *   { ssr: false },
 * );
 * <ProcessStatesPanel projectId={projectId} refreshKey={savedRevision} onConfirmed={setNeedRevision} />
 * ```
 *
 * It needs the process to have been reconstructed — revision 1 of 3.2 — because
 * the need is stated about the Ist. Until then the route refuses with a reason
 * and this panel shows that reason rather than an empty list, which would read
 * as "there is nothing to confirm".
 *
 * What is held is keyed and the key is compared on every render, the pattern of
 * `hooks/useProcessMap.ts` and `RevisionCompare`: a view belonging to another
 * project, or to the state before the last confirmation, is never shown as the
 * current one — it is simply not there yet.
 *
 * The counting and the marking are pure functions in `lib/process-states.ts`.
 * This component renders them; it decides nothing.
 */

export interface ProcessStatesPanelProps {
  projectId: string;
  /** Change it to reload — the process revision the editor last saved is the obvious one. */
  refreshKey?: string | number;
  /** Called with the new Bedarfsrevision after a confirmation was stored. */
  onConfirmed?: (revision: number) => void;
  className?: string;
}

interface Held {
  key: string;
  view: ProcessStateView | null;
  loaded: boolean;
}

export default function ProcessStatesPanel({ projectId, refreshKey, onConfirmed, className }: ProcessStatesPanelProps) {
  const [held, setHeld] = useState<Held>({ key: '', view: null, loaded: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ subject: string; message: string } | null>(null);

  const key = `${projectId}|${refreshKey ?? ''}`;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const view = await fetchProcessStates(projectId);
      if (cancelled) return;
      setHeld({ key, view, loaded: true });
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [key, projectId]);

  const view = held.key === key ? held.view : null;

  const states = useMemo(
    () => (view ? readProcessStates(view.entries, subjectIdsOf(view.subjects)) : null),
    [view],
  );
  const marks = useMemo(
    () => (view && states ? markAffectedDerivations(states, view.links) : []),
    [view, states],
  );

  const confirm = useCallback(
    async (subject: StateSubject, state: ElementState, note: string | null) => {
      if (!view) return;
      setBusy(subject.subject);
      setFailure(null);
      const outcome = await confirmProcessStates(projectId, view.revision, [
        { subject: subject.subject, kind: subject.kind, state, note },
      ]);
      setBusy(null);
      setNotice(confirmOutcomeSentence(outcome));
      if (outcome.ok) {
        setHeld({ key, view: outcome.view, loaded: true });
        if (outcome.created) onConfirmed?.(outcome.view.revision);
      } else {
        setFailure({ subject: subject.subject, message: outcome.error });
      }
    },
    [key, onConfirmed, projectId, view],
  );

  if (!held.loaded || held.key !== key) {
    return (
      <p data-process-states="loading" className={className}>
        <span className="text-[13px] font-medium text-cc-ink-muted">Reading what has been confirmed…</span>
      </p>
    );
  }

  if (!view || !states) {
    return (
      <div data-process-states="unavailable" className={className}>
        <CcMessageStrip state="information" headline="Nothing to confirm yet.">
          This process has not been reconstructed, or its source has moved since it was. Open the process first; the
          need is confirmed about the reconstructed Ist.
        </CcMessageStrip>
      </div>
    );
  }

  const rules = view.subjects.filter((s) => s.kind === 'rule');
  const elements = view.subjects.filter((s) => s.kind === 'element');

  const list = (subjects: StateSubject[]) =>
    subjects.map((subject) => (
      <StateChoice
        // The revision is in the key on purpose: a confirmation that went
        // through remounts the card, so the draft starts from the record
        // instead of sitting on top of it.
        key={`${subject.subject}|${states.bySubject[subject.subject]?.revision ?? 0}`}
        subject={subject}
        entry={states.bySubject[subject.subject] ?? null}
        mark={markFor(marks, subject.subject)}
        busy={busy === subject.subject}
        error={failure?.subject === subject.subject ? failure.message : null}
        onConfirm={(state, note) => confirm(subject, state, note)}
      />
    ));

  return (
    <div data-process-states="" data-process-states-revision={view.revision} className={className}>
      <CcCard title="What the business needs" level={3} density="cozy">
        <div className="flex flex-col gap-3">
          <p data-state-meaning className="text-[13px] font-medium text-cc-ink-muted">
            {STATE_MEANING}
          </p>
          <StateSummary states={states} revision={view.revision} />
          {notice ? (
            <p data-state-notice role="status" className="text-[13px] font-medium text-cc-ink">
              {notice}
            </p>
          ) : null}
          {rules.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h4 className="text-[13px] font-bold text-cc-ink">Business rules ({rules.length})</h4>
              {list(rules)}
            </section>
          ) : null}
          <section className="flex flex-col gap-2">
            <h4 className="text-[13px] font-bold text-cc-ink">Process elements ({elements.length})</h4>
            {list(elements)}
          </section>
          <p data-state-note-footer className="text-[12px] font-medium text-cc-ink-muted">
            A confirmation records that an account said this at a time. It is not a statement about the code, and it is
            not part of any signed run.
          </p>
        </div>
      </CcCard>
    </div>
  );
}
