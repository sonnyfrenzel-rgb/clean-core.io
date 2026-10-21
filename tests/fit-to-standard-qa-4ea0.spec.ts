/**
 * QA review of 4ea0324a13cb — the fit-to-standard findings, each with a test
 * that fails without its fix: 9cdfd5bb083e, 357cd43a6983, 222b1b571ee8,
 * 6821d5b0f7a4, 00b7e0bfeb89.
 *
 * Server-free (222b1b571ee8 by its source; the route itself in
 * tests/fit-to-standard-route.spec.ts).
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fitReadKey, fitConditions, summaryOf, type FitToStandardRevision } from '../lib/fit-to-standard-store';
import { countEntries, fitDesignLists, type FitEntry } from '../lib/fit-to-standard-design';
import { decisionOptionsView } from '../lib/decision-option-signals';
import { csvCell, buildFitPackage, FIT_PACKAGE_PATHS } from '../lib/fit-to-standard-package';
import { nextSteps, knownLimits, type DeliveryFacts, type PackageReading } from '../lib/delivery-package';
import { readFitToStandard, designFromReading } from '../lib/fit-to-standard-read';
import { applyFitChoices } from '../lib/fit-to-standard-store';
import { catalogSnapshotKeyForProject } from '../lib/abap/catalog-snapshots';
import { readExample } from './helpers/starter-example-files';

const entry = (elementId: string, over: Partial<FitEntry> = {}): FitEntry => ({
  elementId, label: elementId, plainLabel: elementId, kind: 'task', anchor: { lineStart: 5, lineEnd: 5 }, anchorBasis: 'code',
  comparability: 'business-comparable', disposition: 'given-up', standardRef: null, evidenceLevel: 'E0', provenance: 'confirmed',
  why: '', gateClass: 'A', note: null, ...over,
});
const revisionOf = (entries: FitEntry[]): FitToStandardRevision => ({
  formatVersion: 1, revision: 2, kind: 'confirmation', runId: 'r', sourceSha256: 's', edition: 'public', engineVersion: 'v3.0.19',
  gateClasses: ['A'], againstGate: null, entries, counts: countEntries(entries), createdBy: { uid: 'u', name: 'Owner' }, createdAt: '2026-10-21T10:00:00.000Z',
});

test('9cdfd5bb083e: an edit of the source on the same run and revision moves the read key', () => {
  const project = { legacyCode: 'REPORT z1.', activeRunId: 'run-1', fitToStandard: { revision: 2 } };
  const before = fitReadKey('p1', project, 0);
  expect(fitReadKey('p1', { ...project }, 0)).toBe(before);
  expect(fitReadKey('p1', { ...project, legacyCode: 'REPORT z1.\n* edited' }, 0)).not.toBe(before);
  const hook = fs.readFileSync(path.join(__dirname, '..', 'hooks', 'useFitToStandard.ts'), 'utf8');
  expect(hook).toContain('const key = fitReadKey(projectId, project, tick);');
});

test('357cd43a6983: a step the engine cannot read keeps Management from speaking for standard, and stands as a condition and a gap', () => {
  const entries = [entry('a'), entry('opaque', { comparability: 'unknown', disposition: 'unknown', provenance: 'reconstructed', gateClass: null })];
  const card = decisionOptionsView({
    subject: 'Z', mode: 'project', hasRun: true, fit: { state: 'not-determined', why: 'unread', reason: 'x', platform: 'public' },
    decision: null, status: null, confirmation: null, signOff: null, engineRoute: null, usage: null, economics: null,
    fitDesign: summaryOf(revisionOf(entries), null),
  }).cards.find((c) => c.option === 'standard')!;
  expect(card.signal).toBe('not-determined');
  expect(card.reason).toContain('cannot read');
  expect(fitConditions(entries)).toEqual([expect.objectContaining({ elementId: 'opaque', basis: 'derived', disposition: 'unknown' })]);
  expect(fitDesignLists({ entries }).gaps.map((e) => e.elementId)).toEqual(['opaque']);
});

test('222b1b571ee8: the fit revision, the need revision and the summary are written in one transaction that re-reads both latest revisions', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'projects', '[projectId]', 'fit-to-standard', 'route.ts'), 'utf8');
  const tx = src.slice(src.indexOf('db.runTransaction('));
  expect(src.indexOf('db.runTransaction(')).toBeGreaterThan(0);
  expect(tx).toMatch(/tx\.get\(revisions\.orderBy\('revision', 'desc'\)/);
  expect(tx).toMatch(/tx\.get\(statesRef\.orderBy\('revision', 'desc'\)/);
  expect(tx).toContain('tx.create(statesRef.doc(');
  expect(tx).toContain('tx.create(revisions.doc(String(nextRevision)), record)');
  expect(tx).toContain('tx.update(projectRef, { fitToStandard: summary })');
  // No write outside it.
  const before = src.slice(0, src.indexOf('db.runTransaction('));
  expect(before).not.toMatch(/\.create\(/);
  expect(before).not.toContain('projectRef.update(');
});

test('6821d5b0f7a4: on the standard path the package never asks to run a suite it does not ship', () => {
  const facts = {
    standard: { files: [], conditions: [], summary: '1 given up, 0 gaps (0 key user, 0 organisational, 0 open)' },
    keyUser: null,
    tests: { status: 'not-run', scenarios: 4, sentence: 'Four scenarios, none run.' },
    rules: { state: 'not-read' },
    decision: { state: 'confirmed' },
    score: { signed: null },
    source: { matchesSignedRun: true },
  } as unknown as DeliveryFacts;
  const reading = { kind: 'documents-only', publisher: [] } as unknown as PackageReading;
  const steps = nextSteps(reading, facts, []);
  expect(steps.join('\n')).not.toMatch(/Run the test suite|Generate test scenarios|Repair the test project/);
  expect(steps.join('\n')).toContain('not part of this package');
  expect(knownLimits(reading, facts, []).join('\n')).toContain('Tests: none — nothing is built on the standard path');
});

test('00b7e0bfeb89', () => {
  for (const bad of ['=HYPERLINK("http://x","y")', '+1+2', '-3+4', '@SUM(A1)', '  =1+1', '\t=1']) {
    const cell = csvCell(bad);
    expect(cell.replace(/^"/, '')[0], bad).toBe("'");
  }
  expect(csvCell('Approval by the buyer')).toBe('Approval by the buyer');
  const file = 'Z_SD_DELIVERY_PRIORITY.abap';
  const source = readExample(file);
  const r = readFitToStandard({ source, fileName: file, edition: 'public', catalogSnapshot: catalogSnapshotKeyForProject({ s4Deployment: 'public' }), engineVersion: 'v3.0.19', mode: 'demo', hasRun: true, analyzeState: 'done', signedSourceSha256: null });
  const design = designFromReading(r, false)!;
  const open = design.entries.find((e) => e.disposition === 'gap-open')!;
  const entries = applyFitChoices(design.entries, [{ elementId: open.elementId, disposition: 'gap-organisational', note: '=HYPERLINK("http://example.invalid","x")' }]);
  const files = buildFitPackage({ projectName: 'Z', sourceFileName: file, source, skeleton: r.skeleton, revision: revisionOf(entries), keyUserSteps: null });
  const csv = files.find((f) => f.path === FIT_PACKAGE_PATHS.gapCsv)!.content;
  expect(csv).not.toMatch(/(^|,)"?=HYPERLINK/m);
  expect(csv).toContain(`"'=HYPERLINK(""http://example.invalid"",""x"")"`);
});
