/**
 * Roadmap 3.0.20, step F8 — cost inputs per gap kind on the standard route
 * (owner decision 21.10.2026). Each kind of work is the reader's own days times
 * the reader's own day rate; nothing proposes a day or an amount. Appended to
 * the cost assumptions: an option without it keeps its canonical form, so every
 * stored revision and fingerprint stays what it was.
 *
 * Server-free: the model, the stored-record check, and the card rendered with
 * esbuild + renderToStaticMarkup.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  STANDARD_WORK,
  STANDARD_WORK_KINDS,
  canonicalCostAssumptions,
  costAssumptionsFingerprint,
  costAssumptionsCoverage,
  optionCost,
  emptyCostAssumptions,
  type CostAssumptions,
  type CostOption,
} from '../lib/cost-assumptions';
import { validateEconomicsPayload, ECONOMICS_START_INPUTS } from '../lib/economics-record';

const opt = (over: Partial<CostOption> & Pick<CostOption, 'id' | 'kind'>): CostOption => ({
  label: over.id,
  oneOff: { low: { devDays: 10, testDays: 4 }, high: { devDays: 14, testDays: 6 } },
  perRelease: { devDays: 2, testDays: 1 },
  maintenanceBaselinePerYear: null,
  upgradeDelay: null,
  effortSource: 'stated',
  ...over,
});

const keep = () =>
  opt({
    id: 'do-nothing',
    kind: 'do-nothing',
    oneOff: { low: { devDays: 0, testDays: 0 }, high: { devDays: 0, testDays: 0 } },
    perRelease: { devDays: 1, testDays: 6 },
    maintenanceBaselinePerYear: { devDays: 2, testDays: 2 },
    upgradeDelay: { state: 'stated', value: { releasesDeferred: 2 } },
  });

const assumptions = (options: CostOption[]): CostAssumptions => ({
  ...emptyCostAssumptions(),
  currency: 'EUR',
  devDayRate: 800,
  testDayRate: 600,
  horizonYears: 5,
  releaseCadence: { perYear: 2, confirmed: true },
  options,
});

test('without standard-route work the canonical form is the one it always was', () => {
  const a = assumptions([keep(), opt({ id: 'standard', kind: 'standard' })]);
  // The format of roadmap 7.4, written out by hand: seven parts per option, no eighth.
  expect(canonicalCostAssumptions(a)).toBe(
    'v1|currency=EUR|dev=800|test=600|horizon=5|cadence=2:confirmed|options=do-nothing:do-nothing:0/0~0/0:1/6:2/2:d2:stated,standard:standard:10/4~14/6:2/1:none:none:stated',
  );
  const empty = assumptions([keep(), opt({ id: 'standard', kind: 'standard', standardWork: {} })]);
  expect(costAssumptionsFingerprint(empty)).toBe(costAssumptionsFingerprint(a));
});

test('each kind is the reader\'s days at the reader\'s rate — once, or per release', () => {
  const plain = opt({ id: 'standard', kind: 'standard' });
  const withWork = opt({ id: 'standard', kind: 'standard', standardWork: { workshop: 4, decommissioning: 2, 'key-user-upkeep': 1 } });
  const a = assumptions([keep(), withWork]);
  expect(canonicalCostAssumptions(a)).toContain(':sw=workshop/4;decommissioning/2;key-user-upkeep/1');
  expect(costAssumptionsFingerprint(a)).not.toBe(costAssumptionsFingerprint(assumptions([keep(), plain])));

  const before = optionCost(a, plain);
  const after = optionCost(a, withWork);
  // workshop: 4 key-user days × 600; decommissioning: 2 developer days × 800.
  expect(after.oneOff!.low - before.oneOff!.low).toBe(4 * 600 + 2 * 800);
  expect(after.oneOff!.high - before.oneOff!.high).toBe(4 * 600 + 2 * 800);
  // upkeep: 1 key-user day × 600 per release, 2 releases a year over 5 years.
  expect(after.runningTotal! - before.runningTotal!).toBe(600 * 10);
});

test('the work belongs to "Move to SAP standard" only, and every figure is a figure', () => {
  const onRebuild = assumptions([keep(), opt({ id: 'rebuild', kind: 'rebuild', standardWork: { training: 3 } })]);
  expect(costAssumptionsCoverage(onRebuild).gaps.map((g) => g.code)).toContain('option-standard-work-unexpected');
  const negative = assumptions([keep(), opt({ id: 'standard', kind: 'standard', standardWork: { training: -1 } })]);
  const gap = costAssumptionsCoverage(negative).gaps.find((g) => g.code === 'amount-invalid')!;
  expect(gap.subject).toContain('training days');
});

test('nothing proposes a day: every kind is a label, a rate and a timing — no figure', () => {
  for (const k of STANDARD_WORK_KINDS) {
    const meta = STANDARD_WORK[k] as unknown as Record<string, unknown>;
    expect(Object.values(meta).some((v) => typeof v === 'number'), k).toBe(false);
  }
  expect(STANDARD_WORK_KINDS).toEqual(
    expect.arrayContaining(['key-user-gap', 'process-change', 'organisational-change']),
  );
});

test('the stored record takes known kinds only, drops an empty set and refuses a bad figure', () => {
  const payload = (standardWork: unknown) => ({
    assumptions: assumptions([keep(), { ...opt({ id: 'standard', kind: 'standard' }), standardWork } as CostOption]),
    inputs: ECONOMICS_START_INPUTS,
  });
  const ok = validateEconomicsPayload(payload({ workshop: 4, 'key-user-gap': 6 }));
  expect(ok.ok).toBe(true);
  if (ok.ok) expect(ok.value.assumptions.options[1].standardWork).toEqual({ workshop: 4, 'key-user-gap': 6 });
  const empty = validateEconomicsPayload(payload({}));
  expect(empty.ok && 'standardWork' in empty.value.assumptions.options[1]).toBe(false);
  expect(validateEconomicsPayload(payload({ lunch: 2 })).ok).toBe(false);
  const bad = validateEconomicsPayload(payload({ training: -2 }));
  expect(bad.ok).toBe(false);
  if (!bad.ok) expect(bad.error).toContain('the days of a step on the standard route');
  // An option stored before 3.0.20 has no such key and reads as it was stored.
  const old = validateEconomicsPayload({ assumptions: assumptions([keep()]), inputs: ECONOMICS_START_INPUTS });
  expect(old.ok && 'standardWork' in old.value.assumptions.options[0]).toBe(false);
});

type Component = (props: Record<string, unknown>) => React.ReactElement | null;

async function load(file: string, name = 'default'): Promise<Component> {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'tmp', 'economics-standard-work', String(process.pid), `${path.basename(file)}.cjs`);
  await build({
    entryPoints: [path.join(root, file)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    alias: { '@': root },
    loader: { '.css': 'empty' },
    logLevel: 'silent',
  });
  return require(out)[name];
}

test('the standard card names the design\'s gaps by count, offers a field per kind, proposes no days', async () => {
  const Comparison = await load('components/tco/OptionComparison.tsx');
  const { costComparison } = await import('../lib/cost-assumptions');
  const a = assumptions([keep(), opt({ id: 'standard', kind: 'standard', standardWork: { workshop: 4 } })]);
  const html = renderToStaticMarkup(
    React.createElement(Comparison, {
      assumptions: a,
      comparison: costComparison(a),
      proposal: null,
      baselineProposal: null,
      onPatchOption: () => {},
      editing: new Set(['standard']),
      onToggleEdit: () => {},
      fitGaps: { gapKeyUser: 2, gapOrganisational: 1, gapOpen: 3, configuration: 0, givenUp: 4 },
    }),
  );
  expect(html).toContain('data-cost-standard-work="standard"');
  expect(html).toContain('Fit-to-standard workshop: 4 key-user days once');
  expect(html).toMatch(/data-cost-fit-gaps="standard"[^>]*>Your confirmed fit-to-standard design: 2 key-user gaps, 1 organisational change, 3 open gaps/);
  expect(html).toContain('Clean-Core.io proposes none');
  for (const k of STANDARD_WORK_KINDS) expect(html).toContain(`data-cost-field="standard-sw-${k}"`);
  // Keep carries no such line and no such field.
  expect(html).not.toContain('data-cost-standard-work="do-nothing"');
  expect(html).not.toContain('data-cost-field="do-nothing-sw-');
});
