import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  MAX_STATEMENTS,
  STATEMENT_MAX_LENGTH,
  buildStatementContext,
  buildStatementPrompt,
  validateStatementAnswer,
} from '../lib/business-statement-prompt';
import { readCases } from './helpers/korpus-comparison';

/**
 * Path B of the business statements (roadmap 17.8): prompt and validation,
 * without a network.
 *
 * The prompt is not the defence; the validation is. Every test here supplies
 * an answer as a model might deliver it and looks at what is left of it and
 * how much was discarded and counted.
 */

const SOURCE = [
  'REPORT zdemo.', //                                  1
  'PARAMETERS p_amount TYPE p DECIMALS 2.', //         2
  '* Kommentarzeile', //                               3
  'START-OF-SELECTION.', //                            4
  '  SELECT SINGLE name1', //                          5
  '    FROM kna1', //                                  6
  "    WHERE kunnr = '0000001000'", //                 7
  '    INTO @DATA(lv_name).', //                       8
  '  IF p_amount > 100.', //                           9
  "    WRITE / 'HOLD'.", //                            10
  '  ENDIF.', //                                       11
  '',
].join('\n');

const CONTEXT = buildStatementContext([{ name: 'source.abap', code: SOURCE }]);
const gatewayId = [...CONTEXT.elements.values()].find((element) => element.kind === 'gateway')?.id ?? '';

function answer(statements: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ statements, ...extra });
}

const GOOD = {
  text: 'Ist der Betrag größer als 100, wird HOLD ausgegeben.',
  anchors: ['source.abap:9', 'source.abap:10'],
  element: gatewayId,
  uncertainty: null,
};

test.describe('the prompt orders anchored single sentences', () => {
  test('it shows the source with line numbers and the elements of the skeleton', () => {
    const prompt = buildStatementPrompt(CONTEXT);
    expect(gatewayId, 'the skeleton has no gateway — the probe measures nothing').not.toBe('');
    expect(prompt).toContain(`${gatewayId} | gateway |`);
    expect(prompt).toContain('   9    IF p_amount > 100.');
    expect(prompt).toContain('"statements"');
    expect(prompt).not.toMatch(/executive summary/i);
  });

  test('no expected sentence of the corpus is in the prompt — otherwise the measurement would be copied', () => {
    const template = buildStatementPrompt(buildStatementContext([{ name: 'x.abap', code: 'REPORT x.\n' }]));
    const leaked = readCases()
      .flatMap((korpusCase) => korpusCase.expected.businessStatements.map((statement) => statement.text ?? ''))
      .filter((text) => text.length > 20 && template.includes(text));
    expect(leaked).toEqual([]);
  });

  test('several files: element ids carry the file name', () => {
    const context = buildStatementContext([
      { name: 'a.abap', code: 'REPORT a.\nSTART-OF-SELECTION.\n  WRITE / 1.\n' },
      { name: 'b.abap', code: 'REPORT b.\nSTART-OF-SELECTION.\n  WRITE / 2.\n' },
    ]);
    const ids = [...context.elements.keys()];
    expect(ids.some((id) => id.startsWith('a.abap/'))).toBe(true);
    expect(ids.some((id) => id.startsWith('b.abap/'))).toBe(true);
  });
});

