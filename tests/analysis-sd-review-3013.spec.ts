import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { processDocumentationToMarkdown } from '../lib/process-documentation';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { readConstantGates } from '../lib/abap/constant-gates';
import { readDemoSwitches } from '../lib/abap/demo-switches';
import { readHeaderRules } from '../lib/abap/header-rules';
import { ruleRegisterFromSource, ruleRegisterMarkdown } from '../lib/rule-register';
import { programSummaryFactsOf } from '../lib/program-summary-facts';
import { checkPurposeProposal } from '../lib/program-summary-check';
import { scoreBreakdown } from '../lib/clean-core-score';
import { scoreHeroModel, type HeroFinding } from '../lib/score-hero';
import { scoreRuleFor } from '../lib/score-rule';

/**
 * Roadmap 3.0.13 — the analysis findings of the two external reviews of an SD
 * returns-and-credit simulation (14.10.2026; CR-A1…A6, D01, D02, D04), held on a
 * hand-written fixture with the same shape, never on the reviewed program:
 *
 *   - a constant gate (`IF gc_live_probe <> 'X'. MESSAGE … TYPE 'E'.` with the
 *     constant blank) locks the code after it: "In short" describes the path a
 *     run takes, the locked reads are named apart with the gate, and the probe
 *     step says it is locked (CR-A1/D01);
 *   - the header's numbered rules and bounds are register candidates, stated
 *     in the header, not read from code (CR-A2);
 *   - demo-case switches are counted apart from the business rules, their
 *     numbers left free (CR-A3);
 *   - a negated or attributive "posted" is not a claim of a posting (CR-A4/D01);
 *   - `f <> 'X' AND f <> space` reads "neither X nor blank" (D02);
 *   - the main path lists the export as optional (D04; the steps the main
 *     block performs that only fill program tables stay with 3.0.17 P1 —
 *     they change the skeleton of four of the eight shipped examples);
 *   - a finding in locked code keeps its points and is labelled, from engine
 *     3.0.13 only (CR-A6).
 *
 * Pure: no server, no browser, no model.
 */

const ROOT = path.resolve(__dirname, '..');
const FILE = 'sd-locked-probe-demo.abap';
const source = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', FILE), 'utf8').replace(/\r\n/g, '\n');
const lineOf = (needle: string) => source.split('\n').findIndex((l) => l.includes(needle)) + 1;

function markdownOf(src: string): string {
  const bpmn = buildBpmnExportFromSource(src, { processName: FILE, sourceFileName: FILE });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(src), null), fileName: FILE });
  return processDocumentationToMarkdown(buildProcessDocumentation({ source: src, map }));
}
const md = markdownOf(source);
const section = (from: string, to: string) => md.slice(md.indexOf(from), md.indexOf(to, md.indexOf(from)));

