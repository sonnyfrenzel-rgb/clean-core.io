import { test, expect } from '@playwright/test';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { parseCleanupLimit } from '../scripts/lib/cleanup-limit';

/**
 * `scripts/cleanup-test-accounts.ts` deletes accounts. A `--limit` that did not parse used to read as no limit at
 * all, and the dry run listed the address of every real account it kept.
 */
const ROOT = path.resolve(__dirname, '..');
const SCRIPT = 'scripts/cleanup-test-accounts.ts';

test('a limit is a positive whole number or absent; anything else is refused', () => {
  expect(parseCleanupLimit([])).toEqual({ ok: true, limit: null });
  expect(parseCleanupLimit(['--apply'])).toEqual({ ok: true, limit: null });
  expect(parseCleanupLimit(['--apply', '--limit', '10'])).toEqual({ ok: true, limit: 10 });
  expect(parseCleanupLimit(['--limit', '1'])).toEqual({ ok: true, limit: 1 });
  for (const argv of [['--limit'], ['--limit', '--apply'], ['--limit', 'ten'], ['--limit', '0'], ['--limit', '-3'], ['--limit', '1.5'], ['--limit', ''], ['--limit', 'NaN'], ['--limit', '10x']]) {
    expect(parseCleanupLimit(argv).ok, JSON.stringify(argv)).toBe(false);
  }
});

test('the script stops on a bad limit before it reads anything, with a non-zero exit', () => {
  const tsx = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  for (const args of [['--limit', '--apply'], ['--apply', '--limit', 'NaN'], ['--limit', '0']]) {
    const run = spawnSync(process.execPath, [tsx, SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
    expect(run.status, `${args.join(' ')}: ${run.stderr}`).toBe(2);
    expect(run.stderr).toContain('Refusing to run: --limit needs a positive whole number');
    expect(run.stdout, 'the script went on to read the accounts').not.toContain('users total');
  }
});

test('the accounts the script keeps are counted, not listed', () => {
  const src = fs.readFileSync(path.join(ROOT, SCRIPT), 'utf8');
  expect(src).toContain('parseCleanupLimit(process.argv.slice(2))');
  expect(src).not.toMatch(/keep\.push\(|`\s*keep\s+\$\{/);
  // The only addresses the script prints are the test accounts it deletes.
  const printed = [...src.matchAll(/console\.(?:log|error)\(([^;]*)\);/g)].map((m) => m[1]).filter((a) => /email/.test(a));
  for (const arg of printed) expect(arg, 'an address other than a deletion candidate is printed').toMatch(/\bc\.email\b/);
});
