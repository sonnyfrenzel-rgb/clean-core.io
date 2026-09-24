/**
 * Fixed wording outward, the reason into the server log — for the sites of
 * SEC-2026-525.
 *
 * Source-level, like `tests/route-hardening-b88c77b.spec.ts`, whose convention
 * this follows: what each finding names is a value that reaches the response,
 * and the file shows whether it still can. Comment lines are dropped first, so
 * an explanation that quotes the old shape does not count as the shape.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

function code(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

/**
 * The full argument list of every `throw new Error(...)` and
 * `NextResponse.json(...)` call in a file, by balanced parentheses.
 */
function answers(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?:throw new Error|NextResponse\.json)\(/g)) {
    const start = m.index! + m[0].length;
    let depth = 1;
    let i = start;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
    }
    out.push(src.slice(start, i - 1));
  }
  return out;
}

test('SEC-2026-525: no token exchange hands the endpoint\'s response body to the caller', () => {
  for (const [file, route] of [
    ['app/api/fetch-s4-metadata/route.ts', 'api/fetch-s4-metadata'],
    ['app/api/fetch-odata-metadata/route.ts', 'api/fetch-odata-metadata'],
    ['app/api/test-s4-connection/route.ts', 'api/test-s4-connection'],
    ['app/api/test-s4-odata-read/route.ts', 'api/test-s4-odata-read'],
  ] as const) {
    const src = code(file);
    expect(src, `${file} quotes the token endpoint`).not.toMatch(/Response: \$\{errorBody/);
    expect(src, `${file} lost the log line`).toContain("logger.warn('oauth token exchange rejected'");
    expect(src, `${file} logs under another route name`).toContain(`route: '${route}'`);
    for (const answer of answers(src)) {
      // The upstream body may be logged; it never appears in an answer.
      expect(answer, `${file} answers with the upstream body`).not.toMatch(/errorBody/);
    }
  }
});

test('SEC-2026-525: the metadata endpoint\'s error body stays in the log too', () => {
  const src = code('app/api/fetch-s4-metadata/route.ts');
  expect(src).not.toMatch(/errorBody \? errorBody\.substring/);
  expect(src).toContain("logger.warn('s4 metadata endpoint rejected'");
});