test.describe('constant gates (CR-A1/D01)', () => {
  test('the code after an always-true gate that ends the routine is unreachable', () => {
    const gates = readConstantGates(source);
    expect(gates.gates).toHaveLength(1);
    expect(gates.gates[0]).toMatchObject({ constant: 'GC_LIVE_PROBE', always: true, routine: 'PROBE_LIVE_SOURCES' });
    expect(gates.gates[0].stop?.kind).toBe('error-message');
    expect(gates.unreachable).toEqual([
      { reason: 'after-gate', gate: 0, lineStart: lineOf("IF p_doc IS INITIAL"), lineEnd: lineOf('FROM vbpa') },
    ]);
    expect(gates.alwaysStopping).toEqual(['PROBE_LIVE_SOURCES']);
  });

  test('a statement after the stop inside the gate arm is unreachable too (QA 9992f1339e12)', () => {
    const code = [
      'REPORT zgate.',
      "CONSTANTS gc_live TYPE c VALUE space.",
      'FORM probe.',
      "  IF gc_live <> 'X'.",
      "    MESSAGE 'Live adapter disabled' TYPE 'E'.",
      '    SELECT SINGLE vbeln FROM vbak INTO @DATA(lv_vbeln).',
      '  ENDIF.',
      '  WRITE / 1.',
      'ENDFORM.',
      '',
    ].join('\n');
    const report = readConstantGates(code);
    expect(report.gates).toHaveLength(1);
    expect(report.gates[0].stop?.line).toBe(5);
    expect(report.unreachable).toEqual([
      { reason: 'after-gate', gate: 0, lineStart: 6, lineEnd: 6 },
      { reason: 'after-gate', gate: 0, lineStart: 8, lineEnd: 8 },
    ]);
  });

  test('a gate needs a constant: a parameter, a doubly declared name or an AND is not read', () => {
    expect(readConstantGates(source.replace("IF gc_live_probe <> 'X'.", "IF p_demo <> 'X'.")).gates).toEqual([]);
    expect(readConstantGates(source.replace("IF gc_live_probe <> 'X'.", "IF gc_live_probe <> 'X' AND p_doc IS INITIAL.")).gates).toEqual([]);
    expect(readConstantGates(source.replace('DATA: gt_claims', 'DATA: gc_live_probe TYPE c, gt_claims')).gates).toEqual([]);
    // Set to 'X', the gate never holds: nothing is locked.
    const open = readConstantGates(source.replace('gc_live_probe TYPE ty_flag VALUE space', "gc_live_probe TYPE ty_flag VALUE 'X'"));
    expect(open.gates[0]).toMatchObject({ always: false });
    expect(open.unreachable.every((r) => r.lineEnd < lineOf('IF p_doc IS INITIAL'))).toBe(true);
  });

  test('"In short" says what a run reads, and names the locked reads with the gate', () => {
    const inShort = section('## In short', '**What it does not do**');
    expect(inShort).toContain('A read-only report that reads no database table on the path a run can take; it works on data the program builds itself (demo switch P_DEMO).');
    expect(inShort).toContain('are locked: the constant GC_LIVE_PROBE is blank (space)');
    expect(inShort).not.toContain('selected by document');
    expect(inShort).not.toMatch(/^- It reads /m);
    const facts = programSummaryFactsOf(source);
    expect(facts.reads).toEqual([]);
    expect(facts.locked?.reads.map((r) => r.name)).toEqual(['VBAK', 'VBPA']);
    expect(facts.inputs.find((i) => i.name === 'P_DOC')?.lockedOnly).toBe(true);
  });

  test('the probe step says it is locked', () => {
    const probe = md.split('\n').find((l) => l.includes('**Probe live sources**'));
    expect(probe).toContain('locked: the constant GC_LIVE_PROBE is blank (space)');
  });

  test('a program without a gate keeps its facts as they were', () => {
    const facts = programSummaryFactsOf(source.replace("IF gc_live_probe <> 'X'.", "IF p_demo = 'Y'."));
    expect('locked' in facts).toBe(false);
    expect(facts.reads.map((r) => r.name)).toEqual(['VBAK', 'VBPA']);
  });
});

test.describe('the rule register (CR-A2, CR-A3)', () => {
  const set = deriveBusinessRules(source);

  test('demo-case switches are counted apart, their numbers left free', () => {
    const demo = readDemoSwitches(source);
    expect(demo?.flag.name).toBe('P_DEMO');
    expect(demo?.routines).toEqual(['ADD_CLAIM', 'APPLY_DEMO_CASE', 'BUILD_DEMO']);
    expect(demo?.selectors).toEqual(['P_CASE']);
    expect(set.demoCases?.rules.map((r) => r.label)).toEqual([
      "gc_snapshot VALUE 'DEMO-SNAP-01'",
      'p_case < 0 OR p_case > 4',
      'CASE p_case: 1',
      'CASE p_case: 2',
      'CASE p_case: 3',
      'CASE p_case: 4',
    ]);
    expect(set.rules.map((r) => r.label)).toEqual(['ls_claim-qty > 1000000']);
    // Its number is the one it had before the switches were set apart.
    expect(set.rules[0].id).toBe('BR-004');
  });

  test('without a demo flag a CASE on a number stays a rule', () => {
    const plain = deriveBusinessRules(source.replace(/p_demo/gi, 'p_full'));
    expect(plain.demoCases).toBeUndefined();
    expect(plain.rules.some((r) => r.label === 'CASE p_case: 2')).toBe(true);
  });

  test('the header states rules and bounds — candidates, with their lines', () => {
    expect(readHeaderRules(source)).toEqual([
      { id: 'R01', kind: 'rule', text: 'Filter observations by both cutoffs BEFORE deduplication. Facts not yet known cannot change an earlier view.', lineStart: 11, lineEnd: 12 },
      { id: 'R02', kind: 'rule', text: 'Round ONCE per claim, half away from zero.', lineStart: 13, lineEnd: 13 },
      { id: 'Bound 1', kind: 'bound', text: 'Quantities 0..1,000,000.', lineStart: 16, lineEnd: 16 },
      { id: 'Bound 2', kind: 'bound', text: 'Priority 1..99.', lineStart: 16, lineEnd: 16 },
    ]);
  });

  test('the register lists one business rule, and both apart lists', () => {
    const register = ruleRegisterFromSource(source);
    expect(register.state).toBe('read');
    if (register.state !== 'read') return;
    expect(register.rows.map((r) => r.id)).toEqual(['BR-004']);
    const text = ruleRegisterMarkdown(register).join('\n');
    expect(text).toContain('## Rules stated in the header comment — candidates');
    expect(text).toContain('Stated in the header, not read from code.');
    expect(text).toContain('| R01 | Filter observations by both cutoffs BEFORE deduplication.');
    expect(text).toContain('## Demo-case switches — counted apart');
    expect(text).toContain('| BR-005 | `CASE p_case: 2` | APPLY_DEMO_CASE |');
  });

  test('"In short" counts the rules, the switches and the candidates apart', () => {
    expect(md).toContain('1 business rule is fixed in the code; 6 demo-case switches (P_DEMO) are counted apart — test data, not rules. The header comment states 2 rules (R01, R02) and 2 input bounds — candidates in the rule register, stated in the header, not read from code.');
  });
});

