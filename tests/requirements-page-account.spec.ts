import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * QA 9ac48179a33c / d7a17834d658: the requirements page read the signed-in
 * account once on load, so a sign-in change afterwards kept the old owner and
 * author. Both now come from the auth store.
 */
test('the requirements page reads the owner and the author from the auth store, not once on load', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', '(app)', 'project', '[projectId]', 'design', 'requirements', 'page.tsx'), 'utf8');
  expect(src).toContain('const signedInUid = useSignedInUid();');
  expect(src).toContain('isProjectOwner(project, signedInUid)');
  expect(src).toMatch(/const accountEmail = useSyncExternalStore\(\s*\(listener\) => getAuth\(\)\.onAuthStateChanged/);
  expect(src).not.toMatch(/setAccount\(/);
});
