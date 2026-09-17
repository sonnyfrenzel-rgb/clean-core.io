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
 * Which file the compiler was complaining about.
 *
 * The error text names a path, so the longest path it names wins — `srv/app.ts`
 * over `app.ts` when both appear. Failing that, `app.ts` is the name the flat
 * fallback is written under, and after that the first compilable file. `-1` means
 * nothing in the package could be the subject, and the caller must then leave the
 * package alone rather than guess.
 */
export function failingFileIndex(files: GeneratedFile[], errorText: string): number {
  let best = -1;
  let bestLen = -1;
  files.forEach((f, i) => {
    const base = f.path.split('/').pop() || f.path;
    if ((errorText.includes(f.path) || errorText.includes(base)) && f.path.length > bestLen) {
      best = i;
      bestLen = f.path.length;
    }
  });
  if (best !== -1) return best;
  const app = files.findIndex((f) => /(^|\/)app\.(ts|js|tsx|jsx)$/i.test(f.path));
  if (app !== -1) return app;
  return files.findIndex((f) => /\.(ts|js|tsx|jsx)$/i.test(f.path));
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
