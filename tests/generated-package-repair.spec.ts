import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  parseGeneratedPackage,
  failingFileIndex,
  namedFileIndex,
  repairTarget,
  replaceFileContent,
  type GeneratedFile,
} from '../lib/generated-package';

/**
 * Roadmap 0.2 — an auto-repair must not quietly cost the reader the artefact.
 *
 * The testing stage asks the model to repair **one** module when the sandbox
 * reports a compile error. Its answer — a single TypeScript source — was written
 * straight over `project.generatedCode`, which for a CAP package is a serialised
 * array of `{path, content}`: every other generated file was replaced by that one
 * module, and the write happened *before* the retry that would show whether the
 * repair compiled at all (QA c1523df5fc4e).
 *
 * The replacement is a module so it can be run and read back here. The ordering —
 * repair first, write only after a run without a build error — is read from the
 * hook's source, because it is a property of the control flow rather than of any
 * value this test could hold.
 */
const ROOT = path.resolve(__dirname, '..');
const hookSource = () => fs.readFileSync(path.join(ROOT, 'hooks/useTestExecution.ts'), 'utf8');

const PACKAGE: GeneratedFile[] = [
  { path: 'srv/service.cds', content: 'service Orders { entity Order as projection on db.Order; }' },
  { path: 'srv/app.ts', content: 'export const broken = (: string) => 1;' },
  { path: 'db/schema.cds', content: 'entity Order { key ID : UUID; }' },
  { path: 'package.json', content: '{ "name": "generated" }' },
];

test('a repair replaces one file and every other file survives', () => {
  const stored = JSON.stringify(PACKAGE);
  const pkg = parseGeneratedPackage(stored);
  expect(pkg, 'the stored artefact is a package').not.toBeNull();

  const idx = failingFileIndex(pkg!, "srv/app.ts:1:22: ERROR: Expected identifier but found ':'");
  expect(pkg![idx].path).toBe('srv/app.ts');

  const repaired = replaceFileContent(pkg!, idx, 'export const fixed = (s: string) => 1;');
  const after = parseGeneratedPackage(repaired);

  expect(after!.map((f) => f.path), 'all four files, in the order they were stored').toEqual([
    'srv/service.cds',
    'srv/app.ts',
    'db/schema.cds',
    'package.json',
  ]);
  expect(after![idx].content).toBe('export const fixed = (s: string) => 1;');
  for (const i of [0, 2, 3]) {
    expect(after![i], `${PACKAGE[i].path} was touched by a repair of another file`).toEqual(PACKAGE[i]);
  }
});

test('a raw module written over the package is what the defect looked like', () => {
  // The old behaviour, stated once so the regression has a shape: `generatedCode`
  // became the repaired source itself, and nothing that reads the package can read
  // it any more.
  const lost = parseGeneratedPackage('export const fixed = (s: string) => 1;');
  expect(lost, 'a bare module does not parse as a package — the other files are simply gone').toBeNull();
});

test('the file is chosen by name, and the longest name wins', () => {
  const files: GeneratedFile[] = [
    { path: 'app.ts', content: 'a' },
    { path: 'srv/app.ts', content: 'b' },
  ];
  expect(files[failingFileIndex(files, 'error in srv/app.ts line 3')].path).toBe('srv/app.ts');
  // Nothing named: `app.ts` is what the flat fallback is written as.
  expect(files[failingFileIndex(files, 'Build failed with 1 error')].path).toBe('app.ts');
  // Nothing compilable at all: the caller is told so rather than handed a guess.
  expect(failingFileIndex([{ path: 'README.md', content: '' }], 'Build failed')).toBe(-1);
});

test('the flat legacy artefact is not mistaken for a package', () => {
  expect(parseGeneratedPackage('export const ok = true;')).toBeNull();
  expect(parseGeneratedPackage('[]'), 'an empty array carries no file to repair').toBeNull();
  expect(parseGeneratedPackage(JSON.stringify([{ path: 'a.ts' }])), 'a half-shaped entry is not a package').toBeNull();
  expect(parseGeneratedPackage(undefined)).toBeNull();
});

