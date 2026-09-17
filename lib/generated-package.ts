/**
 * The generated artefact, and how a repair is allowed to touch it.
 *
 * The transformation stage serialises what it generated as a JSON array of
 * `{ path, content }` — a package, several files. An older shape, one flat
 * source, still exists in projects that predate it, and `/api/run-tests`
 * materialises both.
 *
 * When the sandbox reports a compile error, the testing stage asks the model to
 * repair **one** module. Its answer — a single TypeScript source — used to be
 * written straight over `project.generatedCode`, which for a package meant every
 * other generated file was replaced by that one module and lost (QA c1523df5fc4e).
 *
 * A module of its own, rather than three closures inside the hook, so the
 * replacement can be run and read back in a test without a browser, a project and
 * a model call — the same reason `lib/survey/link-fetch.ts` exists.
 */

/** One file of a generated package, as the transformation stage serialises it. */
export interface GeneratedFile {
  path: string;
  content: string;
}

/**
 * The package, or `null` for the flat legacy source — which is not a package and
 * must not be treated as one.
 */
export function parseGeneratedPackage(code: string | undefined | null): GeneratedFile[] | null {
  if (!code) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(code);
  } catch {
    return null;
  }
  if (
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every(
      (f) => f && typeof f === 'object' && typeof (f as GeneratedFile).path === 'string' && typeof (f as GeneratedFile).content === 'string',
    )
  ) {
    return parsed as GeneratedFile[];
  }
  return null;
}

/**
 * The file the compiler error **names**, or `-1`. The longest path it names wins
 * — `srv/app.ts` over `app.ts` when both appear.
 *
 * Separate from the fallbacks below because the two answer different questions.
 * This one answers "is the subject of this error in the package at all", which
 * is what decides between the package and the test suite; `failingFileIndex`
 * answers "which file do we repair once we know it is the package's".
 */
export function namedFileIndex(files: GeneratedFile[], errorText: string): number {
  let best = -1;
  let bestLen = -1;
  files.forEach((f, i) => {
    const base = f.path.split('/').pop() || f.path;
    if ((errorText.includes(f.path) || errorText.includes(base)) && f.path.length > bestLen) {
      best = i;
      bestLen = f.path.length;
    }
  });
  return best;
}

/**
 * Which file the compiler was complaining about.
 *
 * The error text names a path, so the longest path it names wins — `srv/app.ts`
 * over `app.ts` when both appear. Failing that, `app.ts` is the name the flat
 * fallback is written under, and after that the first compilable file. `-1` means
 * nothing in the package could be the subject, and the caller must then leave the
 * package alone rather than guess.
 */
export function failingFileIndex(files: GeneratedFile[], errorText: string): number {
  const named = namedFileIndex(files, errorText);
  if (named !== -1) return named;
  const app = files.findIndex((f) => /(^|\/)app\.(ts|js|tsx|jsx)$/i.test(f.path));
  if (app !== -1) return app;
  return files.findIndex((f) => /\.(ts|js|tsx|jsx)$/i.test(f.path));
}

/**
 * The sandbox writes the suite as `test.ts` in the sandbox directory, so that is
 * the name a compiler error about the suite carries. Anchored on a path
 * separator, whitespace or punctuation so `app.test.ts` and `smoketest.ts` — both
 * legitimate names inside a generated package — are not read as the suite.
 */
const SUITE_ENTRY = /(?:^|[\\/\s:'"(])test\.ts\b/;

/** What a compile-error repair is allowed to touch. */
export type RepairTarget =
  | { kind: 'package'; index: number }
  | { kind: 'module' }
  | { kind: 'test' }
  | { kind: 'none'; reason: string };

/**
 * What the compiler was complaining about: one file of the generated package,
 * the flat legacy module, or the test suite.
 *
 * The rule is "the package unless the error demonstrably belongs to the suite",
 * and it is that way round because the package is what was transformed. Until
 * QA 1c8234b64f35 the whole decision was `/app\.ts/.test(errorText) ||
 * !suite` — one filename, in an artefact that contains arbitrary paths. A CAP
 * package reports its errors in `srv/service.cds`, `db/schema.cds` or
 * `srv/handlers/order.ts`; none of those matches `app.ts`, and because a suite
 * existed the repair was aimed at the **test suite** instead. The model was then
 * asked to fix code that was not broken, the broken package went into the retry
 * unchanged, and what the run left behind was a patched suite.
 *
 * `none` is a real answer: a package whose files could not have produced the
 * error is left alone rather than repaired on a guess — the same conservatism
 * `failingFileIndex` returns `-1` for.
 */
export function repairTarget(opts: {
  code?: string | null;
  suite?: string | null;
  errorText: string;
}): RepairTarget {
  const errorText = opts.errorText || '';
  const hasSuite = typeof opts.suite === 'string' && opts.suite.trim().length > 0;
  const blamesSuite = hasSuite && SUITE_ENTRY.test(errorText);
  const pkg = parseGeneratedPackage(opts.code);

  if (pkg) {
    // A file of the package is named: that is the subject, whatever else the
    // error mentions.
    const named = namedFileIndex(pkg, errorText);
    if (named !== -1) return { kind: 'package', index: named };
    if (blamesSuite) return { kind: 'test' };
    const fallback = failingFileIndex(pkg, errorText);
    if (fallback !== -1) return { kind: 'package', index: fallback };
    // Nothing in the package compiles at all — the suite is the only source the
    // bundler could have failed on.
    return hasSuite
      ? { kind: 'test' }
      : { kind: 'none', reason: 'No source file in the generated package matches the compiler error' };
  }

  const hasFlat = typeof opts.code === 'string' && opts.code.trim().length > 0;
  if (!hasFlat) {
    return hasSuite ? { kind: 'test' } : { kind: 'none', reason: 'There is no generated source to repair' };
  }
  // The flat legacy source is materialised as `app.ts`, so an error naming it is
  // the module's; an error naming `test.ts` is the suite's; anything else is the
  // module's, because that is the artefact under test.
  return blamesSuite ? { kind: 'test' } : { kind: 'module' };
}

/**
 * The package with exactly one file's content replaced, serialised the way it is
 * stored. Paths, order and every other file come through untouched.
 */
export function replaceFileContent(files: GeneratedFile[], index: number, content: string): string {
  if (index < 0 || index >= files.length) {
    throw new RangeError(`no file at index ${index} in a package of ${files.length}`);
  }
  return JSON.stringify(files.map((f, i) => (i === index ? { ...f, content } : f)));
}
