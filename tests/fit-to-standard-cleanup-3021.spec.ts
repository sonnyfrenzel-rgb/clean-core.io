import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { contractOfProject } from '../lib/contract-build';
import { contractFingerprint, contractForDisplay } from '../lib/architecture-contract';
import { WORKSPACE_ANSWER_MESSAGES } from '../lib/messages/workspace-answers';
import { TOUR_PLACES } from '../lib/demo-tour';
import { workspaceLayers } from '../lib/workspace-model';

/**
 * Fit to standard, option (b) "one honest standard check" (owner decision
 * 22.10.2026). What the clean-up removed stays removed, the one check that
 * stays says what it does not measure, and the links that led into the removed
 * table lead to what is there now.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SOURCE = `REPORT zfit_cleanup.
PARAMETERS p_amt TYPE p DECIMALS 2.
START-OF-SELECTION.
  IF p_amt > '1000.00'.
    MESSAGE 'Too high' TYPE 'E'.
  ENDIF.
  SELECT * FROM vbak INTO TABLE @DATA(lt_orders) UP TO 10 ROWS.
`;

test.describe('the stored contract keeps its fingerprint; the screen stops promising a coverage analysis', () => {
  const built = contractOfProject({ legacyCode: SOURCE, s4Deployment: 'private', activeRunId: 'run-1' }, null);
  if (!built.ok) throw new Error('the fixture builds no contract');
  const contract = built.contract;

  test('the stored bytes still carry the old wording, so no fingerprint moved', () => {
    const json = JSON.stringify(contract);
    expect(json).toContain('standard-coverage analysis');
    expect(contractFingerprint(contract)).toBe(contract.fingerprint);
  });

  test('what a screen shows names no analysis that does not exist', () => {
    const shown = contractForDisplay(contract);
    const text = JSON.stringify([shown.fields, shown.alternatives]);
    expect(text).not.toContain('standard-coverage analysis');
    expect(text).toContain('Move to SAP standard');
    // Display only: the fingerprint is the stored one.
    expect(shown.fingerprint).toBe(contract.fingerprint);
  });
});

test('the Management card is named for what it measures and says what it does not', () => {
  expect(WORKSPACE_ANSWER_MESSAGES['stdFit.title']).toBe('What stands in the way of the SAP standard');
  expect(WORKSPACE_ANSWER_MESSAGES['stdFit.notMeasured']).toBe('Functional fit to the SAP standard is not measured.');
  const card = read('components/workspace/ManagementExecutive.tsx');
  // In every state of the card.
  expect(card.match(/\{notMeasured\}/g)?.length).toBe(3);
});

test('Analyze shows, asks for and exports no model "Standard Fit"', () => {
  expect(fs.existsSync(path.join(ROOT, 'components/analyze/TargetScopeMapping.tsx'))).toBe(false);
  for (const rel of ['app/(app)/project/[projectId]/analyze/page.tsx', 'lib/analysis-prompt.ts', 'lib/analysis-export.ts', 'lib/markdownFormatter.ts']) {
    expect(read(rel), rel).not.toMatch(/\bstandardFit\b|S\/4HANA Best Practice/);
  }
  // The generic action plan no longer promises "fully standard in S/4HANA".
  for (const rel of ['components/tco/BusinessValuePlan.tsx', 'lib/analysis-export.ts']) {
    expect(read(rel), rel).not.toMatch(/fully standard in S\/4HANA|Best Practice configuration/);
  }
});

test('the IT table, its route and the demo card are gone; the address #standard holds the stage-1 card', () => {
  for (const rel of [
    'components/workspace/StandardFitTable.tsx',
    'components/workspace/ItStandardFit.tsx',
    'app/api/projects/[projectId]/standard-fit/route.ts',
    'lib/standard-fit-view.ts',
    'lib/standard-fit-client.ts',
  ]) {
    expect(fs.existsSync(path.join(ROOT, rel)), rel).toBe(false);
  }
  expect(read('components/workspace/ItAnswers.tsx')).toContain('<StandardTouchCard');
  expect(read('components/demo/DemoWorkspaceShell.tsx')).not.toContain('data-demo-standard-fit');
  expect((TOUR_PLACES as readonly string[]).includes('standard-fit')).toBe(false);
  const standard = workspaceLayers(null).find((l) => l.key === 'standard');
  expect(standard?.label).toBe('Where it touches SAP standard');
  expect(standard?.rows).toEqual([]);
});

test('the links that led into the removed table lead to what is there now', () => {
  // The standard option's evidence: to the check in IT, not to an empty Business view.
  const signals = read('lib/decision-option-signals.ts');
  expect(signals).not.toMatch(/in the Business view\./);
  expect(signals).toMatch(/place: 'standard-check'/);
  expect(read('components/workspace/ManagementOverview.tsx')).toContain("if (place === 'standard-check') return `${base}?view=it#standard`;");
  // Transformation's warning: to the Management decision.
  const chain = read('lib/transformation-chain.ts');
  const open = chain.slice(chain.lastIndexOf("kind: 'standard-fit-open'"), chain.lastIndexOf("kind: 'standard-fit-open'") + 400);
  expect(open).toContain("choice(inputs, 'management.confirm')");
  expect(open).not.toContain("'it.standard-fit'");
  // Public texts and the one-pager name the figure for what it measures.
  for (const rel of ['app/page.tsx', 'lib/whitepaper.ts']) expect(read(rel), rel).not.toContain('fit to standard as one figure');
  expect(read('lib/steering-one-pager.ts')).not.toMatch(/place: 'Fit to standard'/);
});

test('counter-check scenarios moved to Testing', () => {
  expect(read('app/(app)/project/[projectId]/testing/page.tsx')).toContain('<CounterChecks');
  expect(read('components/testing/CounterChecks.tsx')).toContain('deriveCounterCheckScenarios');
});
