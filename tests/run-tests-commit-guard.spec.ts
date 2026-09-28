import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sameTestRunInputs } from '../lib/test-receipt';

/**
 * A test run records its verdicts only onto the project it executed
 * (QA full review of fc787674705f, ee7b72f51837).
 *
 * `/api/run-tests` reads the project, runs the suite — seconds to minutes —
 * and then wrote `executedCases`, built from that read, with a merge-set. A
 * suite regenerated meanwhile was overwritten with the old cases; a project
 * deleted meanwhile came back as a stub holding stale verdicts. The write is
 * now a transaction that re-reads the project and compares it with what ran.
 */
const PROJECT = {
  activeRunId: 'run-1',
  generatedCode: 'export const x = 1;\n',
  testSuite: { code: "test('a', () => {});\n" },
  testCases: [{ id: 'TC-1', title: 'a', status: 'Not run' }],
};

test.describe('the inputs a run executed, compared at commit', () => {
  test('the same project is the same, and a verdict written meanwhile is not a change', () => {
    expect(sameTestRunInputs(PROJECT, { ...PROJECT })).toBe(true);
    // Another run of the same suite committed first: only verdicts differ.
    expect(sameTestRunInputs(PROJECT, { ...PROJECT, testCases: [{ ...PROJECT.testCases[0], status: 'Passed', message: 'ok' }] })).toBe(true);
  });

  const changes: Array<[string, Record<string, unknown>]> = [
    ['a new analysis run', { activeRunId: 'run-2' }],
    ['regenerated code', { generatedCode: 'export const x = 2;\n' }],
    ['a regenerated suite', { testSuite: { code: "test('b', () => {});\n" } }],
    ['a changed spec fallback', { testSuite: { ...PROJECT.testSuite, spec: 'other' } }],
    ['regenerated cases', { testCases: [{ id: 'TC-9', title: 'new', status: 'Not run' }] }],
    ['cases removed', { testCases: [] }],
  ];
  for (const [name, patch] of changes) {
    test(`${name} is a change`, () => {
      expect(sameTestRunInputs(PROJECT, { ...PROJECT, ...patch })).toBe(false);
    });
  }

  test('the route records inside a transaction that re-reads and compares', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/run-tests/route.ts'), 'utf8');
    const start = src.indexOf('await db.runTransaction(async (tx: Transaction)');
    expect(start, 'the verdicts are no longer written in a transaction').toBeGreaterThan(-1);
    const tx = src.slice(start, src.indexOf('recorded = moved === null;', start));
    expect(tx).toContain('await tx.get(projectRef)');
    expect(tx).toMatch(/if \(!fresh\.exists\) return 'project-gone'/);
    expect(tx).toMatch(/if \(now\.userId !== decodedToken\.uid\) return 'project-gone'/);
    expect(tx).toMatch(/if \(!sameTestRunInputs\(projectData, now\)\) return 'project-changed'/);
    // The comparison comes before the write, and the write is the transaction's.
    expect(tx.indexOf('sameTestRunInputs(')).toBeLessThan(tx.search(/tx\.set\(\s*projectRef/));
    // And no write onto the project outside it any more.
    const outside = src.slice(0, start) + src.slice(start + tx.length);
    expect(outside).not.toMatch(/\.doc\(sanitizedProjectId\)\s*\.set\(/);
    // A refused commit is a refusal, not a green result.
    expect(src).toMatch(/if \(moved\) \{[\s\S]{0,1200}?testResults: \[\][\s\S]{0,200}?status: moved === 'project-gone' \? 404 : 409/);
  });
});
