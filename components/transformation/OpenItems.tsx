'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcLinkButton from '@/components/cc/LinkButton';
import type { OpenItem, OpenItemAction } from '@/lib/transformation-view';

/**
 * "Still open" — one numbered list, one action each (ADR-129 (4), mock-up T6). Custom tables without a home, calls
 * without a released successor, output that becomes a Fiori app, constructs the engine did not assess, rules without a
 * decision: what the code carries over as the original did, or not at all, until someone decides. The items come from
 * `openItems` (`lib/transformation-view.ts`); this component adds no item of its own.
 */
export default function OpenItems({
  items,
  hrefOf,
}: {
  items: readonly OpenItem[];
  /** Where each kind of action leads; null where the page cannot link (no project id). */
  hrefOf: ((action: OpenItemAction) => string) | null;
}) {
  if (items.length === 0) {
    return <p className="m-0 mt-3 cc-text-cell text-cc-ink-muted">Nothing is open: every finding has a released target and every rule a decision.</p>;
  }
  return (
    <ol className="m-0 mt-3 flex list-none flex-col p-0" data-open-items={items.length}>
      {items.map((item, i) => (
        <li
          key={item.key}
          data-open-item={item.key}
          className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-t border-cc-line py-3 first:border-t-0 first:pt-1 md:grid-cols-[28px_minmax(0,1fr)_auto]"
        >
          <span aria-hidden={true} className="flex h-6 w-6 items-center justify-center rounded-full bg-cc-warning-bg text-[12px] font-bold text-cc-warning">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="m-0 cc-text-h3 text-cc-ink">{item.title}</p>
            <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
              {item.detail}{' '}
              {item.lines.map((n) => (
                <React.Fragment key={n}>
                  <CcAnchor label={`Source line ${n}`}>{`L${n}`}</CcAnchor>{' '}
                </React.Fragment>
              ))}
            </p>
          </div>
          <div className="col-start-2 flex flex-col items-start gap-1 md:col-start-auto md:items-end">
            {hrefOf ? (
              <CcLinkButton href={hrefOf(item.action)} icon={<ArrowRight size={14} aria-hidden={true} />}>
                {item.actionLabel}
              </CcLinkButton>
            ) : null}
            <span className="cc-text-meta whitespace-nowrap text-cc-ink-muted">{item.place}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
