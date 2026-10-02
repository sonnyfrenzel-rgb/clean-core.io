import { test, expect } from '@playwright/test';
import { MAX_TABULAR_IMPORT_BYTES, parseTabularRows } from '../lib/abap/tabular-import';

/**
 * ATC and usage imports are parsed in the browser (external review, 02.10.2026):
 * a file above the cap is refused with its size and the cap before a byte is read,
 * so a huge export cannot freeze the tab.
 */

/** A File-shaped stand-in that reports a size and fails if anything reads it. */
function bigFile(bytes: number): File {
  const unread = () => {
    throw new Error('the file was read');
  };
  return { name: 'atc.csv', size: bytes, text: unread, arrayBuffer: unread, slice: unread } as unknown as File;
}

test('a file above the cap is refused with its size, unread', async () => {
  await expect(parseTabularRows(bigFile(MAX_TABULAR_IMPORT_BYTES + 1))).rejects.toThrow(/at most 50 MB/);
  await expect(parseTabularRows(bigFile(300 * 1024 * 1024))).rejects.toThrow(/This file is 300 MB/);
});

test('the cap is 50 MB', () => {
  expect(MAX_TABULAR_IMPORT_BYTES).toBe(50 * 1024 * 1024);
});
