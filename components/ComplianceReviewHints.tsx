'use client';

import { ClipboardList } from 'lucide-react';
import {
  CONCERN_COPY,
  TOUCH_LABEL,
  complianceReviewHints,
  examinedTablesFromCoupling,
  type ComplianceReviewReport,
} from '@/lib/compliance-review-hints';
import type { DataCouplingEntry } from '@/lib/types';

/**
 * What the tables this code touches may mean for a compliance review — roadmap
 * 7.7, the screen half.
 *
 * **The rule this panel is built around: it never classifies anybody's data.**
 * It says which tables the code touches, what SAP keeps in tables of those
 * names, and that tables of that kind *often* carry data somebody has to think
 * about. It does not say that these rows do. The difference is not a matter of
 * politeness — "this table contains personal data" is a statement about the
 * reader's system that this product has no way of checking, and it would be
 * false every time the rows turn out to be test data, a company rather than a
 * person, or nothing at all.
 *
 * Three things follow from that, and each of them is held by
 * `tests/compliance-review-hints-guard.spec.ts`:
 *
 *   1. **The chips are instructions, not categories.** A badge reading
 *      "Personal data" beside PA0002 is a classification whatever the paragraph
 *      under it says, because the eye takes the badge and leaves the paragraph.
 *      "Check for personal data" cannot be read as a finding.
 *   2. **The verb is the one the engine recorded.** A `TABLES:` declaration is
 *      not a read, so the row says "depends on the definition of" and not
 *      "reads". Overstating the access would put a false sentence in the one
 *      panel whose whole point is not having any.
 *   3. **The panel never reads as a clean bill.** It ends by counting what it
 *      did *not* recognise, out loud, and it renders even when it recognised
 *      nothing at all — because "no hint" and "nothing here" are different
 *      statements and only the first one is true.
 *
 * It lives at `components/` rather than `components/analyze/` on purpose: the
 * same panel answers the "Nachweise & Kontrollen" layer of the workspace
 * (roadmap 6.2) from the same `dataCoupling`, and a module that moves after a
 * guard has named its path is three of this repository's red CI days.
 *
 * **No model, by construction.** Everything rendered here is either a table
 * name out of the stored analysis or fixed text from
 * `lib/compliance-review-hints.ts`. There is no `fetch` in either file.
 */

export const COMPLIANCE_HINT_TITLE = 'Hints for your compliance review';

export const COMPLIANCE_HINT_LEAD =
  'This is a hint, not a classification. Clean-Core.io has read which tables this code touches and looked ' +
  'their names up against what SAP keeps in tables of that name. It has not read a single row, so it cannot ' +
  'tell you what your rows actually hold, and it knows only a handful of table families, so it will miss ' +
  'things. Read the tables below and decide for yourself, with the people who answer for data protection, ' +
  'tax and audit in your organisation.';

export const COMPLIANCE_HINT_METHOD =
  'No model was asked for any of this. The table names come from the analysis of your code; every sentence ' +
  'around them is fixed text.';

export const COMPLIANCE_HINT_NOTHING_MATCHED_TITLE =
  'No table here matches a family this product knows';

export const COMPLIANCE_HINT_NOTHING_MATCHED_LEAD =
  'Clean-Core.io knows a handful of SAP table families — HR infotypes, central addresses, the user master, ' +
  'business partners, accounting documents, invoices, tax configuration and the change history. None of the ' +
  'tables this code touches is one of them. That is a gap in the hint and not a clean result: a table of ' +
  'your own says nothing about its content by its name, and nothing here has read a row. Whether any of it ' +
  'falls under data protection, tax or audit rules is still yours to establish.';

/**
 * The closing count, in words.
 *
 * Written as a sentence rather than a number beside a tick, because the number
 * that matters is the one the product could *not* say anything about, and a
 * reader takes "6 of 21" as a score unless it is spelled out what the other
 * fifteen mean.
 */
export function complianceCoverageLine(report: ComplianceReviewReport): string {
  const recognised = report.examined - report.unrecognised.length;
  const tables = (n: number) => `${n} ${n === 1 ? 'table' : 'tables'}`;
  if (report.unrecognised.length === 0) {
    return (
      `Every one of the ${tables(report.examined)} this code touches matched a family. That still says ` +
      'nothing about what is in them: the match is on the name SAP gave the table, not on a single row of ' +
      'yours.'
    );
  }
  return (
    `Clean-Core.io recognised ${recognised} of the ${tables(report.examined)} this code touches. It has no ` +
    `hint for the other ${report.unrecognised.length} — including every table of your own, whose name says ` +
    'nothing about its content. That is a gap in the hint, not a clean result.'
  );
}

