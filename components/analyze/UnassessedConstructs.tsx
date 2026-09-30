'use client';

import { ScanLine } from 'lucide-react';
import type { CoverageReport } from '@/lib/abap/coverage';
import { coverageCaveat } from '@/lib/abap/coverage';
import { CcTag } from '@/components/cc/Tag';
import CcDisclosure from '@/components/cc/Disclosure';
import CcTable from '@/components/cc/Table';

/**
 * The boundary of the question the engine answered.
 *
 * Deliberately not styled as a warning. These are not defects — nobody has
 * judged them either way, which is the entire point. Red here would trade a
 * false clean bill for a false accusation, and the finding list next door is
 * where actual severity lives.
 *
 * Renders nothing when coverage is complete. "We checked everything" is a claim
 * with its own burden of proof, and this engine cannot carry it.
 */
export default function UnassessedConstructs({ coverage }: { coverage: CoverageReport }) {
  const caveat = coverageCaveat(coverage);
  if (!caveat) return null;

  return (
    <section
      data-testid="unassessed-constructs"
      className="rounded-cc-card border border-cc-line bg-cc-surface-muted p-4"
    >
      <div className="flex items-start gap-3">
        <ScanLine size={18} className="mt-0.5 shrink-0 text-cc-ink-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="cc-text-h3 text-cc-ink">
            Outside this analysis
          </h3>
          <p className="mt-1 cc-text-body text-cc-ink">{caveat}</p>

          <ul className="mt-3 flex flex-wrap gap-2">
            {coverage.gaps.map((g) => (
              <li key={g.gap}>
                <CcTag>
                  {g.label} · {g.count}
                </CcTag>
              </li>
            ))}
          </ul>

          <div className="mt-3">
            <CcDisclosure title="Statements" count={coverage.unassessed.length}>
              <div className="mt-2">
                <CcTable
                  caption="Statements outside this analysis"
                  columns={[
                    { key: 'line', label: 'Line', numeric: true, width: '64px' },
                    { key: 'construct', label: 'Construct' },
                    { key: 'statement', label: 'Statement' },
                  ]}
                  rows={coverage.unassessed.map((u, i) => ({
                    key: `${u.gap}-${u.line}-${i}`,
                    cells: {
                      line: <span className="font-cc-mono text-cc-ink-muted">{u.line}</span>,
                      construct: u.label,
                      statement: <span className="font-cc-mono text-[12px] text-cc-ink-muted break-all">{u.snippet}</span>,
                    },
                  }))}
                />

                <dl className="mt-4 space-y-3">
                  {coverage.gaps.map((g) => {
                    const why = coverage.unassessed.find((u) => u.gap === g.gap)?.why;
                    return (
                      <div key={g.gap}>
                        <dt className="cc-text-identifier text-cc-ink">{g.label}</dt>
                        <dd className="mt-1 cc-text-cell text-cc-ink-muted">{why}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            </CcDisclosure>
          </div>
        </div>
      </div>
    </section>
  );
}
