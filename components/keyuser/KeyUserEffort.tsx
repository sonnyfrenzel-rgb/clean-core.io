'use client';

import React from 'react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { formatAmount, type CostOption } from '@/lib/cost-assumptions';
import { formatDays } from '@/lib/format';
import type { KeyUserStepList } from '@/lib/key-user-steps';
import { keyUserEffortLine, type KeyUserMode } from '@/lib/key-user-route';
import { KEY_USER_COST_OPTION } from '@/components/tco/OptionComparison';

/**
 * Economics for a key-user route (roadmap 3.0.19): configuration effort, not a
 * build. The engine counts what a key user configures and checks — steps,
 * entries, acceptance checks — and names no number of days and no amount
 * (ADR-035: every figure is the reader's). Key user is its own cost option
 * since the owner decision of October 2026 (`kind: 'keyuser'`, beside an
 * unchanged Rebuild): the days are the reader's, entered on that option as
 * key-user days, and priced with the reader's own test/key-user day rate; this
 * card shows that product only once both figures are stated.
 */
export default function KeyUserEffort({
  list,
  mode,
  currency,
  keyUserRate,
  option,
}: {
  list: KeyUserStepList;
  mode: Exclude<KeyUserMode, 'none'>;
  currency: string;
  keyUserRate: number | null;
  /** The key-user cost option as stated, if there is one. */
  option: CostOption | undefined;
}) {
  const range = option?.oneOff ?? null;
  const days = range && Number.isFinite(range.low.testDays) && Number.isFinite(range.high.testDays) ? { low: range.low.testDays, high: range.high.testDays } : null;
  const priced = days && typeof keyUserRate === 'number' && Number.isFinite(keyUserRate) && currency;
  return (
    <section
      aria-labelledby="ku-effort-title"
      data-key-user-effort={mode}
      className="mb-4 flex min-w-0 flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="ku-effort-title" className="m-0 cc-text-h3 text-cc-ink">Configuration effort, not a build</h3>
        <CcProvenanceChip value="reconstructed" />
      </div>
      <p className="m-0 cc-text-cell text-cc-ink" data-key-user-effort-counts="">
        {mode === 'whole' ? 'The decision is key-user extensibility. ' : 'Part of this program is key user. '}
        The engine counts {keyUserEffortLine(list)} in the key-user step list — what a key user configures and checks in the system.
      </p>
      <p className="m-0 cc-text-cell text-cc-ink-muted">
        How many days that takes is yours to state: enter them on the option {KEY_USER_COST_OPTION.label} — key-user days only, nothing is built in code
        {mode === 'whole' ? '' : '; the parts that stay code keep their days on Rebuild, which is unchanged'}. They are priced with your
        key-user day rate{typeof keyUserRate === 'number' && currency ? ` (${formatAmount(keyUserRate, currency)} per day)` : ', which step 2 asks for'}. Clean-Core.io proposes no number of days for key-user work.
      </p>
      {priced ? (
        <p className="m-0 cc-text-cell text-cc-ink" data-key-user-effort-priced="">
          As stated: {formatDays(days.low)}–{formatDays(days.high)} key-user days × {formatAmount(keyUserRate, currency)} ={' '}
          {formatAmount(days.low * keyUserRate, currency)} – {formatAmount(days.high * keyUserRate, currency)}.
        </p>
      ) : null}
    </section>
  );
}
