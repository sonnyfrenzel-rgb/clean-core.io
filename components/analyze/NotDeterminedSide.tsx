'use client';

import React from 'react';
import CcDisclosure from '@/components/cc/Disclosure';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import ObjectSection from '@/components/analyze/ObjectSection';

/** One thing the analysis could not determine: what, why, and the panel that holds its detail. */
export interface OpenItem {
  /** A stable id for the entry — a data attribute, never shown. */
  key: string;
  title: string;
  reason: string;
  body?: React.ReactNode;
}

/** The places not assessed, as the hero counts them (ADR-093). */
export interface NotDeterminedSummary {
  places: number;
  kinds: number;
  /** What they take off the score — null where the deductions do not add up to the signed score. */
  points: number | null;
}

/**
 * "Not determined" — the side card of the Analyze stage (owner decision
 * 02.10.2026; one line since ADR-093, 11.10.2026). The places the engine could
 * not assess stand in the score hero as their own row and facet, *Not
 * determined*, never folded away; this card says it once in one line, leads to
 * the project's one list of open questions (ADR-081), and keeps what this
 * analysis could not settle — the statements, the missing objects, the check
 * tasks — one action deeper, moved, never dropped.
 *
 * Its id, `analysis-not-determined`, is where a link to the list on this page lands.
 */
export default function NotDeterminedSide({
  items,
  questions,
  summary,
}: {
  items: readonly OpenItem[];
  /**
   * The project's open questions in their one line (ADR-081), with the way to
   * the list in the workspace — the questions anyone can close stand there, once.
   */
  questions?: React.ReactNode;
  summary?: NotDeterminedSummary;
}) {
  return (
    <ObjectSection
      side
      id="analysis-not-determined"
      data-analysis-not-determined={items.length}
      title="Not determined"
      right={<CcProvenanceChip value="not-determined" />}
    >
      {summary ? (
        <p className="m-0 cc-text-cell text-cc-ink" data-not-determined-summary={summary.places}>
          {summary.places > 0 ? (
            <>
              <b className="font-bold">
                {summary.places} {summary.places === 1 ? 'place' : 'places'}
              </b>{' '}
              the engine could not assess, in {summary.kinds} {summary.kinds === 1 ? 'kind' : 'kinds'}
              {summary.points !== null ? ` — ${summary.points} points of the score` : ''}.
            </>
          ) : (
            'Every construct read was within the engine’s checks.'
          )}
        </p>
      ) : null}
      {questions ? <div className={summary ? 'mt-3' : undefined}>{questions}</div> : null}
      <p className="m-0 mt-3 cc-text-meta font-medium text-cc-ink-muted">
        A result covers what the engine checks, which is not the whole program.
      </p>
      {items.length ? (
        <div className="mt-2 border-t border-cc-line pt-1" data-not-determined-items={items.length}>
          <CcDisclosure title="What this analysis could not settle" count={items.length}>
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
          </CcDisclosure>
        </div>
      ) : null}
    </ObjectSection>
  );
}