test('replacing a file outside the package is refused, not silently ignored', () => {
  expect(() => replaceFileContent(PACKAGE, 9, 'x')).toThrow(/no file at index/);
  expect(() => replaceFileContent(PACKAGE, -1, 'x')).toThrow(/no file at index/);
});

/**
 * Which artefact a repair is aimed at (QA 1c8234b64f35).
 *
 * The whole decision used to be `/app\.ts/.test(errorText) || !suite`. A
 * generated CAP package contains `srv/service.cds`, `db/schema.cds`,
 * `srv/handlers/order.ts` and whatever else the model wrote; an error in any of
 * them matches no `app.ts`, and because a suite existed the repair went at the
 * **test suite**. The model was asked to fix code that was not broken, the
 * broken package went into the retry unchanged, and the patch the run would have
 * left behind was on the suite.
 *
 * The rule is now: the package, unless the error demonstrably belongs to the
 * suite. The suite is the sandbox's `test.ts`, so that is what "demonstrably"
 * means here.
 */
test.describe('the repair aims at the file the compiler named', () => {
  const SUITE = "import { test } from 'node:test';\ntest('TC_01', () => {});\n";
  const stored = JSON.stringify(PACKAGE);

  test('a package error outside app.ts repairs that file, not the suite', () => {
    // The exact shape the old regex missed: a .cds file, with a suite present.
    const t = repairTarget({
      code: stored,
      suite: SUITE,
      errorText: 'srv/service.cds:1:14: ERROR: Expected "}" but found "entity"',
    });
    expect(t, 'the .cds error was blamed on something else').toEqual({ kind: 'package', index: 0 });
    expect(PACKAGE[0].path, 'index 0 is not the file the error named').toBe('srv/service.cds');

    // And the other paths a generated package carries.
    for (const [path, index] of [['db/schema.cds', 2], ['package.json', 3], ['srv/app.ts', 1]] as const) {
      expect(
        repairTarget({ code: stored, suite: SUITE, errorText: `${path}:2:1: ERROR: Unexpected "!"` }),
        `${path} was not chosen`,
      ).toEqual({ kind: 'package', index });
    }
  });

  test('the suite is chosen only when the error names it', () => {
    expect(
      repairTarget({ code: stored, suite: SUITE, errorText: '/tmp/cc-tests-x/test.ts:2:9: ERROR: Expected ";"' }),
    ).toEqual({ kind: 'test' });
    // Windows separators reach the same answer.
    expect(
      repairTarget({ code: stored, suite: SUITE, errorText: 'C:\\Temp\\cc-tests-x\\test.ts:2:9: ERROR: Expected ";"' }),
    ).toEqual({ kind: 'test' });
    // A package file whose name merely ends in `test.ts` is not the suite.
    const pkg = JSON.stringify([{ path: 'srv/smoketest.ts', content: 'x' }]);
    expect(
      repairTarget({ code: pkg, suite: SUITE, errorText: 'srv/smoketest.ts:1:1: ERROR: Unexpected "x"' }),
    ).toEqual({ kind: 'package', index: 0 });
  });

  test('an error that names nothing stays with the package, which is the artefact under test', () => {
    expect(repairTarget({ code: stored, suite: SUITE, errorText: 'Build failed with 1 error' })).toEqual({
      kind: 'package',
      index: 1,
    });
    // A package with nothing the bundler could have compiled: the suite is then
    // the only candidate left, and that is a deduction rather than a guess.
    const dataOnly = JSON.stringify([{ path: 'db/schema.cds', content: 'entity Order {}' }]);
    expect(repairTarget({ code: dataOnly, suite: SUITE, errorText: 'Build failed with 1 error' })).toEqual({
      kind: 'test',
    });
    expect(repairTarget({ code: dataOnly, suite: '', errorText: 'Build failed' })).toMatchObject({ kind: 'none' });
  });

  test('the flat legacy source is still repaired as one module', () => {
    const flat = 'export const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);';
    expect(repairTarget({ code: flat, suite: SUITE, errorText: 'app.ts:1:22: ERROR: Expected identifier' })).toEqual({
      kind: 'module',
    });
    expect(repairTarget({ code: flat, suite: SUITE, errorText: 'test.ts:1:1: ERROR: Expected ";"' })).toEqual({
      kind: 'test',
    });
    expect(repairTarget({ code: '', suite: SUITE, errorText: 'Build failed' })).toEqual({ kind: 'test' });
    expect(repairTarget({ code: '', suite: '', errorText: 'Build failed' })).toMatchObject({ kind: 'none' });
  });

  test('naming a file and falling back to one are two questions', () => {
    // `failingFileIndex` guesses when nothing is named — which is right once the
    // package is known to be the subject, and wrong while that is what is being
    // decided. `namedFileIndex` is the half that does not guess.
    expect(namedFileIndex(PACKAGE, 'Build failed with 1 error')).toBe(-1);
    expect(failingFileIndex(PACKAGE, 'Build failed with 1 error')).toBe(1);
    expect(namedFileIndex(PACKAGE, 'db/schema.cds:1:1: ERROR')).toBe(2);
  });

  test('the hook takes its target from that decision and from no regex of its own', () => {
    const src = hookSource();
    expect(src, 'the repair target is decided in the hook again').toContain('repairTarget({');
    expect(
      src.replace(/^\s*\/\/.*$/gm, ''),
      'the single-filename target test is back — a package holds arbitrary paths',
    ).not.toMatch(/targetsModule/);
  });
});

