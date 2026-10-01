import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { duplicatePaths } from '../app/(app)/project/[projectId]/transformation/duplicate-paths';

/**
 * QA full review of v2.20.0 (fc78767), the transformation stage. Source-level
 * guards plus one unit test of the duplicate-path gate; none needs a server.
 */

const PAGE = 'app/(app)/project/[projectId]/transformation/page.tsx';

/** The page with its comments removed — the comments record the old words. */
const code = () =>
  readFileSync(PAGE, 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test('4cfbf09351f1 · a model comment is never marked as grounded', () => {
  const src = code();
  const markers = src.slice(src.indexOf('const getModernMarkers'), src.indexOf('const scrollToLine'));
  expect(markers.length).toBeGreaterThan(0);
  expect(markers).not.toContain('Fully Grounded');
  expect(markers).not.toMatch(/level:\s*'fully',/);
  expect(markers).not.toMatch(/includes\('(?:CDS|matched|fully)'\)/);
});

test('88b7d2853f85 · the signed score is named as the source analysis, not as grounding', () => {
  const src = code();
  for (const gone of ['Grounded & Ready', 'Overall Support Rollup']) {
    expect(src, `${gone} came back`).not.toContain(gone);
  }
  expect(src).toContain('Signed source-analysis score');
  expect(src).toContain('Scores the legacy source, not the generated code');
});

test('af9225424d1d · browser-local ticks are not called a sign-off', () => {
  const src = code();
  expect(src).not.toMatch(/manual findings signed off/);
  expect(src).toContain('ticked in this browser');
  expect(src).toContain('not saved and not a signed sign-off');
});

test('6d411bca538c · a path answered twice is found, in every spelling', () => {
  expect(duplicatePaths([{ path: 'srv/service.ts' }, { path: 'db/schema.cds' }])).toEqual([]);
  expect(duplicatePaths([{ path: 'srv/service.ts' }, { path: 'srv/service.ts' }])).toEqual(['srv/service.ts']);
  expect(duplicatePaths([{ path: 'srv/service.ts' }, { path: ' ./srv\\service.ts ' }])).toEqual(['./srv\\service.ts']);
  expect(
    duplicatePaths([{ path: 'src/ZCL_A.clas.abap' }, { path: 'src/zcl_a.clas.abap' }, { path: 'src/zcl_a.clas.abap' }]),
  ).toEqual(['src/zcl_a.clas.abap']);
  // Interior `.` and `..` segments name the same file too (QA slice review of
  // ad155b478e36, 6dc1260fefb2) — and a `..` that leaves the package does not
  // fold into a path inside it.
  expect(duplicatePaths([{ path: 'src/../shared.ts' }, { path: 'shared.ts' }])).toEqual(['shared.ts']);
  expect(duplicatePaths([{ path: 'a/./b.ts' }, { path: 'a//b.ts' }, { path: 'a/b.ts' }])).toEqual(['a//b.ts', 'a/b.ts']);
  expect(duplicatePaths([{ path: '../shared.ts' }, { path: 'shared.ts' }])).toEqual([]);
});

test('6d411bca538c · the page refuses a package with a repeated path before storing it', () => {
  const src = code();
  const gate = src.indexOf('duplicatePaths(filesArray)');
  expect(gate, 'the generation no longer checks for repeated paths').toBeGreaterThan(-1);
  expect(gate).toBeLessThan(src.indexOf('storeGeneration(projectId'));
  expect(src.slice(gate, gate + 400)).toContain('throw new Error(');
});

test('6f3dc15e6f7b · generation waits for the model switch and respects it', () => {
  const src = code();
  const load = src.slice(src.indexOf('const fetchProject = async'), src.indexOf('fetchProject();'));
  expect(load.length).toBeGreaterThan(0);
  // The load no longer starts a generation on its own.
  expect(load).not.toContain('generateTransformation()');
  expect(load).toContain('setAwaitingAutoGeneration(true)');
  // The effect that does waits for the hook's answer and asks it.
  const effect = src.slice(src.indexOf('if (!awaitingAutoGeneration'));
  expect(effect).toMatch(/^if \(!awaitingAutoGeneration \|\| modelAvailability\.loading \|\| autoGenerationStarted\.current\) return;/);
  expect(effect.slice(0, 400)).toMatch(
    /if \(!modelAvailability\.enabled\('transformation'\)\) return;\s*const timer = setTimeout\(\(\) => \{\s*autoGenerationStarted\.current = true;\s*generateTransformation\(\);/,
  );
  // A stage it may not start shows the "not generated" state, not a spinner.
  expect(src).toContain('const busy = loading && !autoGenerationBlocked;');
  expect(src).toMatch(/files\.length === 0 && !busy \?/);
  // And the button cannot be pressed while the stage is off or keyless.
  expect(src).toMatch(/disabled=\{blockers\.length > 0 \|\| modelOff !== null\}/);
});

test('c1c94b3caae4 · proceeding without a package is marked as leaving it behind', () => {
  const src = code();
  // The stage's footer passes NavigationButtons' props through unchanged for an
  // account without the workspace (components/StageFooter.tsx).
  const nav = src.slice(src.indexOf('<StageFooter'));
  expect(nav).toMatch(/incomplete=\{files\.length === 0\}/);
  expect(nav).toContain('incompleteReason="no transformed code has been generated"');
});

test('604c2ded57e3 · "copied" is said only after the clipboard answered', () => {
  const src = code();
  const copy = src.slice(src.indexOf('const handleCopy'), src.indexOf('const isAbapCloud ='));
  const write = copy.indexOf('await navigator.clipboard.writeText(');
  expect(write, 'the clipboard write is not awaited').toBeGreaterThan(-1);
  expect(copy).toContain('catch');
  expect(copy.indexOf('setShowCopyDialog(true)')).toBeGreaterThan(write);
  expect(src).toContain('data-copy-failed');
});

test('4aa2e074b134 · the package lead does not say an ABAP Cloud package runs against mocks', () => {
  // The Testing tool simulates an ABAP run and says so; the lead above the
  // generated package said "runs it against mocks" for every track.
  const page = readFileSync('components/transformation/TransformationObjectPage.tsx', 'utf8');
  const lead = page.slice(page.indexOf('id="tf-package"'), page.indexOf('{files === null ? ('));
  expect(lead).toMatch(/track === 'in-app'[\s\S]*simulates a run[\s\S]*runs it against mocks/);
});

test('7abe866543dd · the loading line names no track before the project has loaded', () => {
  // `isAbapCloudTrack(undefined)` picks the side-by-side copy, so an ABAP Cloud
  // project read "Node.js" while it was still loading.
  expect(code()).toContain("<span data-track-loading>{project ? track.loading : 'Opening the project…'}</span>");
});
