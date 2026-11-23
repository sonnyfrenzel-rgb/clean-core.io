'use client';

import React, { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import CcTable from '@/components/cc/Table';
import { deriveCounterCheckScenarios, type CounterCheckScenario } from '@/lib/abap/counter-check';
import { counterChecksLine } from '@/lib/rule-counts';

/** How many rules the table opens with; the rest are one click away ("Show all"). */
const SHOWN = 5;

const COLUMNS = [
  { key: 'rule', label: 'Rule', width: '96px' },
  { key: 'applies', label: 'Where it applies' },
  { key: 'counter', label: 'Counter-check: where it must not' },
  { key: 'prepare', label: 'Prepare' },
] as const;

/**
 * Acceptance checks for a business tester (ADR-131 (4), mock-up S7) — roadmap 7.3's counter-checks, moved here from
 * the IT view's *Standard fit* section (owner decision 22.10.2026), as one plain table: per rule, the case where it
 * applies, the counter-check where it must not, and the record to prepare. Five rules shown, the rest on a click.
 *
 * Read from the source the active run signed, with the rules of the run's engine (`deriveCounterCheckScenarios`). A
 * check is a question, never a verdict: nothing here has run, and nothing records it (no stored field).
 */
export default function CounterChecks({
  source,
  engineVersion,
  onCount,
}: {
  source: string | null | undefined;
  engineVersion: string | null;
  /** Hands the number of rules with checks to the page, for its "On this page" bar. */
  onCount?: (rules: number) => void;
}) {
  const read = useMemo(() => {
    try {
      return deriveCounterCheckScenarios(typeof source === 'string' ? source : '', engineVersion);
    } catch {
      return null;
    }
  }, [source, engineVersion]);
  const rows = useMemo(() => {
    const byRule = new Map<string, { applies: CounterCheckScenario | null; counter: CounterCheckScenario | null }>();
    for (const s of read?.scenarios ?? []) {
      const row = byRule.get(s.ruleId) ?? { applies: null, counter: null };
      if (s.arm === 'applies') row.applies ??= s;
      else row.counter ??= s;
      byRule.set(s.ruleId, row);
    }
    return [...byRule.entries()];
  }, [read]);
  const count = rows.length;
  React.useEffect(() => {
    onCount?.(count);
  }, [count, onCount]);
  if (!read || read.noSource || read.scenarios.length === 0) {
    return <p className="m-0 cc-text-cell text-cc-ink-muted">The engine found no decision in the signed source to write a check for.</p>;
  }
  const arm = (s: CounterCheckScenario | null, mark: React.ReactNode) =>
    s ? (
      <>
        <span className="flex items-start gap-1">
          {mark}
          {s.when.text}
        </span>
        <span className="block text-cc-ink-muted">expect: {s.then.text}</span>
      </>
    ) : (
      <span className="text-cc-ink-muted">Not written</span>
    );
  const prepare = (s: CounterCheckScenario | null) =>
    s && s.data.length > 0 ? s.data.map((d) => `${d.field ?? 'a value'} ${d.requirement}`).join('; ') : 'Nothing special';
  return (
    <div data-counter-checks={read.scenarios.length}>
      <p className="m-0 mb-3 cc-text-cell text-cc-ink-muted">
        {counterChecksLine(read.counts.scenarios, read.counts.rules, read.counts.withoutScenario)}
      </p>
      <div data-acceptance-checks="">
        <CcTable
          caption="Acceptance checks, one rule per row"
          columns={COLUMNS}
          limit={SHOWN}
          rows={rows.map(([ruleId, { applies, counter }]) => ({
            key: ruleId,
            cells: {
              rule: <span data-counter-check={ruleId} className="font-cc-mono font-bold whitespace-nowrap">{ruleId}</span>,
              applies: arm(applies, <Check size={14} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />),
              counter: arm(counter, <X size={14} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />),
              prepare: <span className="text-cc-ink-muted">{prepare(applies ?? counter)}</span>,
            },
          }))}
        />
      </div>
    </div>
  );
}
