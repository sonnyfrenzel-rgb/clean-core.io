import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Owner, 09.10.2026: while the initial analysis of a new project ran, the first
 * look still offered "Run the analysis" in "Next step". The project has no
 * `activeRunId` until the start run is signed, so `nextOpenPoint` names Analyze
 * for the whole run; the workspace now marks that point as running and every
 * "Next step" surface — the Business bar, the IT card, the Management panel —
 * says so instead of offering the button that would start a second run.
 *
 * Source-level, no server: the rendered half needs a start run held open,
 * which is a browser spec of its own (see the note in the report of this fix).
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('the workspace marks Analyze as running while the start run is with the server', () => {
  const shell = read('components/workspace/WorkspaceShell.tsx');
  expect(shell).toContain("const startRunning = startRun?.phase === 'running';");
  expect(shell).toMatch(/point\.key === 'analyze' && startRunning \? \{ \.\.\.point, running: true as const \}/);
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
