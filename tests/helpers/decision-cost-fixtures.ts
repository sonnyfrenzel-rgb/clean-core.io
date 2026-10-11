import {
  COMPARISON_KIND,
  costAssumptionsRevision,
  emptyCostAssumptions,
  type CostAssumptions,
  type CostOption,
} from '../../lib/cost-assumptions';
import { ECONOMICS_RECORD_FORMAT, ECONOMICS_START_INPUTS, type EconomicsRecord } from '../../lib/economics-record';

/**
 * ADR-092 fixtures: two options at fixed rates, and the one figure that decides
 * which is the cheapest — shared by `decision-cost.spec.ts` and
 * `decision-card.spec.ts`. Rates 800/600, five years, two releases a year.
 */

export const option = (over: Partial<CostOption> & Pick<CostOption, 'id' | 'kind'>): CostOption => ({
  label: over.id,
  oneOff: { low: { devDays: 10, testDays: 4 }, high: { devDays: 14, testDays: 6 } },
  perRelease: { devDays: 2, testDays: 1 },
  maintenanceBaselinePerYear: null,
  upgradeDelay: null,
  effortSource: 'stated',
  ...over,
});

/** Keep: no one-off, a running effort and a baseline — 58 000 over five years at these rates. */
export const keep = option({
  id: 'keep',
  label: 'Keep',
  kind: COMPARISON_KIND,
  oneOff: { low: { devDays: 0, testDays: 0 }, high: { devDays: 0, testDays: 0 } },
  perRelease: { devDays: 1, testDays: 6 },
  maintenanceBaselinePerYear: { devDays: 2, testDays: 2 },
  upgradeDelay: { state: 'stated', value: { releasesDeferred: 2 } },
});

/** Rebuild, with a one-off effort in days — the one figure the tests move. */
export const rebuild = (low: number, high: number) =>
  option({ id: 'rebuild', label: 'Rebuild', kind: 'rebuild', oneOff: { low: { devDays: low, testDays: 4 }, high: { devDays: high, testDays: 6 } } });

export const assumptions = (rebuildOption: CostOption): CostAssumptions => ({
  ...emptyCostAssumptions(),
  currency: 'EUR',
  devDayRate: 800,
  testDayRate: 600,
  horizonYears: 5,
  releaseCadence: { perYear: 2, confirmed: true },
  options: [keep, rebuildOption],
});

export const record = (a: CostAssumptions, sequence?: number, at = '2026-10-10T09:00:00.000Z'): EconomicsRecord => ({
  formatVersion: ECONOMICS_RECORD_FORMAT,
  assumptions: a,
  inputs: { ...ECONOMICS_START_INPUTS },
  revision: costAssumptionsRevision(a),
  basis: { runId: 'run-1', score: 40 },
  savedAt: at,
  ...(sequence !== undefined ? { sequence, revisionAt: at } : {}),
});

/** Rebuild is cheapest (≈ 32–37 k against 58 k). */
export const REBUILD_CHEAPEST = assumptions(rebuild(10, 14));
/** Rebuild costs more than Keep (> 100 k). */
export const KEEP_CHEAPEST = assumptions(rebuild(100, 110));
/** Rebuild's range spans Keep's total: no cheapest option (`ranges-overlap`). */
export const OVERLAP = assumptions(rebuild(30, 60));