test('nothing is written to the project until a run compiles — and the server writes it, not the hook', () => {
  const src = hookSource();

  // Roadmap 8.7 (CR-10). The repair used to be held in this hook and written
  // with `updateDoc` after a run "compiled" — but the runner executes only what
  // the server holds, so the run that compiled was never the repair. The
  // repair is now a server-side draft, the retry names it, and the server
  // adopts it by compare-and-swap. The hook writes nothing to Firestore.
  expect(src, 'the hook writes to Firestore again').not.toMatch(/\b(updateDoc|setDoc|addDoc)\s*\(/);
  expect(src, 'the repair is held in memory again').not.toContain('pendingPatch');

  // The repair branch: from `if (result.buildError` to the catch that ends it.
  const start = src.indexOf('if (result.buildError && attempt < maxRetries)');
  expect(start, 'the repair branch moved — this guard names it').toBeGreaterThan(-1);
  const end = src.indexOf('} catch (healError)', start);
  expect(end).toBeGreaterThan(start);
  const branch = src.slice(start, end);
  expect(branch, 'a repair becomes a draft on the server').toContain("action: 'propose'");
  expect(branch, 'and the draft names the base it repaired').toContain('expectedCodeDigest');

  // The retry runs the draft, and only a compiled draft is offered for adoption.
  expect(src).toContain('draftId: draft.id');
  const adopt = src.indexOf("action: 'adopt'");
  expect(adopt, 'adoption is the server\'s').toBeGreaterThan(-1);
  const beforeAdopt = src.slice(src.indexOf('if (!draft) return result;'), adopt);
  expect(beforeAdopt, 'a draft that did not compile is never offered').toMatch(/if \(result\.buildError\) \{/);

  // The model still only ever sees the one file it is asked to repair, and the
  // draft names that file by index and path so the server can check it.
  expect(src, 'the model still only ever sees the one file it is asked to repair').toContain(
    'autoHealCode(errText, pkg[idx].content',
  );
  expect(src).toContain("draftTarget = { kind: 'package', index: idx, path: pkg[idx].path }");
});
