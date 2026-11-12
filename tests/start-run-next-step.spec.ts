import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Owner, 09.10.2026: while the initial analysis of a new project ran, the first
 * look still offered "Run the analysis" in "Next step". The project has no
 * `activeRunId` until the start run is signed, so `nextOpenPoint` names Analyze
 * for the whole run; the page that holds the start marks that point as running
 * and its "Next step" says so instead of offering the button that would start
 * a second run.
 *
 * Since v3.1.0 the start run is signed in Analyze, Business (AB-2), and the
 * workspace — IT and Management only — starts none of its own. The NextStepCard
 * and Management rules below stay: they are the forms a running point takes.
 *
 * Source-level, no server; the rendered half is
 * `tests/start-run-next-step-rendered.spec.ts`.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('Analyze, Business marks Analyze as running while the start run is with the server', () => {
  const business = read('components/analyze/AnalyzeBusiness.tsx');
  expect(business).toMatch(/point && point\.key === 'analyze' && startRun\.phase === 'running' \? \{ \.\.\.point, running: true as const \} : point/);
  expect(business).toContain('businessNextStep({ point: running, rules: null, owner })');
  // The workspace starts no run, so it has nothing to mark.
  const shell = read('components/workspace/WorkspaceShell.tsx');
  expect(shell).not.toMatch(/startRun|useStartRun/);
  expect(read('app/(app)/project/[projectId]/page.tsx')).not.toMatch(/useStartRun/);
});

test('"Next step" offers no button for a running point, in both of its forms', () => {
  const card = read('components/workspace/NextStepCard.tsx');
  // The bar: the button stands behind `!point.running`.
  expect(card).toContain('{point !== null && !point.running ? (');
  // The card: selection and button only outside the running state.
  const card2 = card.slice(card.indexOf('<CcCard'));
  const gate = card2.indexOf('{point.running ? null : (');
  expect(gate, 'the card form renders its button while the run is running').toBeGreaterThan(-1);
  expect(card2.indexOf('<CcLinkButton')).toBeGreaterThan(gate);
  expect(card.match(/wt\('nextStep\.running'\)/g)?.length).toBe(2);
});

test('Management says the run is running and offers no button for it', () => {
  const overview = read('components/workspace/ManagementOverview.tsx');
  expect(overview).toContain("reason: nextStep.running ? wt('nextStep.running') : nextStep.reason,");
  expect(overview).toContain('running: nextStep.running === true,');
  const exec = read('components/workspace/ManagementExecutive.tsx');
  const buttons = exec.split('data-executive-next-action=""').length - 1;
  const gates = exec.split('{primary?.running ? null : (').length - 1;
  expect(buttons).toBeGreaterThan(0);
  expect(gates, 'a "Next step" button in Management that a running start still shows').toBe(buttons);
});
