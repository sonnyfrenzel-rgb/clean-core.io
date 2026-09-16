/**
 * Which of the shipped starter examples a submitted ABAP source actually is.
 *
 * Roadmap 0.9 (decision Sonny, 15.09.2026): the eight examples the product ships
 * do not cost a run of the free quota — each of them once per account. The
 * recognition has to sit where the bookkeeping sits, on the server, and it has to
 * be made from the source text itself. A flag from the client saying "this is an
 * example" would mint free runs on request, and an example somebody edited before
 * starting it is their own code and costs a run like anybody else's.
 *
 * The fingerprint is taken the way the browser produces it. `loadStarterExample`
 * fetches `/starter-examples/<file>` and `Response.text()` decodes UTF-8 and drops
 * a byte-order mark — one of the eight files has one — and that string is what
 * travels to `/api/runs/create`, which hashes its UTF-8 bytes. Reading the same
 * file off disk and stripping the same mark reproduces that hash exactly.
 *
 * Which is also why the hashes are computed here instead of being committed as
 * constants: these sources are checked out with the line endings of the machine
 * that serves them (`core.autocrlf` on Windows, LF in the Linux build), so a
 * committed constant would be right in one environment and silently wrong in the
 * other — and "silently wrong" here means every example costs a unit again.
 */

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { STARTER_EXAMPLES } from './starter-examples';

/** Where the sources live, relative to the project root. */
export const STARTER_EXAMPLE_DIR = path.join('public', 'starter-examples');

/**
 * The fingerprint of one example source, taken over the text as the browser hands
 * it on: UTF-8, without a leading byte-order mark.
 */
export function fingerprintExampleSource(raw: string): string {
  return createHash('sha256').update(Buffer.from(raw.replace(/^﻿/, ''), 'utf8')).digest('hex');
}

let cached: Map<string, string> | null = null;

/** sha256 of each shipped example → the example's object name. */
export async function starterExampleIndex(): Promise<Map<string, string>> {
  if (cached) return cached;
  const built = new Map<string, string>();
  for (const example of STARTER_EXAMPLES) {
    try {
      const raw = await readFile(path.join(process.cwd(), STARTER_EXAMPLE_DIR, example.file), 'utf8');
      built.set(fingerprintExampleSource(raw), example.name);
    } catch {
      // Deliberately swallowed and deliberately not cached below: a source that
      // cannot be read is simply not recognised, so the run is charged. Failing
      // towards charging is the safe direction — the opposite would hand out free
      // runs for any source at all.
    }
  }
  // Only a complete index is kept. A transient read failure must not freeze a
  // gap into the process for the rest of its life.
  if (built.size === STARTER_EXAMPLES.length) cached = built;
  return built;
}

/**
 * The name of the shipped example this source is, or null — for anything the
 * visitor wrote, and for an example they changed a character of.
 */
export async function starterExampleForFingerprint(inputHash: string): Promise<string | null> {
  if (typeof inputHash !== 'string' || inputHash.length === 0) return null;
  return (await starterExampleIndex()).get(inputHash) ?? null;
}
