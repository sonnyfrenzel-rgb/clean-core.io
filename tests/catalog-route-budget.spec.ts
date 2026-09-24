import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The two project routes that run the catalog-backed engine on every request
 * had no request budget, while the decision read next to them had one (QA review
 * of 4b4586aff273). `middleware.ts` excludes `/api` from its matcher, so a route
 * that does not call the limiter itself is unmetered.
 */
const ROOT = path.resolve(__dirname, '..');
const code = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

for (const rel of [
  'app/api/projects/[projectId]/findings/route.ts',
  'app/api/projects/[projectId]/contract/route.ts',
]) {
  test(`${rel} meters every request per account before it reads the project`, () => {
    const src = code(rel);
    expect(src, `${rel} does not import the limiter`).toContain("from '@/lib/rate-limit'");
    const call = src.match(/assertRateLimit\(\s*`([^`]+)`\s*,\s*(\d+)\s*,([^)]+)\)/);
    expect(call, `${rel} calls no limiter`).not.toBeNull();
    expect(call![1], `${rel} does not key its limit on the account`).toContain('${decodedToken.uid}');
    expect(call![1], `${rel} keys its limit on something the caller can change`).not.toContain('getClientIp');
    expect(Number(call![2])).toBeLessThanOrEqual(240);
    // Before the project is loaded, and so before the engine runs: the limiter
    // precedes the first handler's `await params`, and every handler that goes
    // through a shared gate asks that gate before it loads anything.
    expect(src.indexOf('assertRateLimit('), `${rel} limits after it has already done the work`)
      .toBeLessThan(src.indexOf('await params'));
    const gated = src.indexOf('async function authorise');
    if (gated >= 0) {
      expect(src.slice(gated, src.indexOf('export async function')), 'the shared gate is not metered')
        .toContain('assertRateLimit(');
      for (const handler of src.split('export async function ').slice(1)) {
        expect(handler.indexOf('authorise(req)'), 'a handler skips the metered gate').toBeGreaterThanOrEqual(0);
        expect(handler.indexOf('authorise(req)')).toBeLessThan(handler.indexOf('loadProjectAndRun('));
      }
    }
  });
}
