import fs from 'node:fs';
import path from 'node:path';

/**
 * Where the engine's example corpus lives.
 *
 * `public/starter-examples/` holds what the site offers. The three examples retired on 18.10.2026 (owner decision,
 * after an end-to-end check of every example) are no longer served; since 3.0.18 they live in
 * `tests/fixtures/retired-starter-examples/`, because the engine's regression specs still read them — they hold
 * shapes no shipped example has (a program with no entry point, one with no SAP object, an indented `*`).
 *
 * A spec that means "every example the site offers" reads `STARTER_EXAMPLES` or `EXAMPLES_DIR`; a spec that means
 * "every program the engine is pinned on" reads `corpusFiles()`.
 */
export const EXAMPLES_DIR = path.join(__dirname, '..', '..', 'public', 'starter-examples');
export const RETIRED_EXAMPLES_DIR = path.join(__dirname, '..', 'fixtures', 'retired-starter-examples');

/** The path of a corpus file by name: the shipped one, or the retired fixture of that name. */
export function examplePath(file: string): string {
  const shipped = path.join(EXAMPLES_DIR, file);
  if (fs.existsSync(shipped)) return shipped;
  const retired = path.join(RETIRED_EXAMPLES_DIR, file);
  if (fs.existsSync(retired)) return retired;
  throw new Error(`${file} is neither a shipped starter example nor a retired one`);
}

/** The text of a corpus file by name. */
export function readExample(file: string): string {
  return fs.readFileSync(examplePath(file), 'utf8');
}

/**
 * The 1,000-line example and the PO demo as they shipped until 3.0.17, byte for byte.
 *
 * 3.0.18 took their dead code out (the 1,000-line example's fourteen copy-pasted LEGACY_BUSINESS_RULE_0xx routines
 * and three demo routines nothing reached; the PO demo's twelve FORMs nothing performed). The engine still has to
 * read code like that — unreached routines, clones of one routine — and the specs that prove it keep these copies
 * as their fixture. They are not offered and not part of `corpusFiles()`.
 */
export const EXAMPLES_3017_DIR = path.join(__dirname, '..', 'fixtures', 'starter-examples-3.0.17');

/** The text of an example as it shipped until 3.0.17. */
export function readExampleAsOf3017(file: string): string {
  return fs.readFileSync(path.join(EXAMPLES_3017_DIR, file), 'utf8');
}

/**
 * The path a spec that pins the engine's reading of one program, line by line, reads: the 3.0.17 copy where the
 * example changed in 3.0.18 (the PO demo and the 1,000-line example), the shipped or retired file otherwise. What the
 * shipped examples say since 3.0.18 is pinned in tests/starter-examples-3018.spec.ts and in the guards of what the
 * site shows (demo, landing page, reference run, line counts, fingerprints).
 */
export function pinnedExamplePath(file: string): string {
  const frozen = path.join(EXAMPLES_3017_DIR, file);
  return fs.existsSync(frozen) ? frozen : examplePath(file);
}

/** Every corpus file name, shipped and retired, sorted. */
export function corpusFiles(): string[] {
  return [...fs.readdirSync(EXAMPLES_DIR), ...fs.readdirSync(RETIRED_EXAMPLES_DIR)].sort();
}
