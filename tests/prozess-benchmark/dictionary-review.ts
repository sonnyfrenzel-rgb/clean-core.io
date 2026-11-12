/**
 * The review list of the curated dictionary for an SAP expert (owner decision 06.11.2026):
 *
 *   npx tsx tests/prozess-benchmark/dictionary-review.ts
 *
 * Writes docs/review/sap-dictionary-review.csv — every entry of lib/abap/sap-dictionary.ts with its kind, meaning,
 * source and in how many LEARN cases its code occurs, sorted by that count, with empty columns to tick off
 * (`ok` / `wrong` / `better wording`). Reads only the case ids under `learn` and `w3_learn` in split.json — never a
 * holdout case. Deterministic, no model, no network.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  NAMING_ABBREVIATIONS,
  SAP_AUTHORIZATION_OBJECTS,
  SAP_FIELD_VALUES,
  SAP_FIELDS,
  SAP_FUNCTIONS,
  SAP_TABLES,
  SAP_TRANSACTIONS,
} from '../../lib/abap/sap-dictionary';

const ROOT = join(__dirname, '..', '..');
const split = JSON.parse(readFileSync(join(__dirname, 'split.json'), 'utf8')) as Record<string, unknown>;
const learn = [...(split.learn as string[]), ...(split.w3_learn as string[])];

/** The identifier tokens of each LEARN case, upper case, comments and literals left in (a code in a literal counts). */
const caseTokens: Array<Set<string>> = [];
for (const id of learn) {
  const dir = join(__dirname, 'cases', id);
  if (!existsSync(dir)) continue;
  const text = readdirSync(dir).filter((f) => f.endsWith('.abap')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  const tokens = new Set<string>();
  for (const m of text.toUpperCase().matchAll(/[A-Z0-9_/]+/g)) {
    tokens.add(m[0]);
    for (const part of m[0].split(/[_/]+/)) if (part) tokens.add(part);
  }
  // A structure component (`ls_x-gbstk`) and an abbreviation inside a name (`lv_pos`) are tokens too.
  for (const m of text.toUpperCase().matchAll(/-([A-Z0-9_]+)/g)) tokens.add(m[1]);
  caseTokens.push(tokens);
}
const usedIn = (code: string) => caseTokens.filter((t) => t.has(code.toUpperCase())).length;

interface Row { term: string; kind: string; meaning: string; source: string; used: number }
const rows: Row[] = [];
for (const [k, v] of Object.entries(SAP_TABLES)) rows.push({ term: k.toUpperCase(), kind: 'table', meaning: v.singular, source: v.source, used: usedIn(k) });
for (const [k, v] of Object.entries(SAP_FIELDS)) rows.push({ term: k.toUpperCase(), kind: 'field', meaning: v.singular, source: v.source, used: usedIn(k) });
for (const [k, values] of Object.entries(SAP_FIELD_VALUES)) {
  for (const [value, meaning] of Object.entries(values)) rows.push({ term: `${k.toUpperCase()} = ${value}`, kind: 'domain value', meaning, source: 'sap-domain', used: usedIn(k) });
}
for (const [k, v] of Object.entries(SAP_FUNCTIONS)) rows.push({ term: k, kind: 'function module', meaning: v, source: 'sap-standard', used: usedIn(k) });
for (const [k, v] of Object.entries(SAP_TRANSACTIONS)) rows.push({ term: k, kind: 'transaction', meaning: v, source: 'sap-standard', used: usedIn(k) });
for (const [k, v] of Object.entries(SAP_AUTHORIZATION_OBJECTS)) rows.push({ term: k, kind: 'authorization object', meaning: v, source: 'sap-standard', used: usedIn(k) });
for (const [k, v] of Object.entries(NAMING_ABBREVIATIONS)) rows.push({ term: k, kind: 'name abbreviation', meaning: v, source: 'abap-naming', used: usedIn(k) });
rows.sort((a, b) => b.used - a.used || a.kind.localeCompare(b.kind) || a.term.localeCompare(b.term));

const cell = (s: string | number) => {
  const t = String(s);
  return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const header = ['term', 'kind', 'meaning', 'source', 'used in N LEARN cases', 'ok (x)', 'wrong (x)', 'better wording', 'reviewer note'];
const csv = [header, ...rows.map((r) => [r.term, r.kind, r.meaning, r.source, r.used, '', '', '', ''])].map((r) => r.map(cell).join(',')).join('\n') + '\n';
const out = join(ROOT, 'docs', 'review');
if (!existsSync(out)) mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'sap-dictionary-review.csv'), csv);
console.log(`${rows.length} entries, ${rows.filter((r) => r.used > 0).length} used in at least one of ${caseTokens.length} LEARN cases -> docs/review/sap-dictionary-review.csv`);
