'use client';

import React, { useMemo, useState } from 'react';
import CcAnchor from '@/components/cc/Anchor';
import CcDisclosure from '@/components/cc/Disclosure';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import type { NotDetermined } from '@/lib/workspace-model';
import type { RecordGap } from '@/lib/legacy-project';
import { groupNotDetermined } from '@/lib/not-determined-plain';
import { notDeterminedFoldSummary, wt } from '@/lib/workspace-messages';

/**
 * *Not determined* in the Management view — folded, and grouped by kind.
 *
 * The owner on 04.10.2026, with the Management view of Z_MM_PO_APPROVAL open:
 * eleven full cards, the same engine sentence six times — "keep that folded".
 * So the section is one row with its count and its chip until it is opened,
 * and opened it shows one row per kind: the kind, how often, every line anchor,
 * and one plain sentence (`lib/not-determined-plain.ts`). Nothing is dropped —
 * every item is in one group with its anchor — and the engine's own sentence
 * for each line stays in the IT view, which keeps its open list
 * (`NotDeterminedCard`).
 *
 * The three states of `NotDeterminedCard` hold here too: no source is a
 * sentence and not "0", none is the boundary of what was assessed, never a
 * clean bill.
 */
export default function NotDeterminedFold({
  data,
  recorded = [],
  itHref,
}: {
  data: NotDetermined;
  recorded?: readonly RecordGap[];
  /** Where the engine's reasons stand line by line — the IT view. */
  itHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => groupNotDetermined(data.items), [data]);

  const summary = (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>
        {data.noSource
          ? wt('notDetermined.noSource')
          : data.count === 0
            ? wt('notDetermined.none')
            : notDeterminedFoldSummary(data.count, groups.length)}
      </span>
      <CcProvenanceChip value="not-determined" />
    </span>
  );

  return (
    <div
      data-not-determined-fold=""
      className="rounded-cc-card border border-cc-line bg-cc-surface px-4 py-2"
    >
      <CcDisclosure
        title={wt('notDetermined.title')}
        count={data.noSource ? undefined : data.count}
        summary={summary}
        level={3}
        open={open}
        onOpenChange={setOpen}
      >
        {data.noSource || data.count === 0 ? (
          <p
            data-not-determined-state={data.noSource ? 'no-source' : 'none'}
            className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted"
          >
            {data.noSource ? wt('notDetermined.noSource') : wt('notDetermined.none')}
          </p>
        ) : (
          <ul data-not-determined-state="some" className="m-0 list-none divide-y divide-cc-line p-0">
            {groups.map((group) => (
              <li key={group.key} data-not-determined-group={group.key} className="py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13px] font-semibold text-cc-ink">{group.label}</span>
                  <span data-not-determined-group-count="" className="text-[13px] font-semibold text-cc-ink-muted">
                    ×{group.count}
                  </span>
                  <span className="inline-flex flex-wrap items-center gap-1">
                    {group.anchors.map((anchor) => (
                      <CcAnchor key={anchor} label={`${wt('notDetermined.sourceLine')} ${anchor}`}>
                        {anchor}
                      </CcAnchor>
                    ))}
                  </span>
                </div>
                <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">{group.plain}</p>
              </li>
            ))}
          </ul>
        )}
        {recorded.length > 0 ? (
          <div data-not-determined-record-list="" className="mt-2">
            <p className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
              {wt('notDetermined.recordTitle')}
            </p>
            <ul className="m-0 mt-1 list-none space-y-1 p-0">
              {recorded.map((gap) => (
                <li key={gap.form} data-not-determined-record={gap.form} className="text-[12px] leading-snug font-medium text-cc-ink-muted">
                  <span className="font-semibold text-cc-ink">{gap.label}</span> — {gap.why}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {itHref && data.count > 0 ? (
          <p className="m-0 mt-2 text-[12px] font-medium text-cc-ink-muted">
            <a href={itHref} data-not-determined-it-link="" className="font-semibold text-cc-ink underline underline-offset-2">
              {wt('notDetermined.itDetail')}
            </a>
          </p>
        ) : null}
      </CcDisclosure>
    </div>
  );
}
