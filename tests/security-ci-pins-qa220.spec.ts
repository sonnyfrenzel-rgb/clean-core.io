import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * QA full review v2.20.0 (f956fc15a506, e90b14adbe8d): Security CI fetched its
 * audit and SBOM tools with `npx --yes` at a range (`audit-ci@^7`) or with no
 * version at all (`@cyclonedx/cyclonedx-npm`). A new release published between
 * two runs was then executed by the gate without review. Every package `npx`
 * downloads in this workflow must name one exact version; a bump is a reviewed
 * edit of this file.
 */
const WORKFLOW = path.join(process.cwd(), '.github/workflows/security-ci.yml');

test('every package npx fetches in Security CI is pinned to an exact version', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8');
  const fetched = [...src.matchAll(/npx\s+--yes\s+(\S+)/g)].map((m) => m[1]);
  expect(fetched.length, 'the workflow still fetches its audit and SBOM tools').toBeGreaterThanOrEqual(2);
  for (const spec of fetched) {
    // name@1.2.3 or @scope/name@1.2.3 — no range, no tag, no bare name.
    expect(spec, `${spec} must carry an exact version`).toMatch(/^(@[\w.-]+\/)?[\w.-]+@\d+\.\d+\.\d+$/);
  }
  expect(fetched.some((s) => s.startsWith('audit-ci@'))).toBe(true);
  expect(fetched.some((s) => s.startsWith('@cyclonedx/cyclonedx-npm@'))).toBe(true);
});
