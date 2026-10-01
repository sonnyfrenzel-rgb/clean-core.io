import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { landViewedCode } from '../lib/starter-examples';

/**
 * A code view the reader closed stays closed — QA review of ead81747aa34
 * (0ef0c85f4718).
 *
 * "View code" on a shipped example opens the dialog with "Loading the code…"
 * and fetches the file. Closing the dialog before the fetch lands used to be
 * undone by the fetch: it set the dialog's content unconditionally and so
 * reopened it. The finished load now lands only in the dialog still waiting for
 * it — not in a closed one, and not in one the reader has since switched to
 * another example.
 */

test('a load lands in the dialog that is waiting for it', () => {
  expect(landViewedCode({ title: 'PO approval', code: null }, 'PO approval', 'REPORT z.')).toEqual({ title: 'PO approval', code: 'REPORT z.' });
});

test('a load that finishes after the dialog was closed does not reopen it', () => {
  expect(landViewedCode(null, 'PO approval', 'REPORT z.')).toBeNull();
});

test('a load that finishes after the reader switched to another example does not replace it', () => {
  const other = { title: 'Vendor block', code: 'REPORT y.' };
  expect(landViewedCode(other, 'PO approval', 'REPORT z.')).toBe(other);
  const waiting = { title: 'Vendor block', code: null };
  expect(landViewedCode(waiting, 'PO approval', 'REPORT z.')).toBe(waiting);
});

test('the gallery settles both the loaded and the failed fetch through it', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'components', 'StarterExamples.tsx'), 'utf8');
  const view = src.slice(src.indexOf('const view = async'), src.indexOf('};', src.indexOf('const view = async')));
  expect(view.match(/setViewing\(\(current\) => landViewedCode\(current, /g) ?? []).toHaveLength(2);
});
