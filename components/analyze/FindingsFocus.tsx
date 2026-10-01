'use client';

import React from 'react';
import { CcSeverity } from '@/components/cc/Identifier';
import { normaliseSeverity } from '@/lib/severity';
import { calmTitle, type FocusPick } from '@/lib/findings-view';

/**
 * "Look here first" — the two or three findings that matter most, picked by
 * the fixed rules of `lookHereFirst` (`lib/findings-view.ts`), each saying why
 * it was picked, what it means (the engine's own words), where it is and what
 * SAP names as its successor.
 *
 * Styling is deliberately minimal and token-only: the owner is choosing the
 * visual direction for all seven tools, and this component carries the
 * content and the order, not a look.
 */
export default function FindingsFocus({ picks, onShow }: { picks: readonly FocusPick[]; onShow?: (kind: string) => void }) {
  if (picks.length === 0) {
    return (
      <section data-findings-focus="none" aria-labelledby="findings-focus-title">
        <h3 id="findings-focus-title" className="m-0 cc-text-h3 text-cc-ink">Look here first</h3>
        <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
          No critical or high finding, and none of the kinds that change data or transactions — nothing stands out
          above the rest.
        </p>
      </section>
    );
  }
  return (
    <section data-findings-focus={picks.length} aria-labelledby="findings-focus-title">
      <h3 id="findings-focus-title" className="m-0 cc-text-h3 text-cc-ink">Look here first</h3>
      <ol className="m-0 mt-2 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-3">
        {picks.map(({ row, reason }) => {
          const ef = row.finding;
          const sev = normaliseSeverity(ef.severity);
          return (
            <li
              key={`${ef.kind}-${ef.objectName ?? ef.title}`}
              data-focus-kind={ef.kind}
              className="flex min-w-0 flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                {sev ? <CcSeverity value={sev} /> : null}
                {reason ? <span className="cc-text-meta text-cc-ink-muted">{reason}</span> : null}
              </div>
              <p className="m-0 cc-text-cell font-semibold text-cc-ink">{calmTitle(ef.title)}</p>
              {ef.cleanCoreImpact ? (
                <p className="m-0 cc-text-cell text-cc-ink-muted line-clamp-3">{ef.cleanCoreImpact}</p>
              ) : null}
              <dl className="m-0 mt-auto grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 cc-text-meta">
                <dt className="text-cc-ink-muted">{row.lines.length === 1 ? 'Line' : 'Lines'}</dt>
                <dd className="m-0 font-cc-mono text-cc-ink">{row.lines.join(', ')}</dd>
                <dt className="text-cc-ink-muted">SAP successor</dt>
                <dd className="m-0 break-all text-cc-ink">{ef.sapReplacement?.objectName ?? 'None named'}</dd>
              </dl>
              {onShow ? (
                <button
                  type="button"
                  onClick={() => onShow(ef.kind)}
                  className="self-start cc-text-meta font-semibold text-cc-ink underline-offset-2 hover:underline"
                >
                  Show in the list<span className="sr-only">: {calmTitle(ef.title)}</span>
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
