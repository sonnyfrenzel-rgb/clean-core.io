'use client';

import React from 'react';
import CcDisclosure from '@/components/cc/Disclosure';
import ObjectSection from '@/components/analyze/ObjectSection';

/** One thing the analysis could not determine: what, why, and the panel that holds its detail. */
export interface OpenItem {
  /** A stable id for the entry — a data attribute, never shown. */
  key: string;
  title: string;
  reason: string;
  body?: React.ReactNode;
}

/**
 * "Not determined" — the one place on the Analyze stage for everything the
 * analysis could not settle (owner decision 02.10.2026). It used to be said
 * three times: a facet, a side card that pointed further down, and a folded
 * section "N things this analysis could not determine" at the end of the page.
 * Now the side card is the list: each entry with its reason in plain sight, and
 * the panel behind it (the statements, the missing objects, the check tasks)
 * one action deeper under "Details" — moved, never dropped.
 *
 * `id="analysis-not-determined"` is where "Show the list" on the facet lands.
 */
export default function NotDeterminedSide({ items }: { items: readonly OpenItem[] }) {
  return (
    <ObjectSection
      side
      id="analysis-not-determined"
      data-analysis-not-determined={items.length}
      title="Not determined"
      right={<span className="cc-text-meta text-cc-ink-muted">{items.length}</span>}
    >
      {items.length ? (
        <ul className="m-0 p-0 list-none divide-y divide-cc-line">
          {items.map((item) => (
            <li key={item.key} data-not-determined-item={item.key} className="py-3 first:pt-0 last:pb-0">
              <h3 className="m-0 flex items-start gap-2 cc-text-cell font-semibold text-cc-ink">
                <span aria-hidden={true} className="mt-1 h-3 w-3 shrink-0 rounded-full border border-dashed border-cc-ink-muted" />
                <span>{item.title}</span>
              </h3>
              <p className="m-0 mt-1 pl-5 cc-text-meta font-medium text-cc-ink-muted">{item.reason}</p>
              {item.body ? (
                <div className="mt-1 pl-5" data-not-determined-detail={item.key}>
                  <CcDisclosure title="Details">
                    <div className="min-w-0">{item.body}</div>
                  </CcDisclosure>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 cc-text-cell text-cc-ink-muted">Every construct read was within the engine’s checks.</p>
      )}
      <p className="m-0 mt-3 cc-text-meta font-medium text-cc-ink-muted">
        A result covers what the engine checks, which is not the whole program.
      </p>
    </ObjectSection>
  );
}
