import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * No source file is double-encoded.
 *
 * On 11.10.2026 one component reached the release branch with every "—", "€"
 * and "§" written as "â€”", "â‚¬" and "Â§": UTF-8 read as Windows-1252 and saved
 * again. TypeScript compiles it, every guard that reads words passes, and the
 * reader sees mangled text on the page. The mark of that round trip is a lead
 * byte ("â", "Ã", "Â") followed by a continuation byte as Windows-1252 shows it,
 * which never occurs in English copy.
 */
const ROOT = path.resolve(__dirname, '..');
const DIRS = ['app', 'components', 'lib', 'hooks', 'scripts', 'tests', 'docs'];
// A UTF-8 continuation byte (0x80-0xBF) as Windows-1252 shows it: 0x80-0x9F become
// these punctuation marks (C1 controls where 1252 leaves a gap), 0xA0-0xBF stay
// Latin-1. Every second byte matters: the euro sign is E2 82 AC, so its mark goes
// on with the low quote U+201A, not with U+20AC; "Ö" (C3 96) ends in an en dash.
const CONT =
  '[\\u0080-\\u00BF\\u20AC\\u201A\\u0192\\u201E\\u2026\\u2020\\u2021\\u02C6\\u2030\\u0160\\u2039' +
  '\\u0152\\u017D\\u2018\\u2019\\u201C\\u201D\\u2022\\u2013\\u2014\\u02DC\\u2122\\u0161\\u203A' +
  '\\u0153\\u017E\\u0178]';
const DOUBLE_ENCODED = new RegExp(`[\\u00E2\\u00C3]${CONT}|\\u00C2[\\u00A0-\\u00BF]`);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'archiv') continue;
      walk(full, out);
    } else if (/\.(tsx?|mjs|md|json|ya?ml)$/.test(e.name)) out.push(full);
  }
  return out;
}

test('no source file carries UTF-8 that was read as Windows-1252 and saved again', () => {
  const hits: string[] = [];
  let files = 0;
  for (const dir of DIRS) {
    for (const full of walk(path.join(ROOT, dir))) {
      if (full === __filename) continue;
      files++;
      fs.readFileSync(full, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (DOUBLE_ENCODED.test(line)) hits.push(`${path.relative(ROOT, full)}:${i + 1}`);
      });
    }
  }
  expect(files, 'the guard read the source tree').toBeGreaterThan(1000);
  expect(hits).toEqual([]);
});

test('the guard rejects every mark of the round trip, the euro sign included', () => {
  // Built from escapes, so the fixtures read the same whatever this file's encoding.
  const mangled: Record<string, string> = {
    euro: 'â‚¬',
    emDash: 'â€”',
    section: 'Â§',
    eAcute: 'Ã©',
    oUmlaut: 'Ã–',
    sharpS: 'ÃŸ',
  };
  for (const [name, text] of Object.entries(mangled)) {
    expect(DOUBLE_ENCODED.test(`Price: 5 ${text} per seat`), name).toBe(true);
  }
  const clean = [
    'Price: 5 € per seat — see § 3',
    'Grüße aus Köln',
    'café, naïve, Âge',
  ];
  for (const text of clean) expect(DOUBLE_ENCODED.test(text), text).toBe(false);
});
