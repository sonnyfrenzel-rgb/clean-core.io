import { TABLE_TERMS_EN } from '@/lib/abap/plain-glossary';
import type { ProgramSummaryFacts } from '@/lib/program-summary-text';

/**
 * Holds a model's wording of what a program is for against the engine's facts
 * (roadmap 3.0.11, "In short"; owner, 12.10.2026): *"Where the purpose needs
 * words the code does not hold, a model may phrase it from those facts, marked
 * Model proposal and checked against them — no claim the facts contradict;
 * every business object it names must be one the engine read."*
 *
 * A proposal that fails is not shown; the engine's sentence stands alone. The
 * check is deliberately narrow — it cannot tell a good purpose from a bad one,
 * only one that contradicts what the code shows:
 *
 *   - it posts, books, creates or changes something while the facts say the
 *     program changes no data;
 *   - it says the program does not post while the facts show it changes data;
 *   - it sends mail or runs an approval the facts do not show;
 *   - it names a business object of the glossary, or a table code, that the
 *     engine did not read or write;
 *   - it states money, savings or accuracy (ADR-022; no savings claims).
 *
 * Pure: glossary data only.
 */

export interface PurposeCheck {
  ok: boolean;
  problems: string[];
}

const POSTS = /\b(?:posts?|posted|posting(?! (?:date|period|key|keys))|books?\b(?! of)|booked|creates? (?:an? |the )?(?:accounting |FI |financial |purchase |sales )?(?:documents?|orders?)|updates? the (?:ledger|account|balance|master)|writes? back|settles?\b|clears? (?:the |all )?(?:open )?items?|changes? (?:the )?(?:master|data|records?|documents?) in SAP)\b/i;
const DOES_NOT_POST = /\b(?:does not|doesn't|do not|never|cannot|can't|no longer) (?:post|change|update|book)\b|\bread-only\b|\bnon-posting\b|\bno (?:[\w-]+ ){0,3}(?:are |is )?(?:posted|booked|changed)\b|\bwithout posting\b/i;
const MAIL = /\b(?:e-?mails?|sends? (?:a |an |the )?(?:letter|reminder|notice|notification|correspondence|message))\b/i;
const APPROVAL = /\b(?:approval workflow|approves?|sign-?off|four[- ]eyes|release strategy)\b/i;
const MONEY = /(?:[$€£]\s?\d|\b\d[\d.,]*\s?(?:EUR|USD|GBP|CHF|k€|million|bn)\b|\bsav(?:e|es|ing|ings)\b|\bROI\b|\bcost reduction\b|\b\d+\s?% (?:faster|cheaper|accura\w*|less)\b|\baccuracy\b)/i;

const CODE = /\b[A-Z][A-Z0-9_]{3,15}\b/g;
const ALLOWED_CODES = new Set(['SAP', 'ABAP', 'CSV', 'S/4HANA', 'HANA', 'BAPI', 'IDOC', 'ERP', 'BTP', 'RAP', 'CAP', 'FIORI', 'EXCEL', 'PDF', 'HTML', 'JSON', 'XML']);

/** Glossary words as a reader writes them ("cost center", "purchase order"), each with the tables behind it. */
const WORD_TABLES: Array<{ re: RegExp; tables: Set<string> }> = (() => {
  const byWord = new Map<string, Set<string>>();
  for (const [table, term] of Object.entries(TABLE_TERMS_EN)) {
    const head = term.singular.replace(/\s*\([^)]*\)$/, '').toLowerCase();
    // Single generic words ("case", "order", "user") say too little to hold a proposal to.
    if (!/\s/.test(head)) continue;
    const set = byWord.get(head) ?? new Set<string>();
    set.add(table.toUpperCase());
    byWord.set(head, set);
  }
  return [...byWord].map(([word, tables]) => ({
    re: new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?:s|es)?\\b`, 'i'),
    tables,
  }));
})();

export function checkPurposeProposal(text: string, facts: ProgramSummaryFacts): PurposeCheck {
  const problems: string[] = [];
  const t = String(text ?? '');
  if (!t.trim()) return { ok: false, problems: ['empty'] };

  const changes = facts.changes.state;
  // Sentence by sentence: "It does not post" names posting without claiming it.
  const sentences = t.split(/(?<=[.!?])\s+/);
  if (changes === 'none' && sentences.some((s) => POSTS.test(s) && !DOES_NOT_POST.test(s))) {
    problems.push('claims a posting or a data change; the code changes no data');
  }
  if (changes === 'changes' && DOES_NOT_POST.test(t)) {
    problems.push('says it does not post or change data; the code changes data');
  }
  if (!facts.outputs.mail && MAIL.test(t)) problems.push('claims correspondence; the code sends none');
  if (APPROVAL.test(t) && !facts.changes.actions.some((a) => /^(?:Release|Start)\b/.test(a.word))) {
    problems.push('claims an approval; the code runs none');
  }
  if (MONEY.test(t)) problems.push('states money, savings or accuracy');

  const known = new Set([
    ...facts.reads.map((o) => o.name),
    ...facts.writes.map((o) => o.name),
    ...facts.changes.actions.map((a) => a.name),
    ...facts.changes.displayTransactions.map((d) => d.name),
    ...facts.inputs.map((i) => i.name),
    ...(facts.program ? [facts.program] : []),
    ...facts.fixedLists.flatMap((l) => l.rows.flat().map((v) => v.toUpperCase())),
  ]);
  for (const m of t.matchAll(CODE)) {
    const code = m[0];
    if (ALLOWED_CODES.has(code) || known.has(code)) continue;
    if (TABLE_TERMS_EN[code.toLowerCase()]) problems.push(`names table ${code}, which the code does not read`);
  }
  const touched = new Set([...facts.reads, ...facts.writes].map((o) => o.name));
  for (const { re, tables } of WORD_TABLES) {
    const hit = re.exec(t);
    if (!hit) continue;
    if (![...tables].some((name) => touched.has(name))) problems.push(`names “${hit[0]}”, which the code does not read`);
  }
  return { ok: problems.length === 0, problems };
}
