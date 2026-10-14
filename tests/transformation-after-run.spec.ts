import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { notGeneratedReasons, packageGroups } from '../lib/transformation-view';
import { codeForTestingPrompt, testingCodeNote } from '../lib/testing-prompt-code';
import { basisSlotChanged, storedFact } from '../lib/transformation/generation-record';
import { checkPhrase } from '../lib/transformation/check-words';
import type { EvidenceFinding } from '../lib/abap/evidence-model';

/**
 * The SD walk on dev (acceptance 14.10.2026): after the run the result comes
 * first, the package reads by object, provenance says who wrote what, the
 * tools do not contradict each other, and Testing fits a large package into
 * one prompt.
 */

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SD_LIKE = [
  { path: 'src/zcl_sd_cr_logic.clas.abap', content: 'CLASS zcl_sd_cr_logic DEFINITION.\n"! @cc-fill BEGIN U01 9f2c41d0\nx = 1.\n"! @cc-fill END U01\nENDCLASS.' },
  { path: 'src/zcl_sd_cr_logic.clas.xml', content: '<abapGit/>' },
  { path: 'src/zbp_sd_cr_r.clas.abap', content: 'CLASS zbp_sd_cr_r DEFINITION.' },
  { path: 'src/zbp_sd_cr_r.clas.locals_imp.abap', content: 'CLASS lhc DEFINITION.' },
  { path: 'src/zbp_sd_cr_r.clas.xml', content: '<abapGit/>' },
  { path: 'src/zsd_cr_r.ddls.asddls', content: 'define root view entity ZSD_CR_R' },
  { path: 'src/zsd_cr_r.ddls.xml', content: '<abapGit/>' },
  { path: 'src/zsd_cr_r.dcls.asdcls', content: '@EndUserText.label' },
  { path: 'src/zsd_c_rec.tabl.xml', content: '<abapGit/>' },
  { path: 'README.md', content: '# readme' },
  { path: 'STATUS.md', content: '# status' },
  { path: 'traceability.json', content: '{}' },
];

test('the package reads by object: a class with its local classes and metadata is one row', () => {
  const groups = packageGroups(SD_LIKE);
  expect(groups.map((g) => g.name)).toEqual(['ZBP_SD_CR_R', 'ZCL_SD_CR_LOGIC', 'ZSD_C_REC', 'ZSD_CR_R', 'Package documents']);
  expect(groups.find((g) => g.name === 'ZBP_SD_CR_R')!.files).toHaveLength(3);
  expect(groups.find((g) => g.name === 'ZSD_CR_R')!.files.map((f) => f.role)).toEqual(['CDS data definition', 'Object metadata for abapGit', 'Access control (DCL)']);
  expect(groups.find((g) => g.name === 'ZSD_C_REC')!.kind).toBe('Database table');
  expect(groups.at(-1)!.files).toHaveLength(3);
});

test('who wrote it: function bodies by the model where the markers are, the rest by the engine', () => {
  const by = new Map(packageGroups(SD_LIKE).map((g) => [g.name, g.author]));
  expect(by.get('ZCL_SD_CR_LOGIC')).toBe('model');
  expect(by.get('ZBP_SD_CR_R')).toBe('engine');
  expect(by.get('ZSD_CR_R')).toBe('engine');
  // A package from one model call has no markers: every object is the model's.
  const single = packageGroups([{ path: 'srv/service.ts', content: 'export {}' }, { path: 'package.json', content: '{}' }]);
  expect(single.every((g) => g.author === 'whole-model')).toBe(true);
});

test('Testing gets the code under test, without markers or metadata, and names what did not fit', () => {
  const stored = JSON.stringify(SD_LIKE);
  const all = codeForTestingPrompt(stored, 100_000);
  expect(all.text).toContain('--- src/zcl_sd_cr_logic.clas.abap ---');
  expect(all.text).toContain('--- src/zsd_cr_r.ddls.asddls ---');
  expect(all.text).not.toContain('@cc-fill');
  expect(all.text).not.toContain('<abapGit/>');
  expect(all.text).not.toContain('# readme');
  expect(all.leftOut).toEqual([]);
  expect(testingCodeNote(all)).toBe('');
  // The classes come first; what does not fit is named whole, never cut.
  const tight = codeForTestingPrompt(stored, 160);
  expect(tight.text.indexOf('zbp_sd_cr_r.clas.abap')).toBeGreaterThan(-1);
  expect(tight.leftOut.length).toBeGreaterThan(0);
  expect(testingCodeNote(tight)).toContain(tight.leftOut[0]);
  for (const p of tight.leftOut) expect(tight.text).not.toContain(`--- ${p} ---`);
});

