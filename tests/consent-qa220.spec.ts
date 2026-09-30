import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * QA full review of v2.20.0 (bb84b270cb2e): `recordConsent` appended the
 * consent event and then, in a second awaited write, mirrored the version onto
 * the profile that enforcement reads. A failure between the two left an
 * acceptance on record that enforcement never saw, and a retry appended a second
 * event. Both writes now go into one batch and commit together.
 *
 * A source guard, because the failure it prevents is a Firestore write failing
 * between two others, which no emulator run can be made to produce on demand;
 * `tests/terms-version-archive.spec.ts` covers what the committed record holds.
 */
test('recordConsent commits the event and the profile mirror in one batch', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'lib/consent.ts'), 'utf8').replace(/\r\n/g, '\n');
  const start = src.indexOf('export async function recordConsent');
  expect(start, 'recordConsent is still in lib/consent.ts').toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf('\n}\n', start));

  expect(body).toContain('db.batch()');
  expect(body).toMatch(/batch\.create\(\s*db\.collection\('consent_events'\)\.doc\(\)/);
  expect(body).toMatch(/batch\.set\(\s*db\.collection\('users'\)\.doc\(uid\)/);
  expect(body.match(/await batch\.commit\(\)/g) ?? []).toHaveLength(1);
  // No write of its own outside the batch.
  expect(body).not.toMatch(/await db\.collection\(/);
  expect(body).not.toMatch(/\.add\(/);
});
