import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * QA review of 68f94017 (slice 891126f7..68f94017).
 *   475c699f5eae — a confirmation that cannot be sent (offline, a token that
 *   needs re-authentication) rejected with no message: the import had a catch,
 *   the confirmation only a finally.
 *   04403c75e7c3 — the handover's next-step reason called a self-declaration
 *   "passing test results from your SAP system", the import's wording.
 */
const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('a confirmation that cannot be sent tells the reader so', () => {
  const src = read('components/testing/SapResultCard.tsx');
  const onConfirm = src.slice(src.indexOf('const onConfirm'), src.indexOf('const unmatched'));
  expect(onConfirm, 'onConfirm found').toContain("action: 'confirm'");
  expect(onConfirm).toMatch(/\}\s*catch\s*\{\s*setError\(/);
});

test('the next-step reason names a confirmation as a self-declaration, not as an imported result', () => {
  const src = read('lib/handover.ts');
  expect(src).not.toContain('passing test results from your SAP system are there');
  expect(src).toMatch(/verifiedOutside === 'imported'\s*\?\s*'a passing test result imported from your SAP system'\s*:\s*'your confirmation that the tests passed in your SAP system \(a self-declaration\)'/);
});