export default function ComplianceReviewHints({
  dataCoupling,
}: {
  dataCoupling?: DataCouplingEntry[];
}) {
  const report = complianceReviewHints(examinedTablesFromCoupling(dataCoupling));

  // Nothing was analysed at all: there is no question yet, so there is nothing
  // to answer. This is the one case where silence is honest — it is not "no
  // hints for these tables", it is "no tables".
  if (report.examined === 0) return null;

  const nothingMatched = report.hints.length === 0;

  return (
    <section
      data-compliance-hints=""
      aria-labelledby="compliance-review-hints-title"
      className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      <div className="flex items-start gap-3">
        <ClipboardList className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-5">
          <div className="space-y-2">
            <h3
              id="compliance-review-hints-title"
              data-compliance-hints-title
              className="text-base font-bold text-slate-900 tracking-tight"
            >
              {nothingMatched ? COMPLIANCE_HINT_NOTHING_MATCHED_TITLE : COMPLIANCE_HINT_TITLE}
            </h3>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              {nothingMatched ? COMPLIANCE_HINT_NOTHING_MATCHED_LEAD : COMPLIANCE_HINT_LEAD}
            </p>
          </div>

          {report.hints.length > 0 && (
            <ul className="space-y-4 m-0 list-none p-0">
              {report.hints.map((hint) => (
                <li
                  key={hint.family}
                  data-compliance-hint={hint.family}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 sm:px-5"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                    <h4 className="text-sm font-bold text-slate-900">{hint.title}</h4>
                    {hint.concerns.map((concern) => (
                      <span
                        key={concern}
                        data-compliance-concern={concern}
                        className="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-[11px] font-bold text-slate-700"
                      >
                        {CONCERN_COPY[concern].label}
                      </span>
                    ))}
                  </div>

                  <ul className="mt-3 space-y-1 m-0 list-none p-0">
                    {hint.tables.map((table) => (
                      // Inline, not a flex row: a flex container blockifies its
                      // children, and "This code reads" and "PA0002" then reach
                      // a reader — and `innerText` — as two separate lines.
                      <li
                        key={table.table}
                        data-compliance-table={table.table}
                        className="text-xs text-slate-600"
                      >
                        This code {TOUCH_LABEL[table.touch]}{' '}
                        <code className="font-mono text-[11px] font-bold text-slate-900">
                          {table.table}
                        </code>
                        {table.lines.length > 0 && (
                          <span className="font-mono text-[11px] text-slate-500">
                            {' · '}
                            {table.lines.length === 1 ? 'line' : 'lines'} {table.lines.join(', ')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>

                  <p className="mt-3 text-xs text-slate-600 leading-relaxed">{hint.sapKeeps}</p>

                  <p data-compliance-bridge className="mt-2 text-xs text-slate-600 leading-relaxed">
                    Tables of this kind often carry{' '}
                    {hint.concerns.map((concern, index) => (
                      <span key={concern}>
                        {index > 0 && (index === hint.concerns.length - 1 ? ' and ' : ', ')}
                        {CONCERN_COPY[concern].carries}
                      </span>
                    ))}
                    . Whether the rows in your system do is not something Clean-Core.io can see — it has read
                    the names, never the data.
                  </p>

                  {hint.concerns.map((concern) => (
                    <p
                      key={concern}
                      data-compliance-depth={concern}
                      className="mt-2 text-xs text-slate-600 leading-relaxed"
                    >
                      {CONCERN_COPY[concern].depth}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}

          <p data-compliance-coverage className="text-xs font-semibold text-slate-700 leading-relaxed">
            {complianceCoverageLine(report)}
          </p>

          {report.unrecognised.length > 0 && (
            <p data-compliance-unrecognised className="text-xs text-slate-500 leading-relaxed">
              Without a hint:{' '}
              <span className="font-mono text-[11px] text-slate-600">
                {report.unrecognised.join(', ')}
              </span>
            </p>
          )}

          <p className="text-xs text-slate-500 leading-relaxed">{COMPLIANCE_HINT_METHOD}</p>
        </div>
      </div>
    </section>
  );
}
