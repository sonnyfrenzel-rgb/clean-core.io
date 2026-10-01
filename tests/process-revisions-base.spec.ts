import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { newerBase } from '../lib/process-revisions';

/**
 * The base the next save is written against only ever moves forward — QA
 * review of 072f79996d01 (0c2270d51419).
 *
 * Opening the editor asks for the newest revision. When the reader saved
 * before that answer landed, the save had already moved the base to N+1 and
 * the late answer (N) set it back, so the next save was refused as
 * `revision-moved` for a revision this screen wrote itself.
 */

test('a late answer older than the base this screen holds does not move it back', () => {
  expect(newerBase(5, 4)).toBe(5);
  expect(newerBase(5, 5)).toBe(5);
});

test('a newer revision saved elsewhere becomes the base, and so does the first one known', () => {
  expect(newerBase(5, 7)).toBe(7);
  expect(newerBase(null, 3)).toBe(3);
});

test('both screens with an editor set the base through it', () => {
  for (const rel of ['app/(app)/project/[projectId]/documentation/page.tsx', 'components/workspace/WorkspaceProcess.tsx']) {
    const src = fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
    expect(src, rel).toContain('baseRevision.current = newerBase(baseRevision.current, record.revision);');
    expect(src, rel).not.toContain('baseRevision.current = record.revision;');
  }
});

test('the opening baseline on the documentation stage cannot set the base back either', () => {
  // Carried QA finding 85a623a08fcf: the baseline asked for on opening answered
  // after a Save had moved the base to 2, and set it back to 1.
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'app/(app)/project/[projectId]/documentation/page.tsx'), 'utf8');
  const opening = src.match(/void ensureProcessBaseline\(idStr\)\.then\(\(outcome\) => \{([\s\S]*?)\r?\n {4}\}\);/);
  expect(opening, 'the opening baseline call is not where this test looks').not.toBeNull();
  expect(opening![1]).toContain('baseRevision.current = newerBase(baseRevision.current, outcome.record.revision);');
});
