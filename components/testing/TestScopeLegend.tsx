'use client';

import React from 'react';
import { FlaskConical, Building2, Lock, HelpCircle } from 'lucide-react';
import CcCard from '@/components/cc/Card';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { SCOPE_WORD } from './scenario-detail';

/**
 * What can be tested where — once for the whole Testing stage (owner
 * 03.10.2026: "it must always be clear what we can test and what only works
 * outside").
 *
 * The three places match what the product really does (SECURITY.md §7):
 *
 *   - here, a mock run: the isolated runner executes `node:test` over a
 *     JavaScript/TypeScript suite against mocks — never ABAP — and its pass is
 *     *Demonstrated · mock*, not proof;
 *   - your SAP system: everything a mock cannot stand in for, and every ABAP
 *     Unit class, with what to do there;
 *   - a tenant: locked (`LIVE_TEST_EXECUTION`, G0:R0) — said plainly.
 *
 * "Not determined" is listed where a scenario can end up there: on a route whose
 * suite runs here, a scenario without a test carrying its id gets no result.
 *
 * `isAbapCloud` is null where no project is behind it (the demo): the legend
 * then speaks of both routes.
 */
export default function TestScopeLegend({
  isAbapCloud,
  tenantLocked,
}: {
  isAbapCloud: boolean | null;
  tenantLocked: boolean;
}) {
  const ENTRY = 'flex gap-3';
  const ICON = 'mt-0.5 shrink-0 text-cc-ink-muted';
  const HEAD = 'm-0 flex flex-wrap items-center gap-2 cc-text-cell font-semibold text-cc-ink';
  const BODY = 'm-0 mt-1 cc-text-cell text-cc-ink-muted leading-relaxed';
  return (
    <section id="testing-scope" data-testing-scope-legend="" aria-labelledby="testing-scope-title" className="scroll-mt-32">
      <CcCard title={<span id="testing-scope-title">What can be tested where</span>} level={2}>
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          <li data-scope-entry="here-mock" className={ENTRY}>
            <FlaskConical size={16} aria-hidden={true} className={ICON} />
            <div className="min-w-0">
              <p className={HEAD}>
                {SCOPE_WORD['here-mock']}
                <CcProvenanceChip value="demonstrated-mock" />
              </p>
              <p className={BODY}>
                In Clean-Core.io{"'"}s isolated runner, against mocks — for a JavaScript or TypeScript suite (the
                side-by-side route). A pass here is demonstrated against mocks, not proof in your system.
                {isAbapCloud === true ? ' Not for this project: its suite is an ABAP Unit class.' : null}
              </p>
            </div>
          </li>
          <li data-scope-entry="your-system" className={ENTRY}>
            <Building2 size={16} aria-hidden={true} className={ICON} />
            <div className="min-w-0">
              <p className={HEAD}>Only in your SAP system</p>
              <p className={BODY}>
                ABAP Unit, real data and customizing, authorisations, real BAPI behaviour, update tasks and commits,
                performance and end-to-end runs. What to do: copy the test class into ADT on your development system and
                run ABAP Unit there.
              </p>
            </div>
          </li>
          <li data-scope-entry="tenant" className={ENTRY}>
            <Lock size={16} aria-hidden={true} className={ICON} />
            <div className="min-w-0">
              <p className={HEAD}>{tenantLocked ? 'Tenant — locked' : 'Tenant'}</p>
              <p className={BODY}>
                {tenantLocked
                  ? `Running generated tests on a connected tenant is locked until the isolated live runner has passed its review. ${
                      isAbapCloud === null ? 'In a project, the tenant section' : 'The tenant section of this tool'
                    } only checks the connection.`
                  : 'Running generated tests on a connected tenant is open for this release.'}
              </p>
            </div>
          </li>
          {isAbapCloud !== true ? (
            <li data-scope-entry="not-determined" className={ENTRY}>
              <HelpCircle size={16} aria-hidden={true} className={ICON} />
              <div className="min-w-0">
                <p className={HEAD}>{SCOPE_WORD['not-determined']}</p>
                <p className={BODY}>
                  A scenario the suite has no test for, by its ID: a run gives it no result, so where it can be tested is
                  not said.
                </p>
              </div>
            </li>
          ) : null}
        </ul>
      </CcCard>
    </section>
  );
}
