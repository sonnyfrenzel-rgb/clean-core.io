import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { comparisonChecklist, forecastChecklist, openRows } from '../lib/economics-checklist';
import { initialCostAssumptions } from '../components/tco/OptionComparison';
import { costComparison, proposeEffort, type CostAssumptions } from '../lib/cost-assumptions';

/**
 * Economics as one checklist (mockup s5 "What the comparison still needs",
 * audit 01.10.2026 row 7). The rows are read from the comparison's own gaps, so
 * the list and the refusal can never disagree: a row is open exactly while the
 * comparison names no winner because of it.
 */
const rowsOf = (a: CostAssumptions) => Object.fromEntries(comparisonChecklist(a).map((r) => [r.key, r]));

function complete(): CostAssumptions {
  const p = proposeEffort(2000)!;
  const base = initialCostAssumptions();
  return {
    ...base,
    currency: 'CHF',
    devDayRate: 800,
    testDayRate: 600,
    horizonYears: 5,
    releaseCadence: { perYear: 2, confirmed: true },
    options: base.options.map((o) => ({
      ...o,
      oneOff: p.oneOff,
      perRelease: p.perRelease,
      effortSource: 'proposal-confirmed' as const,
      maintenanceBaselinePerYear: o.id === 'standard' ? null : { devDays: 1, testDays: 0 },
      upgradeDelay: o.id === 'do-nothing' ? { state: 'stated' as const, value: { releasesDeferred: 2 } } : null,
    })),
  };
}

test('an empty stage: every comparison row is open, nothing is done by default', () => {
  const rows = comparisonChecklist(initialCostAssumptions());
  expect(rows.map((r) => r.key)).toEqual([
    'currency', 'dev-rate', 'test-rate', 'horizon', 'cadence', 'one-off', 'per-release', 'baseline', 'upgrade-delay',
  ]);
  expect(rows.every((r) => r.status === 'open')).toBe(true);
  expect(openRows(rows)).toHaveLength(9);
});

test('a cadence nobody confirmed is a draft, not done', () => {
  const a = { ...initialCostAssumptions(), releaseCadence: { perYear: 2, confirmed: false } };
  expect(rowsOf(a).cadence).toMatchObject({ status: 'draft', detail: 'confirm it' });
});

test('one option filled in is partial, and names the ones still missing', () => {
  const p = proposeEffort(1000)!;
  const base = initialCostAssumptions();
  const a = { ...base, options: base.options.map((o) => (o.id === 'keep' ? { ...o, oneOff: p.oneOff } : o)) };
  expect(rowsOf(a)['one-off']).toEqual({
    key: 'one-off',
    label: 'One-time effort per option, as a range',
    status: 'partial',
    detail: 'missing for Do nothing, Move to standard',
  });
});

test('complete figures: every row done, and the comparison agrees', () => {
  const a = complete();
  const rows = comparisonChecklist(a);
  expect(openRows(rows), JSON.stringify(rows)).toEqual([]);
  expect(costComparison(a).coverage.state).not.toBe('rejected');
});

test('any open row means the comparison refuses, and the other way round', () => {
  const full = complete();
  const variants: CostAssumptions[] = [
    { ...full, currency: '' },
    { ...full, devDayRate: null },
    { ...full, horizonYears: null },
    { ...full, releaseCadence: { perYear: 2, confirmed: false } },
    { ...full, options: full.options.map((o) => (o.id === 'keep' ? { ...o, perRelease: null } : o)) },
    { ...full, options: full.options.map((o) => (o.id === 'do-nothing' ? { ...o, maintenanceBaselinePerYear: null } : o)) },
    { ...full, options: full.options.map((o) => (o.id === 'do-nothing' ? { ...o, upgradeDelay: null } : o)) },
  ];
  for (const v of variants) {
    expect(openRows(comparisonChecklist(v)).length, JSON.stringify(v).slice(0, 80)).toBeGreaterThan(0);
    expect(costComparison(v).winner).toBeNull();
  }
});

test('the forecast rows: the line count from the source is done, the starting values are assumed', () => {
  const rows = forecastChecklist({ loc: 669, sourceLoc: 669, oneTimeCost: null, upgradesStated: false, featurePacksStated: false });
  expect(rows.map((r) => [r.key, r.status, r.detail ?? null])).toEqual([
    ['loc', 'done', 'from your source'],
    ['investment', 'open', null],
    ['upgrades', 'assumed', null],
    ['feature-packs', 'assumed', null],
  ]);
  // An assumed starting value does not keep an amount away, so it is not counted as open.
  expect(openRows(rows).map((r) => r.key)).toEqual(['investment']);
});

test('the stage asks for each day rate once, and shows no machine string', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '..', 'app/(app)/project/[projectId]/tco/page.tsx'), 'utf8');
  const panel = fs.readFileSync(path.resolve(__dirname, '..', 'components/tco/OptionComparison.tsx'), 'utf8');
  const both = page + panel;
  expect((both.match(/'data-cost-field': 'dev-day-rate'|data-cost-field="dev-day-rate"/g) || []).length).toBe(1);
  expect((both.match(/'data-cost-field': 'test-day-rate'|data-cost-field="test-day-rate"/g) || []).length).toBe(1);
  expect(both).not.toContain('Interactive TCO model inputs');
  // No "(ADR-…)" in anything a reader sees: JSX text, not comments.
  const visible = both.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  expect(visible).not.toMatch(/\(ADR[-‑]\d+\)/);
  // The revision string stands one level deeper, under "Technical details".
  expect(panel.indexOf('title="Technical details"')).toBeGreaterThan(-1);
  expect(panel.indexOf('data-cost-revision')).toBeGreaterThan(panel.indexOf('title="Technical details"'));
});
