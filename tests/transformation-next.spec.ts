import { test, expect } from './helpers/test';
import fs from 'node:fs';
import path from 'node:path';
import { buildDemoProject } from '../lib/demo-project';
import {
  authoredFile,
  findingWhere,
  functionLines,
  functionsByObject,
  objectFlow,
  openItems,
  releasedTargets,
  sourceExcerpt,
  traceRows,
  transformationFigures,
} from '../lib/transformation-view';
import { checksTable, readinessFailures } from '../lib/transformation/checks-table';
import { traceOfFiles } from '../lib/transformation/trace-view';
import { prepareEngineLed, assembleEngineLed } from '../lib/transformation/engine-led';
import { generationRecordOf, type GenerationRecord } from '../lib/transformation/generation-record';
import type { GenerationRunResult } from '../lib/transformation/orchestrator';
import { transformationAnchors } from '../lib/page-anchors';

/**
 * ROADMAP 3.5.0 (6d), ADR-129 — Transformation, next (`docs/roadmap/transformation-next-mockup.html`). Server-free:
 * the counts the answer says, the flow's third column from the trace, "Still open", the code drawer's line marks, the
 * one table of checks, and the page's source rules (one page for every reader, no Copy without code, strips only for
 * what stops the page).
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel: string) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PAGE = 'app/(app)/project/[projectId]/transformation/page.tsx';
const OBJECT_PAGE = 'components/transformation/TransformationObjectPage.tsx';

const demo = buildDemoProject();
const SOURCE = read('public/starter-examples/Z_MM_PO_APPROVAL.abap');

function storedPackage() {
  const prep = prepareEngineLed({ source: SOURCE, track: 'rap', program: 'Z_MM_PO_APPROVAL', decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!prep.ok) throw new Error(prep.reason);
  const result: GenerationRunResult = {
    status: 'complete',
    units: prep.fillUnits.map((u) => ({ unitId: u.unitId, state: 'written', body: '    RETURN.', filledBy: 'model', reason: null, failures: [], predicates: {} })) as GenerationRunResult['units'],
    callsUsed: 22,
    rounds: 1,
    stop: 'passed',
    scaffoldFindings: [],
    checksNotRun: [],
    maxInFlightSeen: 4,
  };
  return assembleEngineLed(prep, result, { checks: [{ kind: 'guards', total: 22, failed: 0 }] as never, budget: 48 });
}

test.describe('TF-N1 · the answer counts released targets, not target options (T3)', () => {
  test('released = a successor or the project route; everything else is open, and the two add up', () => {
    const r = releasedTargets(demo.analyze.findings, 'in-app');
    const f = transformationFigures(demo.analyze.findings);
    expect(r.findings).toBe(f.findings);
    expect(r.released + r.open).toBe(r.findings);
    expect(r.released).toBe(r.successor + r.route);
    expect(r.open).toBe(r.noSuccessor + r.custom + r.routeOther);
    // The old facet counted options: almost every finding of the starter example has one, yet many are open.
    expect(r.open).toBeGreaterThan(0);
    expect(r.released).toBeLessThan(f.planned);
  });
});

test.describe('TF-N2 · one flow, finding → target → object, and "Still open" as one list', () => {
  test('the third column comes from traceability.json: each finding is carried by the narrowest function holding one of its lines', () => {
    const pkg = storedPackage();
    const trace = traceOfFiles(pkg.files)!;
    expect(trace).not.toBeNull();
    const where = findingWhere(demo.analyze.findings, trace);
    for (const [id, w] of where) {
      if (!w) continue;
      const fn = trace.functions.find((x) => x.name === w.fn && x.file === w.file)!;
      const row = traceRows(demo.analyze.findings, 'in-app', trace).find((r) => r.id === id)!;
      expect(row.lines.some((l) => fn.abap.some((a) => l >= a.lineStart && l <= a.lineEnd)), `${id} → ${w.fn}`).toBe(true);
    }
    const flow = objectFlow(demo.analyze.findings, 'in-app', trace, pkg.files)!;
    expect(flow.objects.reduce((n, o) => n + o.count, 0)).toBe(transformationFigures(demo.analyze.findings).findings);
    expect(flow.links.reduce((n, l) => n + l.count, 0)).toBe(transformationFigures(demo.analyze.findings).findings);
    // Without a trace nothing records which object answers which finding: no column is drawn into a guess.
    expect(objectFlow(demo.analyze.findings, 'in-app', null, [])).toBeNull();
  });

  test('"Still open" names each open kind once with one action, and nothing when nothing is open', () => {
    const items = openItems(demo.analyze.findings, demo.analyze.coverage, 'in-app', ['BR-011', 'BR-013']);
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
    expect(items.map((i) => i.key)).toEqual(expect.arrayContaining(['custom', 'no-successor', 'rules']));
    for (const i of items) {
      expect(['design', 'analyze', 'business']).toContain(i.action);
      expect(i.title).not.toMatch(/—/);
    }
    expect(items.find((i) => i.key === 'rules')!.title).toBe('2 rules have no decision');
    expect(openItems([], null, 'in-app', null)).toEqual([]);
  });
});

test.describe('TF-N3 · the package by object, the code in a drawer with every line marked', () => {
  test("a function's lines: the body between the markers is the model's, the frame around it the engine's", () => {
    const pkg = storedPackage();
    const trace = traceOfFiles(pkg.files)!;
    const byObject = functionsByObject(trace);
    const fill = [...byObject.values()].flat().find((f) => f.owner === 'fill' && f.unitId)!;
    const file = pkg.files.find((f) => f.path === fill.file)!;
    const lines = functionLines(file.content, fill)!;
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.some((l) => l.author === 'model')).toBe(true);
    expect(lines.some((l) => l.author === 'engine')).toBe(true);
    for (const l of lines) if (/@cc-fill (BEGIN|END)/.test(l.text)) expect(l.author).toBe('engine');
    // One model call, no markers: every line is the model's.
    expect(authoredFile('a\nb', true).every((l) => l.author === 'model')).toBe(true);
    expect(authoredFile('x\n" @cc-fill BEGIN U01 1\nbody\n" @cc-fill END U01\ny').map((l) => l.author)).toEqual(['engine', 'engine', 'model', 'engine', 'engine']);
    // The old side: the original's own lines, with their real numbers.
    const old = sourceExcerpt(SOURCE, [{ lineStart: 10, lineEnd: 12 }]);
    expect(old.map((l) => l?.number)).toEqual([10, 11, 12]);
  });
});

test.describe('TF-N4 · one table of checks; strips only for what stops the page', () => {
  const record = (activatable: boolean) =>
    ({
      ...(generationRecordOf({ path: 'engine-led', engine: { ...storedPackage().summary, notWritten: [], empty: [] }, basis: [] }) as GenerationRecord),
      activation: { v: 1, abaplint: '2.120.54', config: 'shipped', files: 3, paths: [], failedFiles: activatable ? 0 : 1, parserErrors: 0, syntaxErrors: activatable ? 0 : 3, unresolved: 0, unresolvedNames: [], lint: 0, activatable, stubs: [], findings: [] },
    }) as GenerationRecord;

  test('three outcomes, who ran each, and the checklist is a row that is never counted', () => {
    const t = checksTable({ state: 'stored', abap: true, record: record(true), lints: 0, lintLine: 'none', literals: 0, handTotal: 6, handOpen: 6 });
    expect(t.rows.map((r) => r.key)).toEqual(expect.arrayContaining(['abaplint', 'guards', 'written', 'lints', 'literals', 'activation', 'abap-unit', 'hand']));
    expect(t.rows.find((r) => r.key === 'abaplint')!.who).toMatch(/server/);
    expect(t.rows.find((r) => r.key === 'activation')!.outcome).toBe('not-run');
    expect(t.rows.find((r) => r.key === 'hand')!.outcome).toBe('checklist');
    expect(t.passed + t.failed + t.notRun).toBe(t.rows.length - 1);
    expect(t.failed).toBe(0);
  });

  test('abaplint failing makes the package not ready; lints alone ask for a correction', () => {
    const broken = checksTable({ state: 'stored', abap: true, record: record(false), lints: 0, lintLine: 'none', literals: 0, handTotal: 0, handOpen: 0 });
    expect(readinessFailures(broken).hard.map((r) => r.key)).toEqual(['abaplint']);
    expect(readinessFailures(broken).hard[0].failure).toBe('abaplint finds 3 errors');
    const lints = checksTable({ state: 'stored', abap: true, record: record(true), lints: 2, lintLine: '2 high', literals: 1, handTotal: 0, handOpen: 0 });
    expect(readinessFailures(lints).hard).toEqual([]);
    expect(readinessFailures(lints).soft.map((r) => r.key)).toEqual(['lints', 'literals']);
    // Nothing written yet: nothing is counted as run.
    const none = checksTable({ state: 'none', abap: true, record: null, lints: 0, lintLine: 'none', literals: 0, handTotal: 0, handOpen: 0 });
    expect(none.passed + none.failed).toBe(0);
  });

  test('the page: hard-coded values and code lints are rows and lists under Checks, not strips above the answer', () => {
    const page = code(PAGE);
    const answer = page.indexOf('<TransformationObjectPage');
    expect(page.indexOf('data-hard-coded-literals=')).toBeGreaterThan(answer);
    expect(page.indexOf('data-code-checks=')).toBeGreaterThan(answer);
    expect(page).toContain('checkDetails={');
    expect(page).not.toMatch(/<CcMessageStrip state="warning" headline="Hard-coded values/);
    expect(code('components/transformation/BuiltOnCard.tsx')).not.toMatch(/CcMessageStrip/);
  });
});

test.describe('TF-N5 · one page for every reader, the family frame, no dead ends', () => {
  test('no view switch, the answer card, the anchor bar, family chips only', () => {
    const page = code(PAGE);
    expect(page).toMatch(/<StageHeader[^>]*\n?[\s\S]{0,200}view="one-page"/);
    expect(page).not.toContain('if (generating) return (');
    expect(page).toContain('<GenerationChain');
    const obj = code(OBJECT_PAGE);
    expect(obj).toContain('<AnswerCard');
    expect(obj).toContain('<PageAnchorBar');
    for (const id of ['tf-flow', 'tf-open', 'tf-package', 'tf-checks', 'tf-trace']) expect(obj).toContain(`id="${id}"`);
    for (const f of fs.readdirSync(path.join(ROOT, 'components/transformation'))) {
      expect(code(`components/transformation/${f}`), f).not.toContain('CcProvenanceChip');
    }
    expect(page).not.toContain('CcProvenanceChip');
    // "From finding to change" (a text search) and "Plan by kind" are gone (T5, T9).
    expect(obj).not.toContain('changeExcerpt');
    expect(obj).not.toContain('Plan by kind');
  });

  test('Copy stands only where there is code to copy (UX Q4)', () => {
    const page = code(PAGE);
    expect(page).not.toMatch(/>\s*Copy Code\s*</);
    const at = page.indexOf('onClick={handleCopy}');
    expect(page.slice(at - 200, at)).toContain('transformedCode.trim()');
  });

  test('the bar: Findings · Open · Package · Checks · Trace', () => {
    const a = transformationAnchors({ findings: 19, open: 5, objects: 11, checksFailed: 0 });
    expect(a.map((x) => x.label)).toEqual(['Findings', 'Open', 'Package', 'Checks', 'Trace']);
    expect(a.map((x) => x.count)).toEqual(['19', '5', '11', null, '19']);
  });
});
