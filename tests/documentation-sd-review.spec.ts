import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildBpmnExportFromSource, buildReadingExports } from '../lib/bpmn/export';
import { buildBusinessStatements } from '../lib/abap/business-statement';
import { statementKind } from '../lib/abap/business-statement-kind';
import { buildProcessDocument } from '../lib/process-document-build';
import { stepRef, type PdStep } from '../lib/process-document';
import { pathLine } from '../lib/process-document-outline';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { docStepName, processDocumentationToMarkdown, type DocStep } from '../lib/process-documentation';
import { isListedStep, readingPath } from '../lib/process-documentation-path';
import { programSummaryFactsOf } from '../lib/program-summary-facts';

/**
 * SD review (12.10.2026): three places where the 3.0.11 documentation of an
 * SD order cockpit contradicted the release notes. Each is fixed generically
 * and held here on a hand-written fixture, not on the reviewed program.
 *
 *   (a) A `CASE` without `WHEN OTHERS` (radio buttons) read as three optional
 *       steps in sequence — list, then screen, then file. It is one choice of
 *       alternatives, "or none of them".
 *   (b) "In short" counted the rule register (17), section 2 listed the rule
 *       sentences (11), and nothing said they count different things.
 *   (c) `INCLUDE STRUCTURE x` read "The report needs the include STRUCTURE"
 *       in the business reading, once per place.
 *
 * Pure: no server, no browser, no model.
 */

const ROOT = path.resolve(__dirname, '..');
const FILE = 'sd-case-without-others.abap';
const source = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', FILE), 'utf8').replace(/\r\n/g, '\n');

function documentationOf(src: string) {
  const bpmn = buildBpmnExportFromSource(src, { processName: FILE, sourceFileName: FILE });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(src), null), fileName: FILE });
  return buildProcessDocumentation({ source: src, map });
}

/** Section 1 up to the statements that follow the list. */
function mainPathOf(md: string): string[] {
  const start = md.indexOf('## 1. How the process works');
  const end = md.indexOf('**What it does along the way**', start);
  return md.slice(start, end < 0 ? md.indexOf('## 2.', start) : end).split('\n');
}

test.describe('(a) a CASE without WHEN OTHERS is one choice, not steps in sequence', () => {
  const doc = documentationOf(source);
  const md = processDocumentationToMarkdown(doc);
  const lines = mainPathOf(md);
  const at = (name: string) => {
    const i = lines.findIndex((l) => l.includes(`**${name}**`));
    expect(i, `"${name}" is not on the main path\n${lines.join('\n')}`).toBeGreaterThanOrEqual(0);
    return i;
  };

  test('the radio buttons are one numbered place with three arms, or none of them', () => {
    const head = lines.findIndex((l) => /^\d+\. One of 3 alternative paths, or none of them, decided at L19:$/.test(l));
    expect(head, lines.join('\n')).toBeGreaterThanOrEqual(0);
    for (const [arm, name] of [['r_list', 'Show list'], ['r_form', 'Print form'], ['r_file', 'Write file']]) {
      const label = lines.findIndex((l) => l.trim() === `- **When \`${arm}\`:**`);
      expect(label, arm).toBeGreaterThan(head);
      // Inside the arm, not a step of its own on the main path.
      expect(lines[at(name)]).toMatch(/^\s+1\. \*\*/);
      expect(lines[at(name)]).not.toContain('optional');
    }
    // The step after ENDCASE is on the main path again, one place after the choice.
    expect(lines[at('Read orders')]).toMatch(/^1\. /);
    expect(lines[head]).toMatch(/^2\. /);
  });

  test('a decision inside one arm keeps its own alternatives', () => {
    const head = lines.findIndex((l) => /^\d+\. One of 2 alternative paths, or none of them, decided at L28:$/.test(l));
    expect(head, lines.join('\n')).toBeGreaterThanOrEqual(0);
    const inner = lines.findIndex((l) => /^\s+1\. One of 2 alternative paths, decided at L30:$/.test(l));
    expect(inner).toBeGreaterThan(head);
    expect(at('Save direct')).toBeGreaterThan(inner);
    expect(at('Save by transaction')).toBeGreaterThan(at('Save direct'));
    expect(at('Mail result')).toBeGreaterThan(at('Save by transaction'));
    expect(lines[at('Write log')]).toMatch(/^\d+\. \*\*Write log\*\*/);
  });

  test('every top-level step is listed exactly once', () => {
    for (const step of doc.steps.filter((s) => s.level === null && isListedStep(s))) {
      expect(lines.filter((l) => l.includes(`**${docStepName(step)}**`)), docStepName(step)).toHaveLength(1);
    }
  });

  test('the business SOP gives the radio buttons one place with letters', () => {
    const { bpmn, technical } = buildReadingExports(source, { processName: FILE, sourceFileName: FILE });
    const map = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(source), null, 'no-key'), fileName: FILE });
    const sop = buildProcessDocument({ source, map });
    const steps = sop.overview.path.filter((e): e is PdStep => e.kind === 'step');
    const refOf = (name: string) => stepRef(steps.find((s) => s.name === name) as PdStep);
    expect(['Show list', 'Print form', 'Write file'].map(refOf)).toEqual(['2a', '2b', '2c']);
    // The decision inside the 'SAVE' arm keeps the letters it had before the arms were grouped.
    expect(['Save direct', 'Save by transaction'].map(refOf)).toEqual(['3a', '3b']);
    expect(pathLine(sop.overview.path)).toContain('1 Read orders → 2 one of Show list / Print form / Write file → 3 one of Save direct / Save by transaction');
  });
});

