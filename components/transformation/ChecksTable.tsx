'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import CcTable from '@/components/cc/Table';
import type { CheckOutcome, ChecksTable as ChecksTableModel } from '@/lib/transformation/checks-table';

/**
 * The checks as one table (ADR-129 (4), mock-up T8): the check, who ran it, its outcome, what it says. Three outcomes,
 * never two — passed, failed, or not run — and the personal checklist as its own row, never counted as a check. The
 * rows come from `checksTable` (`lib/transformation/checks-table.ts`); a phone reads each row as a small block.
 */
const OUTCOME: Record<CheckOutcome, { word: string; dot: string; text: string }> = {
  passed: { word: 'Check passed', dot: 'bg-cc-seq-3', text: 'text-cc-ink' },
  failed: { word: 'Check failed', dot: 'bg-cc-error', text: 'text-cc-error' },
  'not-run': { word: 'Not run here', dot: 'border-2 border-cc-neutral bg-cc-surface', text: 'text-cc-neutral' },
  running: { word: 'Running', dot: 'bg-cc-seq-2 motion-safe:animate-pulse', text: 'text-cc-ink' },
  waiting: { word: 'After the fills', dot: 'border-2 border-cc-neutral bg-cc-surface', text: 'text-cc-neutral' },
  nothing: { word: 'Nothing to check', dot: 'border-2 border-cc-neutral bg-cc-surface', text: 'text-cc-neutral' },
  checklist: { word: 'Yours to tick', dot: 'border-2 border-cc-neutral bg-cc-surface', text: 'text-cc-neutral' },
};

export default function ChecksTable({
  table,
  onOpenChecklist,
  footNote,
}: {
  table: ChecksTableModel;
  /** Opens the personal checklist (the grounding audit). */
  onOpenChecklist?: () => void;
  /** Said once under the table: who ran what, and what "passed" means. */
  footNote?: React.ReactNode;
}) {
  return (
    <>
      <div className="mt-3" data-checks-table={table.rows.length}>
        <CcTable
          caption="Checks of the generated code"
          columns={[
            { key: 'check', label: 'Check', width: '22%' },
            { key: 'who', label: 'Who ran it', width: '20%' },
            { key: 'result', label: 'Result', width: '14%' },
            { key: 'says', label: 'What it says' },
          ]}
          rows={table.rows.map((r) => {
            const o = OUTCOME[r.outcome];
            return {
              key: r.key,
              cells: {
                check: (
                  <span className="font-semibold" data-check-row={r.key} data-check-outcome={r.outcome}>
                    {r.check}
                  </span>
                ),
                who: <span className="cc-text-meta text-cc-ink-muted">{r.who}</span>,
                result: (
                  <span className={cn('inline-flex items-center gap-2 whitespace-nowrap font-bold', o.text)}>
                    <i aria-hidden={true} className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', o.dot)} />
                    {o.word}
                  </span>
                ),
                says: (
                  <span className="[overflow-wrap:anywhere]">
                    {r.says}
                    {r.key === 'hand' && onOpenChecklist ? (
                      <>
                        {' '}
                        <button type="button" onClick={onOpenChecklist} className="font-semibold text-cc-information underline-offset-2 hover:underline" data-open-checklist="">
                          Open the list
                        </button>
                      </>
                    ) : null}
                  </span>
                ),
              },
            };
          })}
        />
      </div>
      {footNote ? <p className="m-0 mt-3 cc-text-meta text-cc-ink-muted">{footNote}</p> : null}
    </>
  );
}