test.describe('claims and readings (CR-A4/D01, D02)', () => {
  const facts = programSummaryFactsOf(source);

  test('"already posted credits" is the data a program reads, not a posting it makes', () => {
    expect(md).toContain('“An analyst asks which returned quantities still support a credit proposal after already posted credits.” (Author\'s claim');
    expect(md).not.toContain('claims a posting or a data change');
  });

  test('a negated statement claims nothing; a statement after "and" still does', () => {
    expect(checkPurposeProposal('This report proposes time slots only. It never dispatches an order, changes a work center, posts a confirmation or changes an SAP document.', facts).ok).toBe(true);
    expect(checkPurposeProposal('No creation of a credit memo request, billing document or FI posting.', facts).ok).toBe(true);
    expect(checkPurposeProposal('It does not change data and posts documents.', facts).problems).toContain('claims a posting or a data change; the code changes no data');
    expect(checkPurposeProposal('It posts the credit memo.', facts).ok).toBe(false);
  });

  test('a three-state flag check names the values it lets through', () => {
    expect(md).toContain('the field ls_claim-discrete is neither X nor blank');
    expect(md).not.toMatch(/discrete is not set and the field ls_claim-discrete is set/);
  });
});

test.describe('the main path (D04)', () => {
  const lines = section('## 1. How the process works', '**What it does along the way**').split('\n').filter((l) => /^\d+\. /.test(l));

  test('an IF around the last step is an optional step, not a check every run passes', () => {
    expect(lines[lines.length - 1]).toContain("**Export results** — optional, only when `p_export = 'X'`");
  });

  test('a CHECK-like IF that ends the run keeps the path at its depth', () => {
    // The exit arm of `IF p_case < 0 …` carries the condition; the step after it is not optional.
    expect(lines.some((l) => /\*\*Display results\*\*/.test(l) && !/optional/.test(l))).toBe(true);
  });
});

test.describe('findings in locked code (CR-A6) — from engine 3.0.13 only', () => {
  test('3.0.13 marks them; 3.0.12 renders what it signed', () => {
    const now = buildAbapEvidence(source, FILE, 'private', undefined, 'v3.0.13');
    const then = buildAbapEvidence(source, FILE, 'private', undefined, 'v3.0.12');
    const reads = now.findings.filter((f) => f.kind === 'standard-table-read');
    expect(reads.map((f) => f.unreachable)).toEqual([
      { gateLine: lineOf("IF gc_live_probe <> 'X'."), constant: 'GC_LIVE_PROBE' },
      { gateLine: lineOf("IF gc_live_probe <> 'X'."), constant: 'GC_LIVE_PROBE' },
    ]);
    expect(then.findings.some((f) => 'unreachable' in f)).toBe(false);
    // The mark adds a label, never a point: both engines score the same.
    const rule = scoreRuleFor('private', 'v3.0.13');
    expect(scoreBreakdown(now.findings, 0, rule).score).toBe(scoreBreakdown(then.findings, 0, rule).score);
  });

  test('the score table labels the deduction', () => {
    const now = buildAbapEvidence(source, FILE, 'private', undefined, 'v3.0.13');
    const rule = scoreRuleFor('private', 'v3.0.13');
    const model = scoreHeroModel(scoreBreakdown(now.findings, 0, rule), now.findings as HeroFinding[], [], rule);
    const reads = model.deductions.find((d) => d.kind === 'standard-table-read');
    expect(reads?.unreachable).toEqual({ lines: reads?.lines, gates: [{ constant: 'GC_LIVE_PROBE', line: lineOf("IF gc_live_probe <> 'X'.") }] });
    expect(model.deductions.filter((d) => d.kind !== 'standard-table-read').every((d) => d.unreachable === null)).toBe(true);
  });
});
