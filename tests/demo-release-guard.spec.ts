import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  DEMO_RELEASE_FILE,
  demoReleaseDrift,
  measureDemoRelease,
  stationsWithoutTarget,
  TOUR_TARGETS,
  type DemoRelease,
  type DemoReleaseRecord,
} from '../lib/demo-release';
import { buildDemoWorkspace } from '../lib/demo-workspace';
import { assertNoTrustChain } from '../lib/demo-project';
import { TOUR_PLACES } from '../lib/demo-tour';

/**
 * The demo is regenerated with every release that changes the engine or the
 * rule version — roadmap 3.0.7, `DESIGN.md` §6.1.2.
 *
 * The demo is computed on request, so what a reader sees cannot drift from the
 * engine. What drifts is everything built on it: the tour's stations need
 * something at their place, and the figures quoted about the demo are quoted
 * from somewhere. `lib/demo-release.json` records the engine output, the rule
 * version and the headline figures the demo was last regenerated under; this
 * guard measures again and fails when they disagree. The fix is
 * `npm run demo:regenerate`, reviewed and committed with the engine change.
 *
 * Pure: no server. It runs the engine, which takes a second.
 */

const ROOT = path.resolve(__dirname, '..');
const recorded = JSON.parse(fs.readFileSync(path.resolve(ROOT, DEMO_RELEASE_FILE), 'utf8')) as DemoReleaseRecord;

let measured: DemoRelease;
test.beforeAll(() => {
  measured = measureDemoRelease();
});

test('the recorded demo is the demo this engine and rule version produce', () => {
  const drift = demoReleaseDrift(recorded, measured);
  expect(
    drift,
    `The demo no longer matches ${DEMO_RELEASE_FILE}:\n  ${drift.join('\n  ')}\n` +
      'The engine, the A-D rule or the catalog changed. Run `npm run demo:regenerate`, review the diff ' +
      '(it is what the demo now says), and commit it with the change.',
  ).toEqual([]);
  expect(recorded.engineOutput, 'the engine output digest').toBe(measured.engineOutput);
});

test('the guard can fail — a moved rule version, a moved figure and a moved engine are each caught', () => {
  expect(demoReleaseDrift({ ...measured, ruleVersion: 'levels 000000000000' }, measured).join('\n')).toContain(
    'rule version',
  );
  expect(
    demoReleaseDrift({ ...measured, figures: { ...measured.figures, findings: measured.figures.findings + 1 } }, measured).join(
      '\n',
    ),
  ).toContain('findings');
  expect(demoReleaseDrift({ ...measured, engineOutput: 'f'.repeat(64) }, measured).join('\n')).toContain(
    'engine output',
  );
  expect(demoReleaseDrift({ ...measured, catalogVersion: 'older' }, measured).join('\n')).toContain('catalog');
  expect(demoReleaseDrift(measured, measured)).toEqual([]);
});

test('the record is not a vacuous one', () => {
  // An engine that suddenly finds nothing would agree with a record of nothing.
  expect(recorded.figures.findings).toBeGreaterThan(10);
  expect(recorded.figures.processSteps).toBeGreaterThan(10);
  expect(recorded.ruleVersion).toMatch(/^levels [0-9a-f]{12} /);
  expect(recorded.source.file).toBe('Z_MM_PO_APPROVAL.abap');
});

test('every tour station has something at its place in this demo', () => {
  expect(Object.keys(TOUR_TARGETS).sort()).toEqual([...TOUR_PLACES].sort());
  expect(stationsWithoutTarget(measured.figures), 'a tour station points at nothing').toEqual([]);
  // And the check can fail.
  expect(stationsWithoutTarget({ ...measured.figures, rulesRevealed: 0 }).length).toBe(2);
  expect(stationsWithoutTarget({ ...measured.figures, processLevels: 1 })).toEqual([
    'process-levels needs processLevels >= 2',
  ]);
});

test('the demo workspace carries no trust-chain field and no account', () => {
  const data = buildDemoWorkspace();
  expect(() => assertNoTrustChain(data)).not.toThrow();
  // No field of the project record says something happened.
  expect(Object.keys(data.project).sort()).toEqual(
    ['codeInventory', 'dataCoupling', 'legacyCode', 'name', 's4Deployment'].sort(),
  );
  expect(data.project.name.startsWith('Demo · ')).toBe(true);
  // The code column shows the same bytes on every checkout.
  expect(data.source.includes('\r')).toBe(false);
});

test('the regeneration is a script anyone can run', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  expect(pkg.scripts['demo:regenerate']).toBe('tsx scripts/regenerate-demo.ts');
  expect(fs.existsSync(path.resolve(ROOT, 'scripts/regenerate-demo.ts'))).toBe(true);
});
