import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildBpmnExportFromSource, buildReadingExports } from '../lib/bpmn/export';
import { buildProcessDocument } from '../lib/process-document-build';
import { stepRef, type PdGate, type PdStep } from '../lib/process-document';
import { gateLine, pathLine } from '../lib/process-document-outline';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { docStepName, processDocumentationToMarkdown, type DocStep, type ProcessDocumentation } from '../lib/process-documentation';
import { isListedStep, readingPath, type PathItem } from '../lib/process-documentation-path';

/**
 * CO review F02 (12.10.2026): the readable main path of the process
 * documentation follows the order a run takes, not the order the map stores
 * its elements in.
 *
 * The CO close simulation read "load demo data → simulate → export → display
 * → authorize → read live data": the map draws the first branch of
 * `IF p_demo = gc_x` to the end of the process and appends the second one,
 * and the list numbered them in that order. The fixture has the same shape —
 * two ways to get the data, an authorization check on one of them, a shared
 * calculation and an optional export — and is small enough to read.
 *
 * Pure: no server, no browser, no model.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');

function documentOf(source: string, fileName: string): ProcessDocumentation {
  const bpmn = buildBpmnExportFromSource(source, { processName: fileName, sourceFileName: fileName });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), null), fileName });
  return buildProcessDocumentation({ source, map });
}

/** Section 1 up to the statements that follow the list. */
function mainPathOf(md: string): string[] {
  const start = md.indexOf('## 1. How the process works');
  const end = md.indexOf('**What it does along the way**', start);
  return md.slice(start, end < 0 ? md.indexOf('## 2.', start) : end).split('\n');
}

const lineOf = (lines: string[], name: string): number => {
  const at = lines.findIndex((l) => l.includes(`**${name}**`));
  expect(at, `"${name}" is not on the main path`).toBeGreaterThanOrEqual(0);
  return at;
};

const flatIds = (items: PathItem[]): string[] => items.flatMap((i) => (i.kind === 'step' ? [i.step.id]
  : i.kind === 'choice' ? i.arms.flatMap((a) => flatIds(a.items)) : flatIds(i.items)));

test.describe('CO review F02: the main path in the order a run takes it', () => {
  const doc = documentOf(read('tests', 'fixtures', 'f02-alternative-data-paths.abap'), 'f02-alternative-data-paths.abap');
  const lines = mainPathOf(processDocumentationToMarkdown(doc));

  test('demo and live data are alternatives before the shared calculation', () => {
    const choice = lines.findIndex((l) => /^\d+\. One of 2 alternative paths, decided at L23:$/.test(l));
    expect(choice, lines.join('\n')).toBeGreaterThanOrEqual(0);
    const demoArm = lines.findIndex((l) => l.trim() === '- **When `p_demo = gc_x`:**');
    const liveArm = lines.findIndex((l) => l.trim() === '- **Otherwise:**');
    expect(demoArm).toBeGreaterThan(choice);
    expect(liveArm).toBeGreaterThan(demoArm);
    const shared = lineOf(lines, 'Normalize totals');
    for (const name of ['Load demo totals', 'Apply demo case']) {
      const at = lineOf(lines, name);
      expect(at).toBeGreaterThan(demoArm);
      expect(at).toBeLessThan(liveArm);
    }
    for (const name of ['Authorize scope', 'Read live masters', 'Read live totals']) {
      const at = lineOf(lines, name);
      expect(at).toBeGreaterThan(liveArm);
      expect(at, `${name} stands after the shared calculation`).toBeLessThan(shared);
      // Inside the arm, not on the main path's own numbering.
      expect(lines[at]).toMatch(/^\s+\d+\. /);
    }
    // The shared calculation is on the main path again, after the arms.
    expect(lines[shared]).toMatch(/^\d+\. \*\*Normalize totals\*\*/);
  });

  test('the authorization check belongs to the live branch only', () => {
    const at = lineOf(lines, 'Authorize scope');
    const display = lineOf(lines, 'Display result');
    expect(at).toBeLessThan(display);
    expect(lines.filter((l) => l.includes('**Authorize scope**'))).toHaveLength(1);
    // Nothing between the live arm's head and the check belongs to the demo arm.
    const liveArm = lines.findIndex((l) => l.trim() === '- **Otherwise:**');
    expect(lines.slice(liveArm, at).some((l) => /Load demo|Apply demo/.test(l))).toBe(false);
  });

  test('the export is optional and comes before the display', () => {
    const exportAt = lineOf(lines, 'Export csv');
    expect(lines[exportAt]).toContain('— optional, only when `p_csv = gc_x`');
    expect(exportAt).toBeLessThan(lineOf(lines, 'Display result'));
    expect(lineOf(lines, 'Build result')).toBeLessThan(exportAt);
  });

  test('every top-level step is listed exactly once', () => {
    for (const step of doc.steps.filter((s) => s.level === null && isListedStep(s))) {
      expect(lines.filter((l) => l.includes(`**${docStepName(step)}**`)), docStepName(step)).toHaveLength(1);
    }
  });
});

