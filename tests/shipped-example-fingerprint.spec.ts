import { test, expect } from '@playwright/test';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { RETIRED_EXAMPLE_FILES, STARTER_EXAMPLES } from '../lib/starter-examples';
import { scanForPersonalDataHints } from '../lib/personal-data-hints';
import {
  SHIPPED_EXAMPLE_FINGERPRINTS,
  isUnchangedShippedExample,
  normaliseShippedExampleSource,
  shippedExampleFingerprint,
} from '../lib/shipped-example-fingerprint';

/**
 * An unchanged starter example skips the personal-data hint; a changed one does
 * not (roadmap 3.0.15 (4), carried into 3.0.17 (4); owner 16.10.2026: the
 * 1,000-line example warned its reader about its own sender address).
 *
 * Three halves. Every shipped example is recognised, however its line endings
 * arrived. One changed character makes the 1,000-line example the reader's own
 * code again, and the hint it raised before stands on the same line again. And
 * the committed fingerprint list is recomputed here from the files themselves,
 * with a hash that is not the module's, so it cannot drift from them.
 */

const ROOT = path.resolve(__dirname, '..');
const EXAMPLES = path.join(ROOT, 'public', 'starter-examples');
const BIG = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const read = (file: string) => fs.readFileSync(path.join(EXAMPLES, file), 'utf8');

/** What the gallery and the import panel do with a source: the gate as wired. */
const hintsAsShown = (text: string) => (isUnchangedShippedExample(text) ? [] : scanForPersonalDataHints(text));

test.describe('every shipped starter example skips the hint', () => {
  for (const example of STARTER_EXAMPLES) {
    test(`${example.file} is recognised as it is served, with LF and with CRLF`, () => {
      const raw = read(example.file);
      // The text as `Response.text()` hands it on (no BOM), and both line-ending
      // forms a checkout, a download or a paste can produce.
      const served = raw.replace(/^﻿/, '');
      const lf = served.replace(/\r\n?/g, '\n');
      const crlf = lf.replace(/\n/g, '\r\n');
      for (const [label, text] of [['raw', raw], ['served', served], ['LF', lf], ['CRLF', crlf], ['pasted', lf.trimEnd()]] as const) {
        expect(isUnchangedShippedExample(text), `${example.file} (${label}) was not recognised`).toBe(true);
        expect(hintsAsShown(text), `${example.file} (${label}) still shows the hint`).toEqual([]);
      }
    });
  }

  test('the three that would raise a hint are among them — the exemption is not vacuous', () => {
    for (const file of [BIG, 'Z_EMPLOYEE_EXPENSE_VAL.txt', 'Z_BUSINESS_PARTNER_SYNC.txt']) {
      expect(scanForPersonalDataHints(read(file)).length, `${file} no longer raises a hint`).toBeGreaterThan(0);
    }
  });
});

test.describe('one changed character and the hint is back', () => {
  const original = read(BIG);
  const originalHints = scanForPersonalDataHints(original);

  test('the 1,000-line example raises its mail-address hint where it did before', () => {
    expect(originalHints.map((h) => h.kind)).toEqual(['mail-address-field']);
    const hintLine = originalHints[0].line;
    const lines = original.split('\n');

    // A change far from the hint, in a line of its own: a letter in the first line.
    const firstLetter = lines[0].search(/[A-Za-z]/);
    expect(firstLetter).toBeGreaterThan(-1);
    const flipped = lines[0][firstLetter] === 'X' ? 'Y' : 'X';
    const edited = [lines[0].slice(0, firstLetter) + flipped + lines[0].slice(firstLetter + 1), ...lines.slice(1)].join('\n');

    expect(edited.length).toBe(original.length);
    expect(isUnchangedShippedExample(edited), 'an edited example was still treated as the shipped one').toBe(false);
    const shown = hintsAsShown(edited);
    expect(shown.map((h) => [h.kind, h.line])).toEqual([['mail-address-field', hintLine]]);
    expect(shown).toEqual(originalHints);
  });

  test('a space inside a line, an added line or a removed one is a change too', () => {
    const lf = normaliseShippedExampleSource(original);
    const lines = lf.split('\n');
    const mid = Math.floor(lines.length / 2);
    const variants = {
      'space inside a line': lf.replace(/ /, '  '),
      'added line': [...lines.slice(0, mid), '* note', ...lines.slice(mid)].join('\n'),
      'removed line': [...lines.slice(0, mid), ...lines.slice(mid + 1)].join('\n'),
      'blank line added': [...lines.slice(0, mid), '', ...lines.slice(mid)].join('\n'),
    };
    for (const [label, text] of Object.entries(variants)) {
      expect(isUnchangedShippedExample(text), `${label} still recognised as the shipped example`).toBe(false);
      expect(hintsAsShown(text).length, `${label}: the hint did not come back`).toBeGreaterThan(0);
    }
  });

  test('nothing and anything else is not an example', () => {
    expect(isUnchangedShippedExample('')).toBe(false);
    expect(isUnchangedShippedExample("REPORT z.\nlv_mail = 'a.b@example.com'.")).toBe(false);
  });
});

