import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildDemoWorkspace } from '../lib/demo-workspace';
import { buildDemoShowcase, showcaseDrift } from '../lib/demo-showcase';
import { DEMO_SHOWCASE_PLANES_FILE, type ShowcasePlanesRecord } from '../lib/demo-showcase-planes';
import { findTrustChainField } from '../lib/demo-marks';
import {
  SHOWCASE_CONTINUE_TARGET,
  SHOWCASE_OWN_CODE_TARGET,
  SHOWCASE_STEP_COUNT,
  showcaseStepHref,
  showcaseSteps,
} from '../lib/demo-showcase-copy';
import { safeReturnPath } from '../lib/return-path';

/**
 * The public demo showcase's record (roadmap 3.5.0 item 8, DEMO-1/DEMO-3).
 *
 * The showcase computes its figures from the engine of the checkout when the
 * page is built; what it records is the drawing of the map
 * (`lib/demo-showcase-planes.json`, `npm run demo:showcase`) and a few
 * statements in the guide's own words (`lib/demo-showcase-copy.ts`). This spec
 * fails when the engine no longer writes the BPMN file the drawings were made
 * from, or no longer supports one of those statements — so the plan rule "the
 * demo follows every package" is a red test instead of a duty. Server-free.
 */
const ROOT = path.resolve(__dirname, '..');
const data = buildDemoWorkspace();
const showcase = buildDemoShowcase(data);

test('the drawings and the guide’s own statements match the engine of this checkout', () => {
  const drift = showcaseDrift(data);
  expect(drift, `run npm run demo:showcase and review the copy:\n${drift.join('\n')}`).toEqual([]);
});

test('the drift check can fail', () => {
  // A guard nobody has seen fail is a comment: the same measurement against an altered BPMN file.
  const altered = { ...data, processMap: { ...data.processMap, xml: `${data.processMap.xml}\n<!-- altered -->` } };
  expect(showcaseDrift(altered).join('\n')).toMatch(/another BPMN file/);
});

test('every level of the map is drawn, with its element ids kept for the clicks', () => {
  const record = JSON.parse(fs.readFileSync(path.join(ROOT, DEMO_SHOWCASE_PLANES_FILE), 'utf8')) as ShowcasePlanesRecord;
  expect(record.planes.length).toBe(data.processMap.planes.length);
  for (const plane of record.planes) {
    expect(plane.svg.startsWith('<svg'), plane.id).toBe(true);
    expect(plane.svg).toMatch(/ width="[\d.]+" height="[\d.]+"/);
    expect(plane.svg, `${plane.id} loads something`).not.toMatch(/<script|href="http|xlink:href="http|<image/i);
  }
  const top = record.planes.find((p) => p.id === 'process');
  for (const e of data.processMap.elements.filter((x) => x.plane === null)) {
    expect(top?.svg, e.id).toContain(`data-element-id="${e.id}"`);
  }
});

test('the showcase carries no field of the trust chain', () => {
  expect(findTrustChainField(showcase)).toBeNull();
});

test('every figure the guide says is the engine’s', () => {
  const f = showcase.facts;
  expect(f.totalLines).toBe(data.demo.totalLines);
  expect(f.elements).toBe(data.processMap.elements.length);
  expect(f.levels).toBe(data.processMap.planes.length);
  expect(f.score).toBe(data.demo.analyze.cleanCoreScore);
  expect(f.findings).toBe(data.demo.analyze.findings.length);
  const counts = {
    ends: showcase.ends.reduce((a, e) => a + e.ids.length, 0),
    stops: showcase.ends.filter((e) => e.plane !== 'process').reduce((a, e) => a + e.ids.length, 0),
    topStop: null,
    changes: showcase.changes.length,
  };
  // The top level ends once; every other end the list counts is a stop.
  expect(counts.ends - counts.stops).toBe(1);
  expect(counts.stops).toBeGreaterThan(0);
  const steps = showcaseSteps(f, counts);
  expect(steps.length).toBe(SHOWCASE_STEP_COUNT);
  const text = JSON.stringify(steps);
  expect(text).toContain(`${f.elements} elements on ${f.levels} levels`);
  expect(text).toContain(`${counts.ends} ways to end, ${counts.stops} of them stops`);
  expect(text).toContain(`Score ${f.score} = 100`);
  // The guide quotes no version but the engine's own, which it reads at build time.
  expect(text.match(/\bv\d+\.\d+\.\d+\b/g) ?? []).toEqual([f.engineVersion]);
});

test('the score’s lines add up to the score the guide states', () => {
  const f = showcase.facts;
  const deducted = f.scoreLines.reduce((a, l) => a + l.points, 0) + f.unassessedPoints;
  expect(100 - deducted).toBe(f.score);
});

test('each step has a stable address, and the showcase’s returns are allowed exactly', () => {
  for (let i = 1; i <= SHOWCASE_STEP_COUNT; i++) expect(showcaseStepHref(i)).toBe(`/demo#step=${i}`);
  expect(showcaseStepHref('end', 'it')).toBe('/demo#step=end&lens=it');
  expect(showcaseStepHref(4, 'all')).toBe('/demo#step=4');
  expect(safeReturnPath(SHOWCASE_CONTINUE_TARGET)).toBe('/dashboard?from=demo');
  expect(safeReturnPath(SHOWCASE_OWN_CODE_TARGET)).toBe('/admin/new-project/upload');
});

test('the public text says own Claude keys come on 23 December 2026, never earlier', () => {
  const copy = fs.readFileSync(path.join(ROOT, 'lib/demo-showcase-copy.ts'), 'utf8');
  for (const m of copy.matchAll(/Claude[^'`]*/g)) {
    if (/key|Gemini, and Claude/i.test(m[0]) && /from/.test(m[0])) expect(m[0]).toContain('23 December 2026');
  }
  expect(copy).toContain('Gemini, and Claude from 23 December 2026');
});
