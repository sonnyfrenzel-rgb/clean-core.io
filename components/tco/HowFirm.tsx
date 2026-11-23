import React from 'react';
import CcDisclosure from '@/components/cc/Disclosure';
import FamilyChip from '@/components/family/FamilyChip';
import type { Firmness } from '@/lib/economics-answer';

/**
 * "How firm is the answer?" (ADR-128 (3)): which of the reader's figures could change the order of the options if it
 * were wrong, and how wrong it would have to be — in plain words, one row per figure. The exact distances the
 * comparison solved (roadmap 7.12) stay in a detail under it. Nothing is sampled: a distance says where the order
 * flips, not how likely that is.
 */
export default function HowFirm({ firmness, priced }: { firmness: Firmness; priced: boolean }) {
  if (!priced) {
    return (
      <p className="m-0 flex flex-wrap items-center gap-2 cc-text-cell text-cc-ink" data-economics-firm="not-priced">
        <FamilyChip kind="not-determined" />
        Nothing to test yet: no option is priced.
      </p>
    );
  }
  return (
    <div data-economics-firm={firmness.tone}>
      {firmness.summary ? (
        <p className="m-0 flex flex-wrap items-start gap-2 rounded-cc-card bg-cc-surface-muted px-4 py-3 cc-text-cell text-cc-ink">
          {firmness.tone === 'none' ? <FamilyChip kind="not-determined" /> : null}
          <span>{firmness.summary}</span>
        </p>
      ) : null}
      {firmness.rows.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="doc-table w-full border-collapse" data-economics-firm-rows="">
            <thead className="border-b border-cc-line">
              <tr>
                <th scope="col" className="px-3 py-2 text-left cc-text-meta font-semibold text-cc-ink-muted">Your figure</th>
                <th scope="col" className="px-3 py-2 text-left cc-text-meta font-semibold text-cc-ink-muted">Now</th>
                <th scope="col" className="px-3 py-2 text-left cc-text-meta font-semibold text-cc-ink-muted">What it would take to change the order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cc-line">
              {firmness.rows.map((r) => (
                <tr key={r.field} data-economics-firm-row={r.field} data-economics-firm-edge={r.edge ? 'yes' : 'no'}>
                  <th scope="row" className="px-3 py-2 text-left align-top cc-text-cell font-semibold text-cc-ink">{r.name}</th>
                  <td data-label="Now" className="px-3 py-2 align-top cc-text-cell whitespace-nowrap text-cc-ink tabular-nums">{r.now}</td>
                  <td data-label="What it would take to change the order" className="px-3 py-2 align-top cc-text-cell text-cc-ink">
                    {r.edge ? (
                      <>
                        <b className="font-semibold">Only an extreme change.</b>{' '}
                        <span className="text-cc-ink-muted">{r.words.join(' ')}</span>
                      </>
                    ) : (
                      'Nothing. The order holds at any value.'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {firmness.exact.length > 0 ? (
        <div className="mt-3">
          <CcDisclosure title="Exact distances, as computed">
            <ul className="m-0 list-none space-y-2 p-0" data-cost-tipping-points="">
              {firmness.exact.map(({ leader, point }) => {
                const found = point.risesBy !== null || point.fallsBy !== null;
                return (
                  <li
                    key={`${leader}-${point.field}`}
                    data-cost-tipping-field={point.field}
                    data-cost-tipping-found={found ? 'yes' : 'no'}
                    className={`cc-text-cell ${found ? 'font-semibold text-cc-ink' : 'text-cc-ink-muted'}`}
                  >
                    {point.sentence}
                  </li>
                );
              })}
            </ul>
            <p className="m-0 mt-3 cc-text-meta text-cc-ink-muted">
              Each distance is solved from your figures, not sampled at a chosen spread. It says where the order flips, not how likely that is.
            </p>
          </CcDisclosure>
        </div>
      ) : null}
    </div>
  );
}