test.describe('CO review F02: the business SOP agrees with the package documentation', () => {
  const source = read('tests', 'fixtures', 'f02-alternative-data-paths.abap');
  const file = 'f02-alternative-data-paths.abap';
  const { bpmn, technical } = buildReadingExports(source, { processName: file, sourceFileName: file });
  const map = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(source), null, 'no-key'), fileName: file });
  const sop = buildProcessDocument({ source, map });
  const entries = sop.overview.path;
  const steps = entries.filter((e): e is PdStep => e.kind === 'step');
  const at = (name: string) => {
    const i = entries.findIndex((e) => e.kind === 'step' && e.name === name);
    expect(i, `"${name}" is not on the SOP's main path`).toBeGreaterThanOrEqual(0);
    return i;
  };
  const refOf = (name: string) => stepRef(steps.find((s) => s.name === name) as PdStep);

  test('demo and live data are alternatives of one place, before the shared calculation', () => {
    const shared = at('Normalize totals');
    for (const name of ['Load demo totals', 'Apply demo case', 'Authorize scope', 'Read live masters', 'Read live totals']) {
      expect(at(name), `${name} stands after the shared calculation`).toBeLessThan(shared);
    }
    expect(['Load demo totals', 'Apply demo case'].map(refOf)).toEqual(['3a', '3a.2']);
    expect(['Authorize scope', 'Read live masters', 'Read live totals'].map(refOf)).toEqual(['3b', '3b.2', '3b.3']);
    expect(refOf('Normalize totals')).toBe('4');
    // Nobody chooses a program's decision: no step is a user choice, and no actor says so.
    for (const s of steps) {
      expect(s.choice, s.name).toBeUndefined();
      expect(s.actor?.basis ?? '').not.toMatch(/user chooses/i);
    }
    expect(pathLine(entries)).toContain(
      '3 one of Load demo totals, Apply demo case / Authorize scope, Read live masters, Read live totals → 4 Normalize totals',
    );
  });

  test('the decision on the export stands right before it, and the display after it', () => {
    const exportAt = at('Export CSV');
    const gate = entries[exportAt - 1];
    expect(gate.kind).toBe('gate');
    expect(gateLine(gate as PdGate)).toContain('continue with “Display result”');
    expect(at('Build result')).toBeLessThan(exportAt);
    expect(exportAt).toBeLessThan(at('Display result'));
  });
});

test.describe('the reading path on a plain graph', () => {
  const step = (id: string, kind: string, next: Array<[string, string?]>): DocStep => ({
    id, kind, technicalName: id.toUpperCase(), businessName: null, lane: null, namingProvenance: null,
    provenance: 'reconstructed', anchor: { lineStart: 1, lineEnd: 1 }, undetermined: null, level: null,
    next: next.map(([to, condition]) => ({ to, condition: condition ?? '' })), statementId: null,
  });

  test('a loop body is a repetition, an early exit with a step ends the run, a skipped step is optional', () => {
    const steps = [
      step('s', 'Start', [['a']]),
      step('a', 'Step', [['g']]),
      step('g', 'Decision point', [['x', 'bad'], ['h']]),
      step('x', 'Step', [['e1']]),
      step('e1', 'End (early)', []),
      step('h', 'Decision point', [['body', 'more'], ['o']]),
      step('body', 'Step', [['h']]),
      step('o', 'Decision point', [['opt', 'want'], ['z']]),
      step('opt', 'Step', [['z']]),
      step('z', 'Step', [['e']]),
      step('e', 'End', []),
      step('lost', 'Step', []),
    ];
    const items = readingPath(steps);
    expect(items.map((i) => i.kind)).toEqual(['step', 'exit', 'repeat', 'optional', 'step', 'step']);
    expect(items[1]).toMatchObject({ kind: 'exit', when: 'bad' });
    expect(items[2]).toMatchObject({ kind: 'repeat', when: 'more' });
    expect(items[3]).toMatchObject({ kind: 'optional', when: 'want' });
    // A step no start reaches keeps its place at the end.
    expect(flatIds(items)).toEqual(['a', 'x', 'body', 'opt', 'z', 'lost']);
  });

  test('a check whose exit is the level\'s own end keeps the path flat', () => {
    const steps = [
      step('s', 'Start', [['a']]),
      step('a', 'Step', [['c']]),
      step('c', 'Decision point', [['e', 'NOT ( ok )'], ['b', 'ok']]),
      step('b', 'Step', [['e']]),
      step('e', 'End', []),
    ];
    expect(readingPath(steps).map((i) => i.kind)).toEqual(['step', 'step']);
  });

  test('an arm without a condition is said as the negation of the other', () => {
    const steps = [
      step('s', 'Start', [['g']]),
      step('g', 'Decision point', [['j', 'skip'], ['b']]),
      step('b', 'Step', [['j']]),
      step('j', 'Step', [['e']]),
      step('e', 'End', []),
    ];
    expect(readingPath(steps)[0]).toMatchObject({ kind: 'optional', when: 'NOT ( skip )' });
  });
});

test.describe('the shipped examples keep every step on the main path', () => {
  for (const file of ['Z_MM_PO_APPROVAL.abap', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap']) {
    test(file, () => {
      const doc = documentOf(read('public', 'starter-examples', file), file);
      const want = doc.steps.filter((s) => s.level === null && isListedStep(s)).map((s) => s.id).sort();
      expect(flatIds(readingPath(doc.steps)).sort()).toEqual(want);
    });
  }

  test('the remote credit check of the 1,000-line example is optional, not a step every run takes', () => {
    const doc = documentOf(read('public', 'starter-examples', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap'), 'x.abap');
    const lines = mainPathOf(processDocumentationToMarkdown(doc));
    expect(lines[lineOf(lines, 'Remote credit check')]).toContain('— optional, only when `p_rfc = abap_true`');
    expect(lineOf(lines, 'Remote credit check')).toBeLessThan(lineOf(lines, 'Decide actions'));
  });
});
