'use client';

import React, { useMemo } from 'react';
import EconomicsObjectPage from '@/components/tco/EconomicsObjectPage';
import { initialCostAssumptions, type OptionProposals } from '@/components/tco/OptionComparison';
import {
  costComparison,
  proposeEffort,
  proposeMaintenanceBaseline,
  type CostAssumptions,
  type CostOption,
} from '@/lib/cost-assumptions';
import { restoreAssumptions } from '@/lib/economics-record';

/**
 * Economics in the demo (ADR-128): the same object page as a project's tool (`EconomicsObjectPage`), so the demo
 * cannot show a page or an arithmetic the product does not have. The figures start empty on purpose (roadmap 0.4):
 * no currency, no day rate, no period, so no amount — until the reader states their own or asks for typical
 * assumptions (3.5.1, ADR-144), which stay marked as typical. What they enter lives in
 * this browser's `localStorage` with the rest of the demo and nowhere else; nothing is saved to anyone, nothing is
 * signed, and no model is asked.
 */
export default function DemoEconomics({
  loc,
  scoreBefore,
  route,
  value,
  onChange,
}: {
  loc: number;
  scoreBefore: number;
  /** The route the engine proposes for the example, in words. */
  route: string | null;
  /** The demo's assumptions as stored in this browser, or `null` before anything is entered. */
  value: CostAssumptions | null;
  onChange: (next: CostAssumptions) => void;
}) {
  // A state stored by an earlier version may hold a half-entered pair as null: read back as the page holds it.
  const assumptions = useMemo(() => (value ? restoreAssumptions(value) : initialCostAssumptions()), [value]);
  const comparison = useMemo(() => costComparison(assumptions), [assumptions]);
  const proposals: OptionProposals = { effort: proposeEffort(loc), baseline: proposeMaintenanceBaseline(loc, scoreBefore) };
  const patch = (p: Partial<CostAssumptions>) => onChange({ ...assumptions, ...p });
  const patchOption = (id: string, p: Partial<CostOption>) =>
    onChange({ ...assumptions, options: assumptions.options.map((o) => (o.id === id ? { ...o, ...p } : o)) });

  return (
    <div data-demo-economics="">
      <EconomicsObjectPage
        assumptions={assumptions}
        comparison={comparison}
        proposals={proposals}
        loc={loc}
        sourceLoc={loc}
        score={scoreBefore}
        scoreStale={false}
        route={route}
        editable
        onPatch={patch}
        onPatchOption={patchOption}
        managementHref={null}
        decisionWords="Decision: not taken in the demo. A project of your own takes it in Decide."
        saved={
          <p className="m-0 cc-text-cell text-cc-ink-muted" data-demo-economics-saved="">
            Kept in this browser only, for the demo. Nothing is saved to an account, and nothing is signed.
          </p>
        }
      />
    </div>
  );
}
