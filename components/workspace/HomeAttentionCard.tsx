'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, XCircle } from 'lucide-react';
import CcCard from '@/components/cc/Card';
import { ATTENTION_LABEL } from '@/lib/home-status';
import type { HomeRow } from '@/lib/home-rows';
import { homeAttentionShowAll, wt } from '@/lib/workspace-messages';
import { HomeNextCell } from './HomeStatusCell';

/**
 * "Needs your attention" (AB-14b, mockup `attentionCard`; replaces the "Your turn" card of 3.0).
 *
 * Only when there is a reason, and only three reasons exist (`lib/home-status.ts`): the code changed since the
 * analysis, the design no longer matches the analysis, a test run failed. A project that was analysed and left there
 * has nothing open and never stands here — the old card listed the next open step of every project, so a returning
 * account with ten analysed programs was told ten times to draft a design (H-O3: re-design is never offered as a next
 * step on the home page). At most three; "Show all N in the list" filters the list to them.
 */
export default function HomeAttentionCard({
  shown,
  total,
  onShowAll,
  onRun,
}: {
  shown: readonly HomeRow[];
  total: number;
  onShowAll: () => void;
  /** Opens the run dialog for a row whose next step is a run; null when the row may not run from here. */
  onRun: (row: HomeRow) => (() => void) | undefined;
}) {
  if (shown.length === 0) return null;
  return (
    <div data-home-attention="">
      <CcCard title={wt('homeList.attentionTitle')} level={2} count={total} density="cozy">
        <ul className="m-0 flex list-none flex-col p-0">
          {shown.map((row) => {
            const reason = row.status.attention!;
            return (
              <li
                key={row.id}
                data-home-attention-row={row.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-cc-line py-2 first:border-t-0 first:pt-0"
              >
                <Link href={`/project/${encodeURIComponent(row.id)}`} className="min-w-0 text-[13px] font-semibold text-cc-ink underline underline-offset-2">
                  {row.name}
                </Link>
                <span
                  data-home-attention-reason={reason}
                  className={`inline-flex items-center gap-1 text-[12px] font-medium ${reason === 'test-failed' ? 'text-cc-error' : 'text-cc-ink'}`}
                >
                  {reason === 'test-failed' ? (
                    <XCircle size={13} aria-hidden={true} />
                  ) : (
                    <Clock size={13} aria-hidden={true} className="text-cc-warning-mark" />
                  )}
                  {ATTENTION_LABEL[reason]}
                </span>
                <span className="ml-auto">
                  <HomeNextCell projectId={row.id} next={row.status.next} onRun={onRun(row)} compact />
                </span>
              </li>
            );
          })}
        </ul>
        {total > shown.length ? (
          <button
            type="button"
            onClick={onShowAll}
            data-home-attention-all=""
            className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-cc-ink underline underline-offset-2"
          >
            {homeAttentionShowAll(total)}
            <ArrowRight size={14} aria-hidden={true} />
          </button>
        ) : (
          <p className="mt-3 mb-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('homeList.attentionFoot')}</p>
        )}
      </CcCard>
    </div>
  );
}