test.describe('(a) the rule on a plain graph', () => {
  const step = (id: string, kind: string, next: Array<[string, string?]>): DocStep => ({
    id, kind, technicalName: id.toUpperCase(), businessName: null, lane: null, namingProvenance: null,
    provenance: 'reconstructed', anchor: { lineStart: 1, lineEnd: 1 }, undetermined: null, level: null,
    next: next.map(([to, condition]) => ({ to, condition: condition ?? '' })), statementId: null,
  });

  test('two or more arms skipped by the same arm are one optional choice', () => {
    const items = readingPath([
      step('s', 'Start', [['g']]),
      step('g', 'Decision point', [['a', 'r_a'], ['b', 'r_b'], ['c', 'r_c'], ['j']]),
      step('a', 'Step', [['j']]),
      step('b', 'Step', [['j']]),
      step('c', 'Step', [['j']]),
      step('j', 'Step', [['e']]),
      step('e', 'End', []),
    ]);
    expect(items.map((i) => i.kind)).toEqual(['optional', 'step']);
    const optional = items[0];
    if (optional.kind !== 'optional') throw new Error('not optional');
    expect(optional.when).toBe('r_a OR r_b OR r_c');
    expect(optional.items).toHaveLength(1);
    const choice = optional.items[0];
    if (choice.kind !== 'choice') throw new Error('not a choice');
    expect(choice.arms.map((a) => a.when)).toEqual(['r_a', 'r_b', 'r_c']);
    expect(choice.arms.map((a) => a.items.map((x) => (x.kind === 'step' ? x.step.id : x.kind)))).toEqual([['a'], ['b'], ['c']]);
  });

  test('one skipped arm stays an optional step (IF without ELSE)', () => {
    const items = readingPath([
      step('s', 'Start', [['g']]),
      step('g', 'Decision point', [['a', 'want'], ['j']]),
      step('a', 'Step', [['j']]),
      step('j', 'Step', [['e']]),
      step('e', 'End', []),
    ]);
    expect(items[0]).toMatchObject({ kind: 'optional', when: 'want' });
    expect((items[0] as { items: unknown[] }).items).toHaveLength(1);
    expect((items[0] as { items: Array<{ kind: string }> }).items[0].kind).toBe('step');
  });

  test('arms that fall through into one another are not grouped', () => {
    // a runs into b: not alternatives, the old reading (optional, then optional) holds.
    const items = readingPath([
      step('s', 'Start', [['g']]),
      step('g', 'Decision point', [['a', 'x'], ['b', 'y'], ['j']]),
      step('a', 'Step', [['b']]),
      step('b', 'Step', [['j']]),
      step('j', 'Step', [['e']]),
      step('e', 'End', []),
    ]);
    expect(items.some((i) => i.kind === 'optional' && i.items.some((x) => x.kind === 'choice'))).toBe(false);
  });
});