test.describe('the fingerprint list cannot drift from the files', () => {
  /** Recomputed independently: Node's SHA-256, not the module's pure-JS one. */
  const nodeFingerprint = (text: string) =>
    createHash('sha256').update(normaliseShippedExampleSource(text), 'utf8').digest('hex');

  test('one entry per registered example, and one registered example per file', () => {
    const registered = STARTER_EXAMPLES.map((e) => e.file).sort();
    expect(Object.keys(SHIPPED_EXAMPLE_FINGERPRINTS).sort()).toEqual(registered);
    // A retired example's file stays as a regression fixture until 3.0.18 and is named, never silently left.
    expect(fs.readdirSync(EXAMPLES).filter((f) => !RETIRED_EXAMPLE_FILES.includes(f)).sort()).toEqual(registered);
    for (const f of RETIRED_EXAMPLE_FILES) {
      expect(registered, f).not.toContain(f);
      // Kept as a regression fixture until 3.0.18: it must still be there (QA review of 0a1d2036f5ed).
      expect(fs.existsSync(path.join(EXAMPLES, f)), f).toBe(true);
    }
  });

  test('every entry is the fingerprint of the file as it stands', () => {
    const fresh: Record<string, string> = {};
    for (const example of STARTER_EXAMPLES) fresh[example.file] = nodeFingerprint(read(example.file));
    const stale = Object.keys(fresh).filter((file) => SHIPPED_EXAMPLE_FINGERPRINTS[file] !== fresh[file]);
    expect(
      stale,
      `stale fingerprints in lib/shipped-example-fingerprint.ts — replace the list with:\n${JSON.stringify(fresh, null, 2)}`,
    ).toEqual([]);
  });

  test("the module's hash agrees with Node's", () => {
    for (const example of STARTER_EXAMPLES) {
      const raw = read(example.file);
      expect(shippedExampleFingerprint(raw), example.file).toBe(nodeFingerprint(raw));
    }
  });
});

test.describe('every path that shows the hint asks the fingerprint first', () => {
  for (const rel of [
    'components/StarterExamples.tsx',
    'components/workspace/OwnCodeImport.tsx',
    'app/(app)/project/[projectId]/analyze/page.tsx',
  ]) {
    test(rel, () => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const calls = src.match(/scanForPersonalDataHints\(/g) ?? [];
      const guarded = src.match(/isUnchangedShippedExample\([^)]*\)[^;]{0,40}\?[^;]{0,60}scanForPersonalDataHints\(|isUnchangedShippedExample\([^)]*\)\s*\?\s*\[\]\s*:\s*scanForPersonalDataHints\(/g) ?? [];
      expect(calls.length, `${rel} no longer scans`).toBeGreaterThan(0);
      expect(guarded.length, `${rel} scans a source without asking whether it is an unchanged shipped example`).toBe(
        calls.length,
      );
    });
  }
});
