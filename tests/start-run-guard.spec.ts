import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * QA c52492a3ee43: the start run's module guard (one start per project and
 * page view) kept a project after its run had signed. A later "Sign the
 * reading" in the same page view then returned without a word — the silent
 * no-op the owner ruled out on 03.10.2026. Once the project is read back with
 * its run, `startable` holds the next click back, and the guard lets go.
 */
const src = fs.readFileSync(path.resolve(__dirname, '..', 'hooks', 'useStartRun.ts'), 'utf8');

test('the start guard lets go of a project once its run is signed and read back', () => {
  const signed = src.indexOf('await onSignedRef.current();');
  const phase = src.indexOf("setPhase('signed');", signed);
  expect(signed, 'the start no longer reads the project back after signing').toBeGreaterThan(-1);
  expect(phase).toBeGreaterThan(signed);
  expect(src.slice(signed, phase)).toContain('started.delete(projectId);');
});

test('a failed start can still be tried again by hand', () => {
  const failed = src.indexOf("setPhase('failed');");
  expect(failed).toBeGreaterThan(-1);
  expect(src.slice(src.lastIndexOf('catch', failed), failed)).toContain('started.delete(projectId);');
});

test('a running start still blocks a second one', () => {
  const add = src.indexOf('started.add(projectId);');
  expect(add).toBeGreaterThan(-1);
  expect(src.slice(0, add)).toContain('started.has(projectId)');
});
