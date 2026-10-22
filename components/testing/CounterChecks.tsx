'use client';

import React, { useMemo } from 'react';
import CcDisclosure from '@/components/cc/Disclosure';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { deriveCounterCheckScenarios } from '@/lib/abap/counter-check';

/** How many scenarios the list opens with; the rest are counted. */
const SHOWN = 24;

/**
 * Counter-checks for the business, without ABAP — roadmap 7.3, moved here
 * from the IT view's *Standard fit* section when that table was removed
 * (owner decision 22.10.2026): they say how a business department checks a
 * rule, which is testing, not a comparison with SAP standard.
 *
 * Read from the source the active run signed, with the rules of the run's
 * engine (`deriveCounterCheckScenarios`): every decision as two scenarios —
 * one where the rule's test holds and the counter-check where it does not —
 * with the record somebody has to prepare. A scenario is a question, never a
 * verdict: nothing here has run.
 */
export default function CounterChecks({ source, engineVersion }: { source: string | null | undefined; engineVersion: string | null }) {
  const read = useMemo(() => {
    try {
      return deriveCounterCheckScenarios(typeof source === 'string' ? source : '', engineVersion);
    } catch {
      return null;
    }
  }, [source, engineVersion]);
  if (!read || read.noSource || read.scenarios.length === 0) return null;
  const shown = read.scenarios.slice(0, SHOWN);
  return (
    <div data-counter-checks={read.scenarios.length} className="mt-5 border-t border-cc-line pt-4">
      <h3 className="m-0 flex flex-wrap items-center gap-2 cc-text-h3 text-cc-ink">
        Counter-checks for the business, without ABAP
        <CcProvenanceChip value="reconstructed" />
      </h3>
      <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
        {read.counts.scenarios} scenarios for {read.counts.rules} rules — each rule once where it applies and once where it must not.
        {' '}A scenario says what to check and which record to prepare; nothing here has run.
      </p>
      <CcDisclosure title="Show the scenarios" count={read.counts.scenarios}>
        <ul className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
          {shown.map((s) => (
            <li key={s.id} data-counter-check={s.id} className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
              <p className="m-0 flex flex-wrap items-center gap-2 cc-text-cell font-semibold text-cc-ink">
                <CcAnchor tone="unlinked">{s.id}</CcAnchor>
                <CcAnchor tone="unlinked">{s.ruleId}</CcAnchor>
                <span>{s.arm === 'applies' ? 'Where the rule applies' : 'Counter-check: where it must not apply'}</span>
              </p>
              <dl className="m-0 mt-2 grid gap-1 cc-text-cell text-cc-ink">
                <div><dt className="inline font-semibold">Given </dt><dd className="inline m-0">{s.given.text}</dd></div>
                <div><dt className="inline font-semibold">When </dt><dd className="inline m-0">{s.when.text}</dd></div>
                <div><dt className="inline font-semibold">Then </dt><dd className="inline m-0">{s.then.text}</dd></div>
              </dl>
              {s.data.length > 0 ? (
                <p className="m-0 mt-2 cc-text-meta text-cc-ink-muted">
                  Record to prepare: {s.data.map((d) => `${d.field ?? 'a value'} ${d.requirement}`).join('; ')}
                </p>
              ) : null}
              {s.blocked ? <p className="m-0 mt-1 cc-text-meta text-cc-ink-muted">Not runnable as written: {s.blocked.detail}</p> : null}
            </li>
          ))}
        </ul>
        {read.scenarios.length > SHOWN ? (
          <p className="m-0 mt-2 cc-text-meta text-cc-ink-muted">{read.scenarios.length - SHOWN} more scenarios are not listed here.</p>
        ) : null}
      </CcDisclosure>
    </div>
  );
}
