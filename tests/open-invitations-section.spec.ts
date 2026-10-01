import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The "Waiting for an answer" section — QA review of 072f79996d01.
 *
 *   - f57f1fbd10b6: two of these can be mounted at once (the workspace's
 *     Sharing section and the share dialog), and both carried the literal id
 *     `open-invitations-title`, so both `aria-labelledby` pointed at the first.
 *     The id now comes from `useId`.
 *   - e3b18275fa41: the read goes through `getIdToken()`, which rejects when
 *     the token cannot be refreshed; the effect had no `.catch`, so that was
 *     an unhandled rejection. A failed read now ends like any other failed
 *     read: no section.
 */

const src = fs.readFileSync(path.resolve(__dirname, '..', 'components', 'workspace', 'OpenInvitations.tsx'), 'utf8').replace(/\r\n/g, '\n');

test('the heading id is unique per mounted section', () => {
  expect(src).not.toMatch(/id="open-invitations-title"/);
  expect(src).not.toMatch(/aria-labelledby="open-invitations-title"/);
  expect(src).toMatch(/const titleId = useId\(\);/);
  expect(src).toMatch(/aria-labelledby=\{titleId\}/);
  expect(src).toMatch(/id=\{titleId\}/);
});

test('a rejected read is handled, not left unhandled', () => {
  const effect = src.slice(src.indexOf('useEffect(() => {\n    let alive = true;'), src.indexOf('const withdraw'));
  expect(effect.length).toBeGreaterThan(0);
  expect(effect).toMatch(/\.catch\(\(\) => \{/);
});
