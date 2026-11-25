import { test, expect } from '@playwright/test';
import path from 'node:path';
import {
  TYPE_CHECK_BUDGET_MS,
  TYPE_CHECK_MAX_BYTES,
  TYPE_CHECK_MAX_FILES,
  insideReadable,
  typeCheckCandidate,
} from '../lib/test-sandbox/type-check';

/**
 * The type check of a candidate runs in the app's own process. What it may read outside the candidate's
 * virtual directory is the compiler's library and `@types/node`, nothing else; it is bounded in size before it
 * starts and in time while it runs.
 */
const ROOT = path.resolve(__dirname, '..').replace(/\\/g, '/');
const codes = (r: ReturnType<typeof typeCheckCandidate>) => (r.ran ? r.findings.map((f) => `${f.code} ${f.path}`) : [r.reason]);

test('a file of the server, named by absolute path, relative path or reference, is not there', () => {
  // A real file of this repository. Read from disk it would resolve and type-check; refused, it is "not found".
  const real = `${ROOT}/lib/utils.ts`;
  for (const src of [
    `/// <reference path="${real}" />\nexport const a = 1;\n`,
    `import { cn } from '${real.replace(/\.ts$/, '.js')}';\nexport const a = cn;\n`,
    `import { cn } from '../../../../../../../../../${real.replace(/^[A-Za-z]:\//, '').replace(/^\//, '').replace(/\.ts$/, '.js')}';\nexport const a = cn;\n`,
  ]) {
    const r = typeCheckCandidate([{ path: 'srv/a.ts', content: src }]);
    expect(r.ran, codes(r).join('\n')).toBe(true);
    if (!r.ran) continue;
    expect(r.findings.length, src).toBeGreaterThan(0);
    expect(r.findings.every((f) => f.path === 'srv/a.ts'), codes(r).join('\n')).toBe(true);
    expect(r.findings.map((f) => f.code).some((c) => c === 'TS6053' || c === 'TS2307'), codes(r).join('\n')).toBe(true);
  }
  // A file that exists and one that does not answer alike: no oracle.
  const exists = typeCheckCandidate([{ path: 'srv/a.ts', content: `/// <reference path="${ROOT}/lib/utils.ts" />\nexport const a = 1;\n` }]);
  const missing = typeCheckCandidate([{ path: 'srv/a.ts', content: `/// <reference path="${ROOT}/lib/no-such-file.ts" />\nexport const a = 1;\n` }]);
  expect(exists.ran && exists.findings.map((f) => f.code)).toEqual(missing.ran && missing.findings.map((f) => f.code));
});

test('the standard library and @types/node still resolve', () => {
  const r = typeCheckCandidate([
    { path: 'package.json', content: JSON.stringify({ type: 'module' }) },
    { path: 'srv/a.ts', content: "import { createHash } from 'node:crypto';\nexport const h: string = createHash('sha256').update('x').digest('hex');\nexport const m = new Map<string, number>([['a', 1]]).get('a');\n" },
  ]);
  expect(r.ran && r.findings, codes(r).join('\n')).toEqual([]);
});

test('the path test resolves dot segments before it compares', () => {
  const roots = ['/srv/node_modules/typescript/lib'];
  expect(insideReadable('/srv/node_modules/typescript/lib/lib.es2022.d.ts', roots)).toBe(true);
  expect(insideReadable('/srv/node_modules/typescript/lib/../../../app/.env.ts', roots)).toBe(false);
  expect(insideReadable('/srv/node_modules/typescript/libx/a.d.ts', roots)).toBe(false);
});

test('a candidate too large is not checked, and a check past its time budget says it did not finish', () => {
  const big = typeCheckCandidate([{ path: 'srv/a.ts', content: `export const s = '${'x'.repeat(TYPE_CHECK_MAX_BYTES)}';\n` }]);
  expect(big).toMatchObject({ ran: false });
  const many = typeCheckCandidate(Array.from({ length: TYPE_CHECK_MAX_FILES + 1 }, (_, i) => ({ path: `srv/f${i}.ts`, content: 'export {};\n' })));
  expect(many).toMatchObject({ ran: false });

  // A clock that runs past the budget once the program is built.
  let t = 0;
  const clock = () => {
    t += TYPE_CHECK_BUDGET_MS;
    return t;
  };
  const slow = typeCheckCandidate([{ path: 'srv/a.ts', content: 'export function a(): number { return 1; }\nexport function b(): number { return a(); }\n' }], clock);
  expect(slow.ran).toBe(false);
  expect(!slow.ran && slow.reason).toContain('not finished');
});
