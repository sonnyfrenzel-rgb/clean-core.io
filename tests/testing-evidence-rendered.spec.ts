import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { assessCase, countAssessments, ruleTraceOf, withRuleTrace, type CaseAssessmentReading, type RuleCoverage } from '../lib/testing-rule-trace';
import { invariantPlan, type InvariantPlan } from '../lib/testing-invariants';
import { mutationReport, type MutationProbeReport } from '../lib/testing-mutation';
import { REVIEWED_SERVICE, packageOf } from './helpers/fi-worklist-fixture';

/**
 * 3.0.10, as the reader sees it: the Testing tool's "What the tests prove
 * about the original" card (rule coverage, old against new, the invariant,
 * the mutation probe) and a scenario row with its rule trace and its
 * assessment — rendered from the components themselves, server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'testing-evidence-rendered', String(process.pid));

type Card = (props: Record<string, unknown>) => React.ReactElement;
type List = (props: Record<string, unknown>) => React.ReactElement;
let EvidenceCard: Card;
let ScenarioList: List;

async function load<T>(rel: string, name: string): Promise<T> {
  await build({
    entryPoints: [path.resolve(ROOT, rel)],
    outfile: path.join(OUT, `${name}.cjs`),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  return require(path.join(OUT, `${name}.cjs`)).default as T;
}

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  EvidenceCard = await load<Card>('components/testing/TestEvidenceCard.tsx', 'TestEvidenceCard');
  ScenarioList = await load<List>('components/testing/ScenarioList.tsx', 'ScenarioList');
});

const COVERAGE: RuleCoverage = { covered: ['BR-007', 'BR-009'], missing: ['BR-004', 'BR-010'], mismatched: [], total: 4 };
const MUTATION: MutationProbeReport = mutationReport(
  [
    { id: 'M1', operator: 'ignore-request-param', file: 'srv/service.ts', line: 918, description: 'the request parameter kunnr is ignored (req.query.kunnr → undefined, 2 places)', outcome: 'survived' },
    { id: 'M2', operator: 'constant-lookup', file: 'srv/service.ts', line: 723, description: 'a lookup returns the first entry instead of the matching one', outcome: 'survived' },
  ],
  '2026-10-11T12:00:00.000Z',
);

function card(extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    React.createElement(EvidenceCard, {
      coverage: COVERAGE,
      coverageNote: '',
      assessments: countAssessments(['unchanged', 'defect', 'not-assessable']),
      invariant: invariantPlan(packageOf(REVIEWED_SERVICE)),
      mutation: MUTATION,
      probe: { state: 'done', error: null },
      probeBasis: null,
      canProbe: true,
      onProbe: () => undefined,
      ...extra,
    }),
  );
}

test('the card: rule coverage, old against new, the invariant with the gap read from the code, and a suite that constrains nothing', () => {
  const html = card();
  expect(html).toContain('What the tests prove about the original');
  expect(html).toContain('2 of 4 business rules of the original have a case with an expected result from the original · not covered: BR-004, BR-010');
  expect(html).toContain('Old against new: 1 unchanged · 1 defect · 1 not yet assessable');
  expect(html).toContain('data-test-evidence-invariant="applicable"');
  expect(html).toContain('the totals endpoint does not read kunnr; the export endpoint does not read kunnr, which the list reads');
  expect(html).toContain('data-test-evidence-mutation="does-not-constrain"');
  expect(html).toContain('The tests do not constrain the behaviour');
  expect(html).toContain('The suite catches none of the 2 mutants of the generated code');
  expect(html).toContain('request parameter ignored — the request parameter kunnr is ignored');
  // Probed already: no button.
  expect(html).not.toContain('Probe the suite with mutants');
});

test('before a probe: the reason it cannot run yet, or the button', () => {
  const blocked = card({ mutation: null, probe: { state: 'idle', error: null }, probeBasis: 'No recorded run covers the current code and suite. Run the tests first.' });
  expect(blocked).toContain('Not probed yet. No recorded run covers the current code and suite. Run the tests first.');
  expect(blocked).not.toContain('Probe the suite with mutants');
  const ready = card({ mutation: null, probe: { state: 'idle', error: null } });
  expect(ready).toContain('Probe the suite with mutants');
  const notApplicable: InvariantPlan = { applicable: false, reason: 'The generated code registers no HTTP route the product can read.', endpoints: [] };
  const na = card({ invariant: notApplicable });
  expect(na).toContain('data-test-evidence-invariant="not-applicable"');
  expect(na).toMatch(/>Not applicable<\/span><\/span><\/span> The generated code registers no HTTP route the product can read\./);
});

test('a scenario row: the assessment chip, and in its details the rule of the original and the expected result from it', () => {
  const tc = withRuleTrace({
    id: 'TC_07',
    name: 'BR-009 credit with a foreign reference keeps its own terms',
    category: 'Business rule',
    description: 'Credit 1900000018 of customer 0000100003',
    ruleTrace: {
      ruleId: 'BR-009',
      kind: 'exception',
      lines: ['551-553'],
      quote: "IF sy-subrc <> 0 OR ls_ref-koart <> 'D' OR ls_ref-kunnr <> ps_item-kunnr.",
      originalBehaviour: 'The reference is not a customer item of the same customer, so the credit keeps its own posted terms.',
      expectedFromOriginal: 'Due date unknown, bucket UNKNOWN, action DUE_DATE_REVIEW.',
    },
  });
  const reading: CaseAssessmentReading = assessCase({ trace: ruleTraceOf(tc), verdict: 'Failed' });
  const html = renderToStaticMarkup(
    React.createElement(ScenarioList, {
      cases: [tc],
      isAbapCloud: false,
      suiteCode: null,
      selectable: false,
      selected: [],
      onToggle: () => undefined,
      resultOf: () => ({ verdict: 'Failed', message: null }),
      runAt: '2026-10-11T12:00:00.000Z',
      tenantLocked: true,
      origin: { engine: null, signedSha256: null, reason: 'No signed source.' },
      assessmentOf: () => reading,
    }),
  );
  expect(html).toContain('data-scenario-assessment="defect"');
  expect(html).toContain('Old vs new');
  expect(html).toContain('>Defect<');
  // Details are one click deeper; the details component renders the trace.
  const { ScenarioDetails } = require(path.join(OUT, 'ScenarioList.cjs')) as { ScenarioDetails: (p: Record<string, unknown>) => React.ReactElement };
  const details = renderToStaticMarkup(
    React.createElement(ScenarioDetails, {
      tc,
      isAbapCloud: false,
      test: { kind: 'no-suite', reason: 'No suite.' },
      where: { scope: 'not-determined', reason: 'No suite.' },
      origin: { origin: null, dropped: null, check: { version: 1, outcome: 'not-checked', sourceSha256: null, matches: [], problems: [], sentence: 'n/a' }, basis: 'none', recheckedAfterChange: false },
      sourceLines: null,
      run: { verdict: 'Failed', message: null },
      runAt: null,
      tenantLocked: true,
      assessment: reading,
    }),
  );
  expect(details).toContain('data-scenario-rule-trace="BR-009"');
  expect(details).toContain('Against the original');
  expect(details).toContain('an exception it names · L551-553');
  expect(details).toContain('Due date unknown, bucket UNKNOWN, action DUE_DATE_REVIEW.');
  expect(details).toContain('Nobody marked the rule to change, so this is a defect until the owner decides otherwise.');
  // The trace is not repeated as a raw field.
  expect(details).not.toContain('data-scenario-field="ruleTrace"');
});