test.describe('(b) "In short" and section 2 tell one story about the rules', () => {
  test('section 2 says it lists rule sentences and names the register\'s count from "In short"', () => {
    const doc = documentationOf(source);
    const md = processDocumentationToMarkdown(doc);
    const facts = programSummaryFactsOf(source);
    expect(typeof facts.rules).toBe('number');
    const n = facts.rules as number;
    expect(n).toBeGreaterThan(0);
    const inShort = md.slice(md.indexOf('## In short'), md.indexOf('## 1.'));
    expect(inShort).toContain(`${n} business rule${n === 1 ? ' is' : 's are'} fixed in the code`);
    const section = md.slice(md.indexOf('## 2. Rules and exceptions'), md.indexOf('### Exceptions'));
    expect(section).toContain('### Rules as the code states them');
    expect(section).toContain(`The rule register holds ${n === 1 ? '1 business rule' : `${n} business rules`} — the number "In short" gives`);
    expect(section).toContain('`docs/rule-register.md`');
    const listed = section.split('\n').filter((l) => l.startsWith('- ')).length;
    expect(section).toMatch(new RegExp(`The ${listed === 1 ? 'entry' : `${listed} entries`} below (?:is|are) the sentences in which the code states its conditions`));
  });

  test('a stored documentation without the summary facts says nothing about a register', () => {
    const doc = documentationOf(source);
    const md = processDocumentationToMarkdown({ ...doc, summary: undefined } as typeof doc);
    expect(md).toContain('### Rules as the code states them');
    expect(md).not.toContain('The rule register holds');
  });
});

test.describe('(c) a component include is a structure definition, not a missing include', () => {
  const src = [
    'REPORT z_component_include.',
    'DATA: BEGIN OF gt_bdc OCCURS 0.',
    '        INCLUDE STRUCTURE bdcdata.',
    'DATA: END OF gt_bdc.',
    'TYPES: BEGIN OF ty_row.',
    '         INCLUDE TYPE bdcmsgcoll.',
    'TYPES:   flag TYPE c LENGTH 1,',
    '       END OF ty_row.',
    'INCLUDE zsd_cockpit_top.',
    'START-OF-SELECTION.',
    '  PERFORM run.',
    'FORM run.',
    "  WRITE / 'x'.",
    'ENDFORM.',
  ].join('\n');

  test('INCLUDE STRUCTURE and INCLUDE TYPE are technical sentences; a source include keeps its sentence', () => {
    const texts = buildBusinessStatements(src).map((s) => s.text);
    expect(texts.join('\n')).not.toMatch(/needs the include (?:STRUCTURE|TYPE)\b/i);
    const structure = texts.find((t) => /components of the structure BDCDATA/.test(t));
    const type = texts.find((t) => /components of the type BDCMSGCOLL/.test(t));
    expect(structure, texts.join('\n')).toBeDefined();
    expect(type, texts.join('\n')).toBeDefined();
    expect(statementKind(structure as string)).toBe('structure');
    expect(statementKind(type as string)).toBe('structure');
    // A real source include is still said, as before.
    expect(texts.some((t) => /^The report needs the include zsd_cockpit_top\b/i.test(t))).toBe(true);
  });

  test('the business reading of the documentation does not carry them; the appendix does', () => {
    const doc = documentationOf(src);
    const md = processDocumentationToMarkdown(doc);
    const business = md.slice(0, md.indexOf('<a id="appendix"></a>'));
    expect(business).not.toMatch(/include STRUCTURE|include TYPE|components of the (?:structure|type)/i);
    const appendix = md.slice(md.indexOf('<a id="appendix"></a>'));
    expect(appendix).toContain('The local structure contains the components of the structure BDCDATA (a component include).');
  });
});
