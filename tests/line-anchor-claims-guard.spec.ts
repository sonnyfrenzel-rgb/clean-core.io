import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * No public text promises a line anchor on every BPMN element (QA a1fb3e864090).
 *
 * The engine's own contract says otherwise: a node carries a line range *or says
 * it has none* (`lib/abap/process-skeleton.ts`, `anchor: NodeAnchor | null` with
 * `unanchoredReason`), and the landing mapper keeps a missing anchor as `null`
 * (`lib/landing-process.ts`). So every sentence about anchors on the elements
 * has to carry the qualifier — "or the reason it has none", "where the code
 * gives one" — and this spec fails on one that does not.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

const SKIP = new Set(['node_modules', '.next']);
function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.resolve(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) files(rel, out);
    } else if (/\.(tsx?|md|txt)$/.test(e.name)) out.push(rel);
  }
  return out;
}

const SURFACES = [...files('app'), ...files('components'), ...files('lib'), 'README.md'];

/** A universal claim about anchors on the elements, not followed by its qualifier. */
const UNQUALIFIED = [
  /line anchor on (?:every|each|all) (?:BPMN )?elements?(?!,? (?:or|where) )/i,
  /(?:every|each) element carries the line it came from(?!\s*(?:\([^)]*\))?,? (?:or|where) )/i,
];

test('the engine still allows an element without an anchor — the premise of this guard', () => {
  const skeleton = read('lib/abap/process-skeleton.ts');
  expect(skeleton).toMatch(/anchor: NodeAnchor \| null;/);
  expect(skeleton).toContain('unanchoredReason');
});

test('the detector catches the old sentences and passes the qualified ones', () => {
  const hit = (s: string) => UNQUALIFIED.some((r) => r.test(s));
  expect(hit('reconstructs its business process as BPMN with a line anchor on every element, lists')).toBe(true);
  expect(hit('draws it as BPMN. Every element carries the line it came from (`L243`), including')).toBe(true);
  expect(hit('with a line anchor on each element, or the reason it has none, lists')).toBe(false);
  expect(hit('Every element carries the line it came from (`L243`), or the reason it has none')).toBe(false);
  expect(hit('with a line anchor on each element where the code gives one.')).toBe(false);
});

for (const rel of SURFACES) {
  test(rel, () => {
    const text = read(rel).replace(/\s*\r?\n\s*/g, ' ');
    for (const r of UNQUALIFIED) expect(text, `${rel} promises an anchor on every element`).not.toMatch(r);
  });
}