test('the testing prompt carries the bounded code view, not the stored package', () => {
  const hook = read('hooks/useTestGeneration.ts');
  expect(hook).not.toContain('${project?.generatedCode}');
  expect(hook).toContain('codeForTestingPrompt(project?.generatedCode, Math.max(0, TESTING_PROMPT_LIMIT - TESTING_PROMPT_MARGIN - buildPrompt(\'\').length))');
});

const f = (objectName: string, lineStart: number): EvidenceFinding =>
  ({ id: objectName, objectName, lineStart, sapReplacement: null } as unknown as EvidenceFinding);

test('list and file output is said apart from a missing successor — Design gives it a Fiori target', () => {
  const reasons = notGeneratedReasons([f('REUSE_ALV_GRID_DISPLAY', 1215), f('GUI_DOWNLOAD', 1293), f('BAPI_X_OLD', 40)], null);
  expect(reasons.map((r) => r.key)).toEqual(['ui-output', 'no-successor']);
  expect(reasons[0].text).toContain('REUSE_ALV_GRID_DISPLAY');
  expect(reasons[0].text).toContain('Fiori app');
  expect(reasons[1].text).toContain('BAPI_X_OLD');
  expect(reasons[1].text).not.toContain('GUI_DOWNLOAD');
});

test('a long fact compares as the record stores it, so a design reason is not stale right after the run', () => {
  const long = 'Target: In-app (RAP) — reason: '.padEnd(420, 'x');
  expect(storedFact(long)).toHaveLength(300);
  expect(storedFact(storedFact(long))).toBe(storedFact(long));
  // Staleness lives in basisSlotChanged since 3.0.13; the card only calls it.
  const record = read('lib/transformation/generation-record.ts');
  expect(record).toContain('current.facts.slice(0, 4).map((f) => storedFact(f.text))');
  expect(read('components/transformation/BuiltOnCard.tsx')).toContain('return basisSlotChanged(b, now);');
  // And in behaviour: a long fact in any position, stored cut, is not a change; a real change in the fourth is.
  const stored = { key: 'design', title: 'Design', when: 'need revision 3', facts: ['a', 'b', 'c', storedFact(long)] };
  const now = (fourth: string) => [{ key: 'design', state: 'ready', when: 'need revision 3', facts: ['a', 'b', 'c', fourth].map((text) => ({ text })) }];
  expect(basisSlotChanged(stored as never, now(long))).toBe(false);
  expect(basisSlotChanged(stored as never, now(long.replace('Target', 'Tarxet')))).toBe(true);
});

test('refused bodies are said to go back for repair, so "30 of 30 written" and "3 refused" do not contradict', () => {
  expect(checkPhrase({ kind: 'guards', total: 30, failed: 3 } as never)).toBe('body guards: 30 bodies checked, 3 refused and sent back for repair');
  expect(checkPhrase({ kind: 'guards', total: 30, failed: 0 } as never)).toBe('body guards: 30 bodies checked, none refused');
});

test('after the run the result comes first; the pre-run panel is folded below it as "Generate again"', () => {
  const page = read('app/(app)/project/[projectId]/transformation/page.tsx');
  expect(page).toContain('{showTips && !hasPackage ? tipsPanel : null}');
  const folded = page.indexOf('data-generate-again=""');
  expect(folded).toBeGreaterThan(page.indexOf('<TransformationObjectPage'));
  expect(page.slice(folded - 200, folded)).toContain('<details');
  const objectPage = read('components/transformation/TransformationObjectPage.tsx');
  expect(objectPage).not.toContain('data-not-compiled');
  expect(objectPage).not.toContain("text: 'Grounding audit checked by hand'");
});

test('a Node package groups by folder: its modules are files of one folder, not objects', () => {
  const groups = packageGroups([
    { path: 'srv/units/01-check.ts', content: '// @cc-fill BEGIN U01 9f2c41d0\nx\n// @cc-fill END U01' },
    { path: 'srv/units/02-route.ts', content: 'y' },
    { path: 'srv/service.ts', content: 'export {}' },
    { path: 'srv/engine-contract.ts', content: 'export {}' },
    { path: 'package.json', content: '{}' },
  ]);
  expect(groups.map((g) => [g.name, g.files.length, g.author])).toEqual([
    ['srv/', 2, 'engine'],
    ['srv/units/', 2, 'model'],
    ['Package documents', 1, 'engine'],
  ]);
  expect(groups[0].kind).toBe('Folder');
});
