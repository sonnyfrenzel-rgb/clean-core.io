import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildBusinessStatements } from '../lib/abap/business-statement';
import { FIELD_TERMS, TABLE_TERMS, nounPhrase } from '../lib/abap/business-glossary';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { processDocumentationToMarkdown } from '../lib/process-documentation';
import { readCases } from './helpers/korpus-comparison';

/**
 * Owner decision 01.10.2026 ("alles Englisch"): every product text is English —
 * and the business statements the engine writes are product text. Until that
 * day they were German, and the Documentation stage showed them to every
 * reader of an English product.
 *
 * This guard runs the generators over every ABAP source the repository ships
 * — the starter examples (the demo is one of them) and every case of the
 * reference corpus — and fails on the first German sentence: an umlaut or ß,
 * German quotation marks, or a German function word. The word list is short
 * on purpose: words that are German and never English, so an ABAP identifier
 * or an English sentence cannot trip it. Identifiers and literals from the
 * source are left out of the check — `lv_betrag` or `'FEHLER'` is the code
 * speaking, not the engine.
 */

const ROOT = path.resolve(__dirname, '..');
const EXAMPLES = fs
  .readdirSync(path.join(ROOT, 'public', 'starter-examples'))
  .filter((file) => file.endsWith('.abap'));

/**
 * German and never English. "die", "will", "also" … are left out for that
 * reason, and so is "eine": it is also an SAP table (EINE, purchasing info
 * record), which the engine names as the source writes it.
 */
const GERMAN_WORDS =
  /\b(und|oder|nicht|kein|keine|keinen|wird|werden|wurde|ist|sind|mit|für|fuer|einer|einen|der|das|des|dem|den|auf|aus|bei|nach|wenn|sonst|nur|auch|noch|über|ueber|zur|zum|vom|wie|dass|sich|Satz|Sätze|Zeile|Tabelle|Feld|Wert|gesetzt|ausgegeben|gelesen|aufgerufen|übernommen|verlassen|Treffer|Meldung|Unterprogramm|Baustein|Berechtigung)\b/;
const GERMAN_LETTERS = /[äöüÄÖÜß„“]/;

/**
 * What the engine wrote, without what it quotes from the source: identifiers
 * (`lv_x`, `gs_kopf-werk`, `ZCL_X`), upper-case literals and quoted text.
 */
function engineWords(text: string): string {
  return text
    .replace(/"[^"]*"/g, ' ')
    .replace(/'[^']*'/g, ' ')
    .replace(/\b[\w/]*[_~<>\-=]+[\w/<>~\-=]*\b/g, ' ')
    .replace(/\b[A-Z0-9/]{2,}\b/g, ' ');
}

function germanIn(text: string): string | null {
  const words = engineWords(text);
  const word = GERMAN_WORDS.exec(words);
  if (word) return `German word "${word[1]}"`;
  const letter = GERMAN_LETTERS.exec(words);
  if (letter) return `German letter "${letter[0]}"`;
  return null;
}

/** Every source the repository ships: the starter examples and the corpus. */
function sources(): Array<{ label: string; code: string }> {
  const out = EXAMPLES.map((file) => ({
    label: `starter-examples/${file}`,
    code: fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', file), 'utf8').replace(/\r\n/g, '\n'),
  }));
  for (const korpusCase of readCases()) {
    for (const source of korpusCase.sources) out.push({ label: `${korpusCase.id}/${source.name}`, code: source.code });
  }
  return out;
}

test('the engine writes its business statements in English, for every source the repository ships', () => {
  const all = sources();
  expect(all.length, 'no source to run the engine on').toBeGreaterThan(60);
  let checked = 0;
  const german: string[] = [];
  for (const { label, code } of all) {
    // Whatever the source itself writes in German (a literal, a comment) is
    // quoted, never generated; the check strips it above.
    for (const statement of buildBusinessStatements(code)) {
      checked += 1;
      const found = germanIn(statement.text);
      if (found) german.push(`${label} ${statement.id}: ${found} — ${statement.text}`);
    }
  }
  expect(checked, 'the engine wrote no sentence at all').toBeGreaterThan(500);
  expect(german.slice(0, 10).join('\n')).toBe('');
});

test('the Documentation stage document of the demo is English, statements and all', () => {
  const file = 'Z_MM_PO_APPROVAL.abap';
  const source = fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', file), 'utf8').replace(/\r\n/g, '\n');
  const bpmn = buildBpmnExportFromSource(source, { processName: file, sourceFileName: file });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), null), fileName: file });
  const markdown = processDocumentationToMarkdown(buildProcessDocumentation({ source, map }));
  expect(markdown.length).toBeGreaterThan(500);
  const german = markdown
    .split('\n')
    .map((line) => ({ line, found: germanIn(line) }))
    .filter((entry) => entry.found)
    .map((entry) => `${entry.found}: ${entry.line}`);
  expect(german.slice(0, 10).join('\n')).toBe('');
});

test('the business glossary names every term in English', () => {
  for (const [key, term] of [...Object.entries(FIELD_TERMS), ...Object.entries(TABLE_TERMS)]) {
    for (const word of [term.singular, term.plural]) {
      expect(germanIn(word), `${key}: "${word}"`).toBeNull();
      expect(GERMAN_LETTERS.test(word), `${key}: "${word}"`).toBe(false);
    }
  }
  expect(nounPhrase('lv_betrag')).toBe('the amount');
  expect(nounPhrase('lv_unbekannt')).toBe('the field lv_unbekannt');
});

test('the guard itself catches a German sentence and lets the code it quotes through', () => {
  expect(germanIn('Ohne Treffer wird NO_MATCH ausgegeben und der Block verlassen.')).not.toBeNull();
  expect(germanIn('Die Rückgabe ist leer.')).not.toBeNull();
  expect(germanIn('Without a hit, NO_MATCH is output and the block is exited.')).toBeNull();
  // An identifier or a literal of the source is the code speaking.
  expect(germanIn("The field lv_wert_fuer_der is set to 'FEHLER'.")).toBeNull();
  expect(germanIn('The text "Bitte prüfen" is output.')).toBeNull();
});
