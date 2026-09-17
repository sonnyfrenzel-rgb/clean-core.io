'use client';

import React, { useCallback, useEffect, useState } from 'react';
import RevisionHistory from '@/components/process-revisions/RevisionHistory';
import {
  diffProcessRevisions,
  type ProcessRevisionSummary,
  type RevisionDiff,
} from '@/lib/process-revisions';
import {
  ensureProcessBaseline,
  fetchProcessRevision,
  fetchProcessRevisions,
} from '@/lib/process-revisions-client';

/**
 * The history of a process and the comparison of two of its revisions —
 * roadmap 3.2.
 *
 * Drop it in with the project id; it does the rest:
 *
 * ```tsx
 * const RevisionCompare = dynamic(
 *   () => import('@/components/process-revisions/RevisionCompare'),
 *   { ssr: false },
 * );
 * <RevisionCompare projectId={projectId} refreshKey={savedRevision} />
 * ```
 *
 * `refreshKey` is anything that changes when the editor saves — the revision
 * number it got back is the obvious one. The list reloads on a new value and on
 * nothing else, so a save shows up without this component polling for it.
 *
 * The comparison itself is `diffProcessRevisions` in `lib/process-revisions.ts`
 * — a pure function over the two BPMN files, so what is shown here is what a
 * test asserts without a browser. This component renders it; it decides nothing.
 *
 * Loaded lazily on purpose: the comparison reads BPMN, and the reader of the
 * bundle has no use for that until they open the history.
 *
 * What is held is keyed, and the key is compared on every render — the pattern
 * of `hooks/useProcessMap.ts`. A list belonging to another project, or to the
 * state before the last save, is never shown as the current one; it is simply
 * not there yet.
 */

export interface RevisionCompareProps {
  projectId: string;
  /** Change it after a save to reload the list. */
  refreshKey?: string | number;
  /**
   * Reconstruct revision 1 when the project has none. Off by default: the
   * editor of 3.1 is what opens a process, and a history panel should not be
   * the thing that creates one.
   */
  ensureBaseline?: boolean;
  className?: string;
}

interface HeldList {
  key: string;
  revisions: ProcessRevisionSummary[];
  failed: boolean;
}

interface HeldDiff {
  key: string;
  diff: RevisionDiff | null;
}

