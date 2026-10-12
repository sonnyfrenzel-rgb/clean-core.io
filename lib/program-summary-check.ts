import { containsAmount } from '@/lib/money-honesty';
import { BTP } from '@/lib/sap-naming';
import { TABLE_TERMS_EN } from '@/lib/abap/plain-glossary';
import { stripModelMarkdown } from '@/lib/model-text';
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

// "posted items" describes the data it reads, not a posting it makes.
const POSTS = /\b(?:posts?|posted(?! (?:items?|documents?|amounts?|entries|data|values?|balances?|lines?|costs?))|posting(?! (?:date|period|key|keys))|books?\b(?! of)|booked|creates? (?:an? |the )?(?:accounting |FI |financial |purchase |sales )?(?:documents?|orders?)|updates? the (?:ledger|account|balance|master)|writes? back|settles?\b|clears? (?:the |all )?(?:open )?items?|changes? (?:the )?(?:master|data|records?|documents?) in SAP)\b/i;
const DOES_NOT_POST = /\b(?:does not|doesn't|do not|never|cannot|can't|no longer) (?:post|change|update|book)\b|\bread-only\b|\bnon-posting\b|\bno (?:[\w-]+ ){0,3}(?:are |is )?(?:posted|booked|changed)\b|\bwithout posting\b/i;
const MAIL = /\b(?:(?:e-?)?mail(?:s|ed|ing)?|sends? (?:a |an |the )?(?:letter|reminder|notice|notification|correspondence|message))\b/i;
const APPROVAL = /\b(?:approval workflow|approves?|sign-?off|four[- ]eyes|release strategy)\b/i;
const MONEY = /(?:[$€£]\s?\d|\b\d[\d.,]*\s?(?:EUR|USD|GBP|CHF|k€|million|bn)\b|\bsav(?:e|es|ing|ings)\b|\bROI\b|\bcost reduction\b|\b\d+\s?% (?:faster|cheaper|accura\w*|less)\b|\baccuracy\b)/i;

const CODE = /\b[A-Z][A-Z0-9_]{3,15}\b/g;
// The platform's short name as a model writes it, taken from its full name in lib/sap-naming.ts.
const ALLOWED_CODES = new Set(['SAP', 'ABAP', 'CSV', 'S/4HANA', 'HANA', 'BAPI', 'IDOC', 'ERP', BTP.replace(/^SAP /, ''), 'RAP', 'CAP', 'FIORI', 'EXCEL', 'PDF', 'HTML', 'JSON', 'XML']);

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

/**
 * The model's purpose of a program, from the Analyze narrative (`asIsContext`,
 * else `summary`): its first two sentences, without citations and Markdown —
 * or null when there is none or it fails the check. The caller shows it with
 * the chip *Model proposal*, the engine's sentence underneath.
 */
export function purposeProposalOf(narrative: string | null | undefined, facts: ProgramSummaryFacts | null): string | null {
  if (!narrative || !facts) return null;
  let text = '';
  try {
    const parsed = JSON.parse(narrative) as { asIsContext?: unknown; summary?: unknown };
    text = typeof parsed.asIsContext === 'string' && parsed.asIsContext.trim()
      ? parsed.asIsContext
      : typeof parsed.summary === 'string' ? parsed.summary : '';
  } catch {
    return null;
  }
  const clean = stripModelMarkdown(text)
    .replace(/\s*\[(?:L\d+(?:\s*[-–]\s*L?\d+)?|[A-Z]{2,}-\d+)(?:\s*,\s*(?:L\d+(?:\s*[-–]\s*L?\d+)?|[A-Z]{2,}-\d+))*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = clean.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0).slice(0, 2);
  const proposal = sentences.join(' ').trim();
  if (!proposal || proposal.length > 600) return null;
  return checkPurposeProposal(proposal, facts).ok ? proposal : null;
}

/** The tag beside a quoted header comment — a tag, not one of the nine provenance values (DESIGN.md §4). */
export const AUTHOR_CLAIM_LABEL = "Author's claim";

export type AuthorClaim =
  | { state: 'shown'; heading: string; text: string; lineStart: number; lineEnd: number }
  | { state: 'contradicted'; heading: string; problems: string[]; lineStart: number; lineEnd: number; note: string };

/**
 * The header comment's statement of purpose as an *Author's claim* (owner,
 * 12.10.2026), held to the same check as a model proposal. A claim the facts
 * contradict is **not shown** — the safer of the two choices the owner left
 * open: a reader who skims would take the quoted sentence for the program's
 * behaviour even under a warning. What stands instead is one line that the
 * header says something the code does not show, and what, with its lines.
 */
export function authorClaimOf(facts: ProgramSummaryFacts | null): AuthorClaim | null {
  const claim = facts?.headerClaim;
  if (!facts || !claim) return null;
  const check = checkPurposeProposal(claim.text, facts);
  if (check.ok) return { state: 'shown', ...claim };
  const range = claim.lineEnd > claim.lineStart ? `L${claim.lineStart}–${claim.lineEnd}` : `L${claim.lineStart}`;
  return {
    state: 'contradicted',
    heading: claim.heading,
    problems: check.problems,
    lineStart: claim.lineStart,
    lineEnd: claim.lineEnd,
    note: `The header comment (${range}) is not quoted here: it ${check.problems.join('; ')}.`,
  };
}

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
  // Any amount the money guard knows — "USD 40,000" puts the code before the number (CI of fb74afe8,
  // tests/money-honesty-guard.spec.ts).
  if (MONEY.test(t) || containsAmount(t)) problems.push('states money, savings or accuracy');

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
  // A business object named in a denial ("No accounting documents are posted") is not claimed —
  // but only the denying clause is set aside: "It does not post, but reads customer master
  // data" still claims the customer master (QA review of fb74afe8, 59320e766df2).
  const clauses = sentences.flatMap((s) => s.split(/[,;:]\s*|\s+(?:but|while|whereas|and then|however)\s+/i));
  const affirmed = clauses.filter((c) => !DOES_NOT_POST.test(c)).join(' ');
  for (const { re, tables } of WORD_TABLES) {
    const hit = re.exec(affirmed);
    if (!hit) continue;
    if (![...tables].some((name) => touched.has(name))) problems.push(`names “${hit[0]}”, which the code does not read`);
  }
  return { ok: problems.length === 0, problems };
}
