import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { archivePrivacy } from '../scripts/legal/archive-privacy';
import { PRIVACY_POLICY_VERSIONS } from '../lib/legal/privacy-versions';

/**
 * `scripts/legal/archive-privacy.ts` never overwrites an archived privacy version: run without ids it would
 * otherwise rewrite every published file after a source change. Server-free; works in a temporary folder only.
 */
const first = PRIVACY_POLICY_VERSIONS[0];
let root = '';
test.beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'privacy-archive-'));
});
test.afterEach(() => rmSync(root, { recursive: true, force: true }));

const put = (file: string, text: string) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text, 'utf8');
};

test('a missing archive file is written, a matching one is left as it is', () => {
  const once = archivePrivacy({ root, wanted: [first.id] });
  expect(once.refused).toEqual([]);
  expect(once.written.sort()).toEqual([first.files.de, first.files.en].sort());
  const again = archivePrivacy({ root, wanted: [first.id] });
  expect(again.written).toEqual([]);
  expect(again.unchanged.sort()).toEqual([first.files.de, first.files.en].sort());
});

test('an archived file that differs from the source is refused, and nothing else is written, also without ids', () => {
  put(first.files.en, 'the text as published\n');
  const result = archivePrivacy({ root });
  expect(result.refused).toEqual([first.files.en]);
  expect(result.written).toEqual([]);
  expect(readFileSync(join(root, first.files.en), 'utf8')).toBe('the text as published\n');
  // No other version's file was created either: the run stops before writing anything.
  for (const v of PRIVACY_POLICY_VERSIONS) {
    if (v.files.de !== first.files.en) expect(() => readFileSync(join(root, v.files.de), 'utf8')).toThrow();
  }
});

test('only --force with the id of a version not yet published overwrites an existing file', () => {
  put(first.files.en, 'the text as published\n');
  // Not yet published: --force with its id overwrites.
  const draft = archivePrivacy({ root, wanted: [first.id], force: true, published: [] });
  expect(draft.refused).toEqual([]);
  expect(draft.written).toContain(first.files.en);
  expect(readFileSync(join(root, first.files.en), 'utf8')).not.toBe('the text as published\n');
});

test('--force never rewrites a published version, and without ids it overwrites nothing', () => {
  put(first.files.en, 'the text as published\n');
  const named = archivePrivacy({ root, wanted: [first.id], force: true, published: [first.id] });
  expect(named.refused).toEqual([first.files.en]);
  expect(named.written).toEqual([]);
  const unnamed = archivePrivacy({ root, force: true, published: [] });
  expect(unnamed.refused).toEqual([first.files.en]);
  expect(unnamed.written).toEqual([]);
  expect(readFileSync(join(root, first.files.en), 'utf8')).toBe('the text as published\n');
  // This build's default: the first version is published.
  expect(archivePrivacy({ root, wanted: [first.id], force: true }).refused).toEqual([first.files.en]);
});
