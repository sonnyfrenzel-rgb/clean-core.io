'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, ScanLine } from 'lucide-react';
import type { CoverageReport } from '@/lib/abap/coverage';
import { coverageCaveat } from '@/lib/abap/coverage';

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
  const [open, setOpen] = useState(false);

  const caveat = coverageCaveat(coverage);
  if (!caveat) return null;

  return (
    <section
      data-testid="unassessed-constructs"
      className="rounded-3xl border border-slate-300 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-900/40"
    >
      <div className="flex items-start gap-3">
        <ScanLine size={18} className="mt-0.5 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-950 dark:text-slate-100">
            Outside this analysis
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{caveat}</p>

          <ul className="mt-4 flex flex-wrap gap-2">
            {coverage.gaps.map((g) => (
              <li
                key={g.gap}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                {g.label}
                <span className="ml-1.5 text-slate-500 dark:text-slate-400">{g.count}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-gray-950 dark:text-slate-400 dark:hover:text-slate-100"
          >
            {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
            {open ? 'Hide the statements' : `Show all ${coverage.unassessed.length} statements`}
          </button>

          {open && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th scope="col" className="py-2 pr-3 font-medium">Line</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Construct</th>
                    <th scope="col" className="py-2 font-medium">Statement</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.unassessed.map((u, i) => (
                    <tr
                      key={`${u.gap}-${u.line}-${i}`}
                      className="border-b border-slate-200 align-top last:border-0 dark:border-slate-800"
                    >
                      <td className="py-2 pr-3 font-mono tabular-nums text-slate-500 dark:text-slate-400">{u.line}</td>
                      <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{u.label}</td>
                      <td className="py-2 font-mono text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                        {u.snippet}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <dl className="mt-5 space-y-3">
                {coverage.gaps.map((g) => {
                  const why = coverage.unassessed.find((u) => u.gap === g.gap)?.why;
                  return (
                    <div key={g.gap}>
                      <dt className="text-xs font-semibold text-gray-950 dark:text-slate-200">{g.label}</dt>
                      <dd className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{why}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