export default function RevisionCompare({
  projectId,
  refreshKey,
  ensureBaseline = false,
  className,
}: RevisionCompareProps) {
  const [held, setHeld] = useState<HeldList>({ key: '', revisions: [], failed: false });
  // One state, not two: the pair is only ever set together, and two states would
  // let a render see the old `from` beside the new `to`.
  const [pair, setPair] = useState<{ from: number | null; to: number | null }>({ from: null, to: null });
  const [heldDiff, setHeldDiff] = useState<HeldDiff>({ key: '', diff: null });

  const listKey = `${projectId}|${refreshKey ?? ''}|${ensureBaseline ? 'ensure' : 'read'}`;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (ensureBaseline) await ensureProcessBaseline(projectId);
      const list = await fetchProcessRevisions(projectId);
      if (cancelled) return;
      setHeld({ key: listKey, revisions: list, failed: false });
      // The newest against the one before it: the comparison a reader opening
      // the history is most often after. One revision has nothing to compare.
      setPair(
        list.length > 1
          ? { from: list[list.length - 2].revision, to: list[list.length - 1].revision }
          : { from: null, to: null },
      );
    };
    load().catch(() => {
      if (!cancelled) setHeld({ key: listKey, revisions: [], failed: true });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, listKey, ensureBaseline]);

  const loaded = held.key === listKey;
  const revisions = loaded ? held.revisions : [];
  const from = loaded ? pair.from : null;
  const to = loaded ? pair.to : null;

  const diffKey = from !== null && to !== null && from !== to ? `${listKey}|${from}|${to}` : '';

  useEffect(() => {
    if (!diffKey || from === null || to === null) return;
    let cancelled = false;
    const compare = async () => {
      const [a, b] = await Promise.all([
        fetchProcessRevision(projectId, from),
        fetchProcessRevision(projectId, to),
      ]);
      if (cancelled) return;
      setHeldDiff({ key: diffKey, diff: a && b ? diffProcessRevisions(a, b) : null });
    };
    compare().catch(() => {
      if (!cancelled) setHeldDiff({ key: diffKey, diff: null });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, from, to, diffKey]);

  /**
   * First click picks one side, second click the other, third starts over.
   * The two are ordered by number, so "from" is always the older revision and
   * the comparison never reads backwards by accident.
   */
  const pick = useCallback((revision: number) => {
    setPair((current) => {
      if (current.from !== null && current.to !== null) return { from: revision, to: null };
      if (current.from === null) return { from: revision, to: null };
      if (current.from === revision) return { from: null, to: null };
      return current.from < revision
        ? { from: current.from, to: revision }
        : { from: revision, to: current.from };
    });
  }, []);

  if (held.failed && loaded) {
    return (
      <section data-revision-compare="failed" className={className}>
        <p className="text-[13px] font-medium text-cc-ink-muted">
          The revisions of this process could not be read.
        </p>
      </section>
    );
  }

  const comparing = diffKey !== '' && heldDiff.key !== diffKey;
  const diff = heldDiff.key === diffKey ? heldDiff.diff : null;

  return (
    <section
      data-revision-compare={loaded ? (revisions.length ? 'ready' : 'empty') : 'loading'}
      aria-label="Revisions of this process"
      className={['flex flex-col gap-4', className].filter(Boolean).join(' ')}
    >
      <RevisionHistory revisions={revisions} from={from} to={to} onPick={pick} />

      {diffKey ? (
        <div data-revision-diff={`${from}-${to}`} className="flex flex-col gap-3">
          <h4 className="text-[14px] font-bold text-cc-ink">
            Revision {from} compared with revision {to}
          </h4>
          {comparing ? (
            <p className="text-[13px] font-medium text-cc-ink-muted">Reading both revisions…</p>
          ) : diff ? (
            <>
              <p data-revision-diff-summary className="text-[13px] font-medium text-cc-ink-muted">
                {diff.summary}
              </p>
              <Group title="Added" entries={diff.added} tone="added" />
              <Group title="Removed" entries={diff.removed} tone="removed" />
              {diff.changed.length > 0 ? (
                <div data-revision-diff-group="changed" className="flex flex-col gap-1.5">
                  <h5 className="text-[13px] font-bold text-cc-ink">Changed</h5>
                  <ul className="flex flex-col gap-1.5">
                    {diff.changed.map((element) => (
                      <li
                        key={element.id}
                        data-revision-diff-element={element.id}
                        className="rounded-[8px] border border-cc-line bg-cc-surface px-3 py-2"
                      >
                        <p className="text-[13px] font-semibold text-cc-ink">
                          {element.kind}: {element.label}
                          {element.anchor ? (
                            <span className="font-medium text-cc-ink-muted"> · {element.anchor}</span>
                          ) : null}
                        </p>
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {element.fields.map((field) => (
                            <li
                              key={field.field}
                              data-revision-diff-field={field.field}
                              className="text-[12px] font-medium text-cc-ink-muted"
                            >
                              {field.label}: {field.before} → {field.after}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-[13px] font-medium text-cc-ink-muted">
              These two revisions could not be read back for comparison.
            </p>
          )}
        </div>
      ) : (
        <p className="text-[13px] font-medium text-cc-ink-muted">
          Pick two revisions to see what is different between them.
        </p>
      )}
    </section>
  );
}

function Group({
  title,
  entries,
  tone,
}: {
  title: string;
  entries: RevisionDiff['added'];
  tone: 'added' | 'removed';
}) {
  if (entries.length === 0) return null;
  return (
    <div data-revision-diff-group={tone} className="flex flex-col gap-1.5">
      <h5 className="text-[13px] font-bold text-cc-ink">{title}</h5>
      <ul className="flex flex-col gap-1">
        {entries.map((element) => (
          <li
            key={element.id}
            data-revision-diff-element={element.id}
            className="rounded-[8px] border border-cc-line bg-cc-surface px-3 py-1.5 text-[13px] font-medium text-cc-ink"
          >
            {element.kind}: {element.label}
            {element.anchor ? <span className="text-cc-ink-muted"> · {element.anchor}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
