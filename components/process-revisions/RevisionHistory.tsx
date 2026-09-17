'use client';

import React from 'react';
import { CcTag } from '@/components/cc/Tag';
import type { ProcessRevisionSummary } from '@/lib/process-revisions';

/**
 * The revisions of a process, oldest first — roadmap 3.2.
 *
 * Every row says three things and no more: which revision it is, who saved it
 * and when. Revision 1 says instead that it was reconstructed from a file,
 * because nobody drew it — and it is the one row that can never move.
 *
 * What no row says is that the drawing is right. A revision is a record of an
 * act, not a finding about the code, and the sentence under the list says so
 * once rather than every row implying the opposite.
 *
 * Presentational: it holds nothing and fetches nothing. `RevisionCompare` is
 * what wires it to the route.
 */

/** UTC to the minute, the same string everywhere. A local time differs per reader and per server. */
export function revisionTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'time not recorded';
  return `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export interface RevisionHistoryProps {
  revisions: readonly ProcessRevisionSummary[];
  /** The two revisions being compared, if any. */
  from?: number | null;
  to?: number | null;
  /** Called with the revision a reader picked. The caller decides what it becomes. */
  onPick?: (revision: number) => void;
}

export default function RevisionHistory({ revisions, from = null, to = null, onPick }: RevisionHistoryProps) {
  if (revisions.length === 0) {
    return (
      <p data-revision-history="empty" className="text-[13px] font-medium text-cc-ink-muted">
        This process has no revisions yet. The first one is the process reconstructed from the code.
      </p>
    );
  }

  return (
    <div data-revision-history="" className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1">
        {revisions.map((revision) => {
          const picked = revision.revision === from || revision.revision === to;
          const role = revision.revision === from ? 'from' : revision.revision === to ? 'to' : null;
          const Row = onPick ? 'button' : 'div';
          return (
            <li key={revision.revision}>
              <Row
                {...(onPick
                  ? { type: 'button' as const, onClick: () => onPick(revision.revision) }
                  : {})}
                data-revision={revision.revision}
                data-revision-origin={revision.origin}
                data-revision-picked={picked ? role ?? 'yes' : undefined}
                className={[
                  'flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-[8px] border px-3 py-2 text-left',
                  picked ? 'border-cc-information-border bg-cc-information-bg' : 'border-cc-line bg-cc-surface',
                  onPick ? 'hover:border-cc-ink-muted' : '',
                ].join(' ')}
              >
                <span className="text-[13px] font-bold text-cc-ink">Revision {revision.revision}</span>
                {revision.origin === 'reconstructed' ? (
                  <CcTag>Reconstructed from {revision.fileName}</CcTag>
                ) : (
                  <span className="text-[13px] font-medium text-cc-ink-muted">
                    saved by {revision.account.name}
                  </span>
                )}
                <span
                  className="text-[12px] font-medium text-cc-ink-muted"
                  data-revision-time={revision.revision}
                  title={revision.savedAt}
                >
                  {revisionTime(revision.savedAt)}
                </span>
                <span className="text-[12px] font-medium text-cc-ink-muted">
                  {revision.flowNodes} {revision.flowNodes === 1 ? 'element' : 'elements'},{' '}
                  {revision.anchored} with a line anchor
                </span>
              </Row>
            </li>
          );
        })}
      </ol>
      <p data-revision-history-note className="text-[12px] font-medium text-cc-ink-muted">
        A revision records what an account drew and when. It is not a statement about the code, and it is
        not part of any signed run.
      </p>
    </div>
  );
}