test.describe('the validation discards and counts, it never repairs', () => {
  test('a clean sentence gets through — as a proposal, anchored on the whole statement', () => {
    const result = validateStatementAnswer(
      CONTEXT,
      answer([
        GOOD,
        {
          text: 'Der Name des Kunden 0000001000 wird gelesen.',
          anchors: ['source.abap:7'],
          element: null,
          uncertainty: 'Ob der Kunde existiert, zeigt erst der Lauf.',
        },
      ]),
    );
    expect(result.discarded.total).toBe(0);
    expect(result.statements).toHaveLength(2);
    for (const statement of result.statements) expect(statement.provenance).toBe('proposed');
    const [first, second] = result.statements;
    expect(first.element?.id).toBe(gatewayId);
    expect(first.anchors).toEqual([
      { file: 'source.abap', lineStart: 9, lineEnd: 9 },
      { file: 'source.abap', lineStart: 10, lineEnd: 10 },
    ]);
    // Line 7 lies inside the SELECT that runs from 5 to 8: the anchor is the statement.
    expect(second.anchors).toEqual([{ file: 'source.abap', lineStart: 5, lineEnd: 8 }]);
    // Requirement 3: the caveat stands **beside** the sentence, never in its place.
    expect(second.core).toBe('Der Name des Kunden 0000001000 wird gelesen.');
    expect(second.uncertainty).toEqual({ note: 'Ob der Kunde existiert, zeigt erst der Lauf.', provenance: 'not-determined' });
    expect(second.text.startsWith('Der Name des Kunden 0000001000 wird gelesen')).toBe(true);
    expect(second.text).toContain('Ob der Kunde existiert');
  });

  const cases: Array<[string, unknown, string]> = [
    ['line outside the source', { ...GOOD, anchors: ['source.abap:99'] }, 'line-out-of-range'],
    ['comment line', { ...GOOD, anchors: ['source.abap:3'] }, 'no-statement-at-line'],
    ['unknown file', { ...GOOD, anchors: ['other.abap:9'] }, 'unknown-file'],
    ['anchor without form', { ...GOOD, anchors: ['Zeile 9'] }, 'malformed-anchor'],
    ['no anchor', { ...GOOD, anchors: [] }, 'no-anchor'],
    ['invented element', { ...GOOD, element: 'nd-999-0' }, 'unknown-element'],
    ['element beside the anchor', { ...GOOD, anchors: ['source.abap:2'] }, 'element-off-anchor'],
    ['extra field on the sentence', { ...GOOD, confidence: 0.9 }, 'unexpected-field'],
    ['text too long', { ...GOOD, text: 'x'.repeat(STATEMENT_MAX_LENGTH + 1) }, 'bad-text'],
    ['Markdown in the text', { ...GOOD, text: 'Der **Betrag** wird geprüft.' }, 'bad-text'],
    ['text not a string', { ...GOOD, text: 42 }, 'malformed-entry'],
  ];
  for (const [label, entry, rule] of cases) {
    test(`discarded: ${label}`, () => {
      const result = validateStatementAnswer(CONTEXT, answer([GOOD, entry]));
      expect(result.statements).toHaveLength(1);
      expect(result.discarded.byRule[rule as keyof typeof result.discarded.byRule], JSON.stringify(result.discarded)).toBe(1);
      expect(result.discarded.total).toBe(1);
    });
  }

  test('answers that are not even read', () => {
    expect(validateStatementAnswer(CONTEXT, '').discarded.byRule['empty-answer']).toBe(1);
    expect(validateStatementAnswer(CONTEXT, undefined).discarded.byRule['empty-answer']).toBe(1);
    expect(validateStatementAnswer(CONTEXT, '```json\n{"statements":[]}\n```').discarded.byRule['malformed-json']).toBe(1);
    expect(validateStatementAnswer(CONTEXT, '{"names":[]}').discarded.byRule['not-an-object']).toBe(1);
    expect(validateStatementAnswer(CONTEXT, 'x'.repeat(100_001)).discarded.byRule['too-large']).toBe(1);
  });

  test('a summary beside the sentences is counted, not read', () => {
    const result = validateStatementAnswer(CONTEXT, answer([GOOD], { summary: 'Alles gut.' }));
    expect(result.statements).toHaveLength(1);
    expect(result.discarded.byRule['unexpected-field']).toBe(1);
  });

  test('duplicate and too many', () => {
    expect(validateStatementAnswer(CONTEXT, answer([GOOD, GOOD])).discarded.byRule.duplicate).toBe(1);
    const many = Array.from({ length: MAX_STATEMENTS + 3 }, (_, index) => ({
      ...GOOD,
      element: null,
      text: `Satz Nummer ${index} über den Betrag.`,
    }));
    const result = validateStatementAnswer(CONTEXT, answer(many));
    expect(result.statements).toHaveLength(MAX_STATEMENTS);
    expect(result.discarded.byRule['too-many']).toBe(3);
  });
});

test('path B is wired, and only through the proposal stage of 17.10: two importers, no network', () => {
  const moduleSource = readFileSync(join(process.cwd(), 'lib/business-statement-prompt.ts'), 'utf8');
  expect(moduleSource).not.toMatch(/\bfetch\s*\(/);
  expect(moduleSource).not.toMatch(/generativelanguage|GEMINI_API_KEY|process\.env/);
  // An import, not a mention: a comment that names the module is not a way to it.
  const IMPORTS_IT = /from '[^']*business-statement-prompt'/;
  const importers: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        walk(abs);
      } else if (/\.(ts|tsx)$/.test(name) && IMPORTS_IT.test(readFileSync(abs, 'utf8'))) {
        importers.push(abs);
      }
    }
  };
  for (const root of ['app', 'components', 'hooks']) walk(join(process.cwd(), root));
  for (const name of readdirSync(join(process.cwd(), 'lib'))) {
    const abs = join(process.cwd(), 'lib', name);
    if (statSync(abs).isFile() && name !== 'business-statement-prompt.ts' && IMPORTS_IT.test(readFileSync(abs, 'utf8'))) {
      importers.push(abs);
    }
  }
  // Sonny, 27.09.2026 (roadmap 17.10): B goes into the Business view — through
  // `lib/statement-proposal.ts` and the route that validates and stores the
  // answer. No run, no signature, no audit pack reads the module.
  const rel = importers.map((abs) => abs.slice(process.cwd().length + 1).split('\\').join('/')).sort();
  expect(rel, 'another path to the model sentences — does it belong in a signature?').toEqual([
    'app/api/projects/[projectId]/statement-proposal/route.ts',
    'lib/statement-proposal.ts',
  ]);
});

test('the prompt orders English sentences — owner decision 01.10.2026 ("alles Englisch")', () => {
  // The model proposal stands above the engine's sentence in the product; both
  // are product text, and product text is English. The style example is English
  // too, so the model is not shown a German sentence to imitate.
  const prompt = buildStatementPrompt(buildStatementContext([{ name: 'demo.abap', code: SOURCE }]));
  expect(prompt).toContain('1. English, one sentence');
  expect(prompt).not.toMatch(/\bGerman\b/);
  expect(prompt).not.toMatch(/[äöüÄÖÜß„]/);
  expect(prompt).not.toMatch(/\b(wird|werden|der Betrag|die Kundennummer)\b/);
});
