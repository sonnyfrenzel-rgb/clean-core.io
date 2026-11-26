import { test, expect } from '@playwright/test';
import { costComparison, proposeEffort, proposeMaintenanceBaseline, type CostAssumptions, type CostOption } from '../lib/cost-assumptions';
import { economicsAnswer } from '../lib/economics-answer';
import { economicsProgress } from '../lib/economics-record';
import { initialCostAssumptions, takeOverPatch, withKeyUserOption } from '../components/tco/OptionComparison';

/**
 * Owner report 26.11.2026: after "take over the proposals" Economics never counted as priced when the run offered the
 * key-user option, because Clean-Core.io proposes no days for it. Re-design kept sending the reader back to
 * Economics, and Design stayed out of reach. An untouched key-user option is left out of the comparison; a started one
 * counts with every rule of its own. Server-free.
 */
const LOC = 552;

function takenOver(): CostAssumptions {
  const base: CostAssumptions = {
    ...withKeyUserOption(initialCostAssumptions()),
    currency: 'EUR',
    devDayRate: 1000,
    testDayRate: 700,
    horizonYears: 5,
    releaseCadence: { perYear: 1, confirmed: true },
  };
  const proposals = { effort: proposeEffort(LOC), baseline: proposeMaintenanceBaseline(LOC, 40) };
  const options = base.options.map((o) => {
    if (o.kind === 'keyuser') return o;
    const p = { ...o, ...takeOverPatch(o, proposals) } as CostOption;
    return o.kind === 'do-nothing' ? { ...p, upgradeDelay: { state: 'stated' as const, value: { releasesDeferred: 0 } } } : p;
  });
  return { ...base, options };
}

test('every proposal taken over, the key-user option untouched: priced, and Economics is done', () => {
  const a = takenOver();
  expect(a.options.some((o) => o.kind === 'keyuser' && o.oneOff === null)).toBe(true);
  const all = costComparison(a);
  expect(all.coverage.state).not.toBe('rejected');
  const ans = economicsAnswer(a, all, 0);
  expect(ans.state).toBe('priced');
  expect(ans.unpriced).toBe(0);
  expect(economicsProgress({ assumptions: a, sourceLoc: LOC }).complete).toBe(true);
});

test('a key-user option the reader started counts again, with its own rules', () => {
  const a = takenOver();
  const started: CostAssumptions = {
    ...a,
    options: a.options.map((o) => (o.kind === 'keyuser' ? { ...o, oneOff: { low: { devDays: 0, testDays: 2 }, high: { devDays: 0, testDays: 4 } } } : o)),
  };
  // One-off stated, per release still missing: the option keeps the comparison open.
  const ans = economicsAnswer(started, costComparison(started), 0);
  expect(ans.state).not.toBe('priced');
  expect(ans.unpriced).toBe(1);
  expect(economicsProgress({ assumptions: started, sourceLoc: LOC }).complete).toBe(false);
});
