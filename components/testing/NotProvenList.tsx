import React from 'react';
import { ArrowRight } from 'lucide-react';
import FamilyChip from '@/components/family/FamilyChip';
import type { NotProvenItem } from '@/lib/testing-answer';

/**
 * *Not proven* — one numbered list (ADR-131 (4), mock-up S6): what no result on the Testing page proves, even when
 * every scenario passed, each point with where it is taken up. None of them blocks the handover. The points come from
 * `notProvenItems` (`lib/testing-answer.ts`).
 */
export default function NotProvenList({ items, children }: { items: NotProvenItem[]; children?: React.ReactNode }) {
  return (
    <div data-not-proven={items.length}>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((item, i) => (
          <li
            key={item.key}
            data-not-proven-item={item.key}
            className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3 rounded-cc-row border border-cc-line bg-cc-surface px-4 py-3 max-[720px]:grid-cols-[28px_minmax(0,1fr)]"
          >
            <span aria-hidden={true} className="flex h-6 w-6 items-center justify-center rounded-full bg-cc-warning-bg cc-text-meta font-semibold text-cc-warning">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="m-0 flex flex-wrap items-center gap-2 cc-text-cell font-semibold text-cc-ink">
                {item.title}
                {item.chip ? <FamilyChip kind={item.chip} /> : null}
              </p>
              <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{item.detail}</p>
            </div>
            <a
              href={`#${item.action.target}`}
              className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap cc-text-cell font-semibold text-cc-information hover:underline max-[720px]:col-start-2"
            >
              {item.action.label}
              <ArrowRight size={14} aria-hidden={true} />
            </a>
          </li>
        ))}
      </ol>
      {children}
    </div>
  );
}
