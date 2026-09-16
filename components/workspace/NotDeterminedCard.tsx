'use client';

import React from 'react';
import CcCard from '@/components/cc/Card';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import type { NotDetermined } from '@/lib/workspace-model';

/**
 * What the engine could not work out — `DESIGN.md` §5.1, §5.5, roadmap 1.4.
 *
 * *"Der Zweifel wird sofort beantwortet."* For a sceptical audience this area
 * is part of the moment, not an apology for it: the tool claims nothing it does
 * not know, and says so in a place of its own. **An absence is shown as a
 * thing** — that is the whole point of the row that asked for it.
 *
 * Three states, three different sentences, and keeping them apart is the work:
 *
 *   - **no source** — nothing has been uploaded. Nothing was stepped over, and
 *     nothing was assessed either. Saying "0" here would report a result of an
 *     analysis that never ran.
 *   - **none** — every construct fell inside the detectors that ran. Stated as
 *     the boundary of the question the engine answered, never as a clean bill:
 *     `lib/abap/coverage.ts` exists because "no findings" and "nothing to find"
 *     are different statements and only one of them was true.
 *   - **some** — each with the reason it could not be judged and its line. The
 *     reason is a limit of the engine, never an accusation against the code.
 *
 * The chip is *Not determined* from the one provenance list — neutral, outline,
 * with a question mark. Never green, never red: nothing failed here.
 */
export default function NotDeterminedCard({ data }: { data: NotDetermined }) {
  return (
    <CcCard
      title="Not determined"
      count={data.noSource ? undefined : data.count}
      meta={<CcProvenanceChip value="not-determined" />}
    >
      {data.noSource ? (
        <p
          data-not-determined-state="no-source"
          className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted"
        >
          No source has been staged, so nothing has been assessed and nothing has been stepped over.
          This is not a result.
        </p>
      ) : data.count === 0 ? (
        <p
          data-not-determined-state="none"
          className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted"
        >
          Every construct in this source falls inside the detectors that ran. That is the boundary of
          the question the engine answered — not a clean bill of health.
        </p>
      ) : (
        <ul data-not-determined-state="some" className="m-0 list-none space-y-2.5 p-0">
          {data.items.map((item, i) => (
            <li
              key={`${item.anchor}-${i}`}
              data-not-determined-item=""
              className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-cc-ink">{item.label}</span>
                <CcAnchor label={`Source line ${item.anchor}`}>{item.anchor}</CcAnchor>
              </div>
              <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
                {item.why}
              </p>
            </li>
          ))}
        </ul>
      )}
    </CcCard>
  );
}
