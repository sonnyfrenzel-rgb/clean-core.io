import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * A facts read that lands after its row's source moved on is dropped — QA
 * review of 072f79996d01 (f6b48d1132e4).
 *
 * The list is live (`onSnapshot`), so a row's source key can change while its
 * facts are being read; the hook then asks again. Both answers raced to
 * `setFacts`, and the older one could land last and stand under the new key,
 * never re-read. Each read now remembers the key it was asked for and is
 * applied only while that is still the key on record.
 */

const src = fs
  .readFileSync(path.resolve(__dirname, '..', 'hooks', 'useWorkspaceRowFacts.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

test('a read is applied only for the key it was asked for', () => {
  const pump = src.slice(src.indexOf('const pump = () => {'), src.indexOf('const fresh: string[] = [];'));
  expect(pump).toMatch(/const key = asked\.current\.get\(id\);/);
  expect(pump).toMatch(/if \(alive\.current && asked\.current\.get\(id\) === key\) setFacts\(/);
});
