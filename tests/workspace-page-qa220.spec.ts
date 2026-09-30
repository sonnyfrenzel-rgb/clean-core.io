import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * QA baa8990fb123 (full review of v2.20.0): the workspace page turned every
 * failed project read into a 404. The Firestore rules answer
 * `permission-denied` for a project that does not exist and for one that is not
 * the reader's alike, so that code stays a 404; any other failure — the
 * network, an unavailable backend — is a read that failed and gets a retryable
 * error, not "not found".
 *
 * A source guard: a transient Firestore outage cannot be produced for one read
 * without also stopping the profile listener the page waits for.
 */

const PAGE = 'app/(app)/project/[projectId]/page.tsx';
const src = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');

test('only permission-denied becomes a 404; any other failed read is an error state', () => {
  const load = src.slice(src.indexOf('await loadProjectAndHydrate(projectId)'), src.indexOf('return () => {'));
  const handler = load.slice(load.indexOf('} catch'));
  expect(handler, 'the catch sends every failure to notFound()').not.toMatch(/setState\('missing'\)/);
  expect(handler).toContain("code === 'permission-denied' ? 'missing' : 'failed'");
});

test('the failed state renders a retry, not notFound()', () => {
  const failed = src.slice(src.indexOf("if (state === 'failed')"));
  expect(src).toContain("if (state === 'failed')");
  // The block up to the next state check or the shell.
  const block = failed.slice(0, failed.indexOf('<WorkspaceShell'));
  expect(block.length).toBeGreaterThan(0);
  expect(block).not.toContain('notFound()');
  expect(block).toContain('Try again');
});
