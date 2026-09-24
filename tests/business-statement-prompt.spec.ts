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
 * Weg B der Fachsätze (Roadmap 17.8): Prompt und Prüfung, ohne Netz.
 *
 * Der Prompt ist nicht die Verteidigung; die Prüfung ist es. Jeder Test hier
 * gibt eine Antwort vor, wie ein Modell sie liefern könnte, und sieht nach,
 * was davon übrig bleibt und wie viel gezählt verworfen wurde.
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

test.describe('der Prompt bestellt verankerte Einzelsätze', () => {
  test('er zeigt Quelltext mit Zeilennummern und die Elemente des Skeletts', () => {
    const prompt = buildStatementPrompt(CONTEXT);
    expect(gatewayId, 'das Skelett hat kein Gateway — die Probe misst nichts').not.toBe('');
    expect(prompt).toContain(`${gatewayId} | gateway |`);
    expect(prompt).toContain('   9    IF p_amount > 100.');
    expect(prompt).toContain('"statements"');
    expect(prompt).not.toMatch(/executive summary/i);
  });

  test('kein Sollsatz des Korpus steht im Prompt — sonst wäre die Messung abgeschrieben', () => {
    const template = buildStatementPrompt(buildStatementContext([{ name: 'x.abap', code: 'REPORT x.\n' }]));
    const leaked = readCases()
      .flatMap((korpusCase) => korpusCase.expected.businessStatements.map((statement) => statement.text ?? ''))
      .filter((text) => text.length > 20 && template.includes(text));
    expect(leaked).toEqual([]);
  });

  test('mehrere Dateien: Element-Ids tragen den Dateinamen', () => {
    const context = buildStatementContext([
      { name: 'a.abap', code: 'REPORT a.\nSTART-OF-SELECTION.\n  WRITE / 1.\n' },
      { name: 'b.abap', code: 'REPORT b.\nSTART-OF-SELECTION.\n  WRITE / 2.\n' },
    ]);
    const ids = [...context.elements.keys()];
    expect(ids.some((id) => id.startsWith('a.abap/'))).toBe(true);
    expect(ids.some((id) => id.startsWith('b.abap/'))).toBe(true);
  });
});

test.describe('die Prüfung verwirft und zählt, sie repariert nie', () => {
  test('ein sauberer Satz kommt durch — als Vorschlag, mit Anker auf der ganzen Anweisung', () => {
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
    // Zeile 7 liegt im SELECT, das von 5 bis 8 geht: der Anker ist die Anweisung.
    expect(second.anchors).toEqual([{ file: 'source.abap', lineStart: 5, lineEnd: 8 }]);
    // Forderung 3: der Vorbehalt steht **an** dem Satz, nie an seiner Stelle.
    expect(second.core).toBe('Der Name des Kunden 0000001000 wird gelesen.');
    expect(second.uncertainty).toEqual({ note: 'Ob der Kunde existiert, zeigt erst der Lauf.', provenance: 'not-determined' });
    expect(second.text.startsWith('Der Name des Kunden 0000001000 wird gelesen')).toBe(true);
    expect(second.text).toContain('Ob der Kunde existiert');
  });

  const cases: Array<[string, unknown, string]> = [
    ['Zeile außerhalb der Quelle', { ...GOOD, anchors: ['source.abap:99'] }, 'line-out-of-range'],
    ['Kommentarzeile', { ...GOOD, anchors: ['source.abap:3'] }, 'no-statement-at-line'],
    ['fremde Datei', { ...GOOD, anchors: ['other.abap:9'] }, 'unknown-file'],
    ['Anker ohne Form', { ...GOOD, anchors: ['Zeile 9'] }, 'malformed-anchor'],
    ['kein Anker', { ...GOOD, anchors: [] }, 'no-anchor'],
    ['erfundenes Element', { ...GOOD, element: 'nd-999-0' }, 'unknown-element'],
    ['Element neben dem Anker', { ...GOOD, anchors: ['source.abap:2'] }, 'element-off-anchor'],
    ['eigenes Feld am Satz', { ...GOOD, confidence: 0.9 }, 'unexpected-field'],
    ['Text zu lang', { ...GOOD, text: 'x'.repeat(STATEMENT_MAX_LENGTH + 1) }, 'bad-text'],
    ['Markdown im Text', { ...GOOD, text: 'Der **Betrag** wird geprüft.' }, 'bad-text'],
    ['Text kein String', { ...GOOD, text: 42 }, 'malformed-entry'],
  ];
  for (const [label, entry, rule] of cases) {
    test(`verworfen: ${label}`, () => {
      const result = validateStatementAnswer(CONTEXT, answer([GOOD, entry]));
      expect(result.statements).toHaveLength(1);
      expect(result.discarded.byRule[rule as keyof typeof result.discarded.byRule], JSON.stringify(result.discarded)).toBe(1);
      expect(result.discarded.total).toBe(1);
    });
  }

  test('Antworten, die gar nicht erst gelesen werden', () => {
    expect(validateStatementAnswer(CONTEXT, '').discarded.byRule['empty-answer']).toBe(1);
    expect(validateStatementAnswer(CONTEXT, undefined).discarded.byRule['empty-answer']).toBe(1);
    expect(validateStatementAnswer(CONTEXT, '```json\n{"statements":[]}\n```').discarded.byRule['malformed-json']).toBe(1);
    expect(validateStatementAnswer(CONTEXT, '{"names":[]}').discarded.byRule['not-an-object']).toBe(1);
    expect(validateStatementAnswer(CONTEXT, 'x'.repeat(100_001)).discarded.byRule['too-large']).toBe(1);
  });

  test('eine Zusammenfassung neben den Sätzen wird gezählt, nicht gelesen', () => {
    const result = validateStatementAnswer(CONTEXT, answer([GOOD], { summary: 'Alles gut.' }));
    expect(result.statements).toHaveLength(1);
    expect(result.discarded.byRule['unexpected-field']).toBe(1);
  });

  test('doppelt und zu viele', () => {
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

test('Weg B ist noch nicht verdrahtet: kein Produktcode importiert das Modul, und es ruft kein Netz', () => {
  const moduleSource = readFileSync(join(process.cwd(), 'lib/business-statement-prompt.ts'), 'utf8');
  expect(moduleSource).not.toMatch(/\bfetch\s*\(/);
  expect(moduleSource).not.toMatch(/generativelanguage|GEMINI_API_KEY|process\.env/);
  const importers: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        walk(abs);
      } else if (/\.(ts|tsx)$/.test(name) && readFileSync(abs, 'utf8').includes('business-statement-prompt')) {
        importers.push(abs);
      }
    }
  };
  for (const root of ['app', 'components', 'hooks']) walk(join(process.cwd(), root));
  for (const name of readdirSync(join(process.cwd(), 'lib'))) {
    const abs = join(process.cwd(), 'lib', name);
    if (statSync(abs).isFile() && name !== 'business-statement-prompt.ts' && readFileSync(abs, 'utf8').includes('business-statement-prompt')) {
      importers.push(abs);
    }
  }
  expect(importers, 'Roadmap 17.8 misst zuerst; die Verdrahtung entscheidet Sonny danach').toEqual([]);
});
