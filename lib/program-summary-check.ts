import { containsAmount } from '@/lib/money-honesty';
import { BTP } from '@/lib/sap-naming';
import { TABLE_TERMS_EN } from '@/lib/abap/plain-glossary';
import { stripModelMarkdown } from '@/lib/model-text';
import { sapCheckedNarrative } from '@/lib/sap-reference-check';
import type { ProgramSummaryFacts } from '@/lib/program-summary-text';

/**
 * Holds a model's wording of what a program is for against the engine's facts
 * (roadmap 3.0.11, "In short"; owner, 12.10.2026): *"Where the purpose needs
 * words the code does not hold, a model may phrase it from those facts, marked
 * AI-generated and checked against them — no claim the facts contradict;
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
 *   - it states money, savings or accuracy (ADR-022; no savings claims);
 *   - it names a table, by its code, as changed that the code only reads.
 *
 * It reads English and German (SD review, 12.10.2026); a text in any other
 * language fails it, since none of its words could match.
 *
 * Pure: glossary data only.
 */

export interface PurposeCheck {
  ok: boolean;
  problems: string[];
}

// "posted items" describes the data it reads, not a posting it makes — and so do
// "already posted credits" and "previously posted invoices" (SD review of
// 14.10.2026, CR-A4/D01: a header naming the posted credits its simulation
// considers was dropped as claiming a posting).
// The same holds for "posted history", "posted records", "posted transactions",
// "posted movements" and "posted totals", and for "posting history" and
// "posting records": each names data already in the system that the program reads.
const POSTS = /\b(?:posts?|(?<!\b(?:already|previously|earlier|formerly|existing|prior) )posted(?! (?:items?|documents?|amounts?|entries|data|values?|balances?|lines?|costs?|credits?|invoices?|payments?|receipts?|quantit(?:y|ies)|goods|histor(?:y|ies)|records?|transactions?|movements?|totals?))|posting(?! (?:date|period|key|keys|histor(?:y|ies)|records?))|books?\b(?! of)|booked|creates? (?:an? |the )?(?:accounting |FI |financial |purchase |sales )?(?:documents?|orders?)|updates? the (?:ledger|account|balance|master)|writes? back|settles?\b|clears? (?:the |all )?(?:open )?items?|changes? (?:the )?(?:master|data|records?|documents?) in SAP)\b/i;
const DOES_NOT_POST = /\b(?:does not|doesn't|do not|never|cannot|can't|no longer) (?:post|change|update|book)\b|\bread-only\b|\bnon-posting\b|\bno (?:[\w-]+ ){0,3}(?:are |is )?(?:posted|booked|changed)\b|\bwithout posting\b/i;
/*
 * A negated statement claims nothing (SD review of 14.10.2026, CR-A4): "It never
 * dispatches an order, changes a work center, reserves people, posts a
 * confirmation or changes an SAP document" and "No creation of a credit memo
 * request, billing document or FI posting" list what the program does not do.
 * The whole clause after the negation is set aside — a list joined by commas
 * and "or" stays inside it — up to the end of the sentence, a semicolon, or an
 * "and"/"but" that starts a new statement: "It does not change data and posts
 * documents" still claims a posting.
 */
const NEGATED_CLAUSE = /\b(?:does not|doesn't|do not|don't|never|cannot|can't|no longer|without|no creation of|not(?! only))\b[^.;!?]*?(?=,?\s+(?:and|but)\s+|[.;!?]|$)/gi;
const MAIL = /\b(?:(?:e-?)?mail(?:s|ed|ing)?|sends? (?:a |an |the )?(?:letter|reminder|notice|notification|correspondence|message))\b/i;
const APPROVAL = /\b(?:approval workflow|approves?|sign-?off|four[- ]eyes|release strategy)\b/i;
const MONEY = /(?:[$€£]\s?\d|\b\d[\d.,]*\s?(?:EUR|USD|GBP|CHF|k€|million|bn)\b|\bsav(?:e|es|ing|ings)\b|\bROI\b|\bcost reduction\b|\b\d+\s?% (?:faster|cheaper|accura\w*|less)\b|\baccuracy\b)/i;

/*
 * The same checks in German (SD review, 12.10.2026): a header comment headed
 * ZWECK or BESCHREIBUNG — the heading reader knows them — was held to English
 * words only, so it always passed and was quoted, a 700-character German text
 * naming a table as changed that the code only reads among it. Word edges are
 * letters, not `\b`, which does not see "ä" as a letter.
 */
const POSTS_DE = /(?<!\p{L})(?:(?:ver)?bucht|gebucht|(?:ver)?buchen|ändert|geändert|aktualisiert|löscht|gelöscht|storniert|pflegt|(?:erstellt|erzeugt|legt)\s+(?:\p{L}+\s+){0,3}?(?:\p{L}*belege?|\p{L}*aufträge|\p{L}*auftrag|bestellungen?|buchungen?|stammdaten)|schreibt\s+(?:\p{L}+\s+){0,3}?zurück)(?!\p{L})/iu;
const DOES_NOT_POST_DE = /(?<!\p{L})(?:(?:bucht|verbucht|ändert|aktualisiert|löscht|schreibt)\s+(?:\p{L}+\s+){0,3}?(?:nicht|nichts|keine?[nrs]?)|nur\s+lesend|liest\s+nur|keine\s+(?:\p{L}+\s+){0,3}?(?:buchung|buchungen|änderung|änderungen)|ohne\s+(?:zu\s+)?buchen|nicht\s+gebucht)(?!\p{L})/iu;
const MAIL_DE = /(?<!\p{L})(?:benachrichtig\p{L}*|(?:versendet|verschickt|sendet)\s+(?:\p{L}+\s+){0,3}?(?:nachricht\p{L}*|briefe?|schreiben))(?!\p{L})/iu;
const APPROVAL_DE = /(?<!\p{L})(?:freigabe\p{L}*|freigeben|gibt\s+(?:\p{L}+\s+){0,3}?frei|genehmig\p{L}*|vier-augen\p{L}*)(?!\p{L})/iu;
const MONEY_DE = /(?<!\p{L})(?:einspar\p{L}*|spart|sparen|kostensenkung\p{L}*|genauigkeit)(?!\p{L})|\d+\s?%\s+(?:schneller|günstiger|weniger)/iu;

/** A word of changing, in either language — the table check below asks which tables a sentence says are changed. */
const CHANGE_WORD = /\b(?:post(?:s|ed|ing)?|book(?:s|ed|ing)?|chang\w*|updat\w*|modif\w*|delet\w*|insert\w*|writ(?:e|es|ing)\b|manipulat\w*)|(?<!\p{L})(?:(?:ver)?buch(?:t|en|ung|ungen)|(?:ge)?änder\p{L}*|aktualis\p{L}*|(?:ge)?lösch\p{L}*|schreib\p{L}*|manipul\p{L}*|modifiz\p{L}*|storn\p{L}*|pfleg\p{L}*)(?!\p{L})/iu;

/*
 * The languages the check reads. A claim in another one is not quoted: the
 * words it looks for would never match, and an unread claim would pass every
 * time. Counted on function words, so a German text with English loan words
 * ("Cockpit", "Legacy") is still German.
 */
const EN_WORDS = new Set(['the', 'and', 'of', 'to', 'for', 'with', 'is', 'are', 'it', 'this', 'from', 'on', 'by', 'which', 'that', 'not', 'or']);
const DE_WORDS = new Set(['der', 'die', 'das', 'und', 'für', 'mit', 'auf', 'nicht', 'ist', 'sind', 'wird', 'werden', 'von', 'zu', 'im', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'enthält', 'oder', 'aus', 'bei', 'nach', 'über']);
const OTHER_WORDS = new Set(['le', 'la', 'les', 'et', 'pour', 'avec', 'est', 'une', 'el', 'los', 'las', 'para', 'con', 'y', 'il', 'di', 'che', 'het', 'een', 'voor', 'van', 'met', 'niet', 'uma', 'não', 'por', 'de', 'en', 'du', 'del', 'och', 'af', 'og', 'ett', 'av']);

/*
 * Positive evidence besides function words: a short
 * claim has few function words or none, and the language used to default to English —
 * "Contabiliza facturas." was read as English and quoted. A word counts for English when
 * the glossary's business words hold it ("cost", "center", "order") or it has an English
 * ending; for German, an umlaut or a German ending; for neither, a Romance ending.
 */
const EN_VOCAB: ReadonlySet<string> = new Set(
  Object.values(TABLE_TERMS_EN)
    .flatMap((term) => `${term.singular} ${term.plural}`.toLowerCase().match(/\p{L}+/gu) ?? [])
    .filter((w) => w.length >= 4),
);
const EN_FORM = /^(?:th|wh)\p{L}+$|^\p{L}{2,}(?:ing|tions?|ments?|ness|ly|ed)$/u;
const DE_FORM = /[äöüß]|^\p{L}{2,}(?:ungs?|ungen|keit|heit|lich|liche[nrs]?|isch|ische[nrs]?|schaft)$|sch/u;
const OTHER_FORM = /^\p{L}{3,}(?:as|os|ción|ciones|zione|zioni|ção|ções|mente|iza|izar|izza|izzare)$/u;

/**
 * `en`, `de`, or `other` when the claim is in a language the check does not read — and
 * `unknown` when it shows too little of any language to tell.
 * Only `en` and `de` are read; every other answer fails closed.
 */
export function claimLanguage(text: string): 'en' | 'de' | 'other' | 'unknown' {
  const t = String(text ?? '');
  // Another script, or letters with accents German does not use (é, ñ, ç, å …).
  if (/[^\p{Script=Latin}\P{L}]/u.test(t) || /[À-ÃÅ-ÖØ-ÛÝ-ßà-ãå-öø-ûý-ÿ]/.test(t.replace(/[ÄÖÜäöüß]/g, ''))) return 'other';
  const words = (t.toLowerCase().match(/\p{L}+/gu) ?? []);
  if (!words.length) return 'unknown';
  const score = (fn: (w: string) => boolean) => words.filter(fn).length;
  const en = score((w) => EN_WORDS.has(w) || EN_VOCAB.has(w) || EN_FORM.test(w));
  const de = score((w) => DE_WORDS.has(w) || DE_FORM.test(w));
  const other = score((w) => OTHER_WORDS.has(w) || OTHER_FORM.test(w));
  const best = Math.max(en, de);
  if (other > 0 && other >= best) return 'other';
  // Length-aware: one word of evidence for a claim of up to eight words, then one in eight.
  if (best < Math.max(1, Math.ceil(words.length / 8))) return 'unknown';
  return de > en ? 'de' : 'en';
}

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
 * the chip *AI-generated*, the engine's sentence underneath.
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
  // 3.0.18 item 13 (QM-08, FI-F12): its SAP identifiers pass the check — a mismatch is dropped with SAP's title.
  return checkPurposeProposal(proposal, facts).ok ? sapCheckedNarrative(proposal) : null;
}

/** The tag beside a quoted header comment — a tag, not one of the nine provenance values (DESIGN.md §4). */
export const AUTHOR_CLAIM_LABEL = "Author's claim";

export type AuthorClaim =
  | { state: 'shown'; heading: string; text: string; lineStart: number; lineEnd: number }
  | { state: 'contradicted'; heading: string; problems: string[]; lineStart: number; lineEnd: number; note: string };

/**
 * The header comment's statement of purpose as an *Author's claim* (owner,
 * 12.10.2026), held to the same check as AI-generated. A claim the facts
 * contradict is **not shown** — the safer of the two choices the owner left
 * open: a reader who skims would take the quoted sentence for the program's
 * behaviour even under a warning. What stands instead is one line that the
 * header says something the code does not show, and what, with its lines.
 */
export function authorClaimOf(facts: ProgramSummaryFacts | null): AuthorClaim | null {
  const claim = facts?.headerClaim;
  if (!facts || !claim) return null;
  // The whole claim is checked; what is quoted is at most a statement of purpose.
  const check = checkPurposeProposal(claim.text, facts);
  const quoted = check.ok ? quotableClaim(claim.text) : null;
  if (quoted) return { state: 'shown', ...claim, text: quoted };
  const range = claim.lineEnd > claim.lineStart ? `L${claim.lineStart}–${claim.lineEnd}` : `L${claim.lineStart}`;
  const problems = check.ok ? [TOO_LONG] : check.problems;
  return {
    // Not quoted — contradicted, unread or too long; the note says which.
    state: 'contradicted',
    heading: claim.heading,
    problems,
    lineStart: claim.lineStart,
    lineEnd: claim.lineEnd,
    note: problems.includes(UNREAD_LANGUAGE)
      ? `The header comment (${range}) is in a language the check does not read; it is not quoted.`
      : `The header comment (${range}) is not quoted here: it ${problems.join('; ')}.`,
  };
}

/** Longest claim quoted whole; a longer one is quoted by its first sentence (SD review, 12.10.2026). */
export const AUTHOR_CLAIM_MAX = 300;
const UNREAD_LANGUAGE = 'is in a language the check does not read';
const TOO_LONG = `is longer than a statement of purpose (over ${AUTHOR_CLAIM_MAX} characters, and no first sentence that short)`;

/**
 * What of a checked claim is quoted: the whole text up to 300 characters, else
 * its first sentence when that is short enough to stand as a statement of
 * purpose, else nothing. A header of 700 characters is a description, not a
 * purpose — the SD program's listed its anti-patterns — and quoted whole it
 * outweighs the engine's sentence underneath it (SD review, 12.10.2026).
 */
function quotableClaim(text: string): string | null {
  if (text.length <= AUTHOR_CLAIM_MAX) return text;
  const first = text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? '';
  return first.length >= 12 && first.length <= AUTHOR_CLAIM_MAX && /[.!?]$/.test(first) ? first : null;
}

export function checkPurposeProposal(text: string, facts: ProgramSummaryFacts): PurposeCheck {
  const problems: string[] = [];
  const t = String(text ?? '');
  if (!t.trim()) return { ok: false, problems: ['empty'] };

  // Only a text in a language the check reads can pass it (SD review, 12.10.2026).
  // Fail closed: a claim not shown to be English or German is not read.
  const language = claimLanguage(t);
  if (language !== 'en' && language !== 'de') return { ok: false, problems: [UNREAD_LANGUAGE] };

  const changes = facts.changes.state;
  // "It does not post" names posting without claiming it: the denial is set aside, and what is
  // left is checked — "It does not change data and posts documents" still claims a posting.
  // English and German alike (SD review, 12.10.2026).
  const undenied = t
    .replace(NEGATED_CLAUSE, ' ')
    .replace(new RegExp(DOES_NOT_POST.source, 'gi'), ' ')
    .replace(new RegExp(DOES_NOT_POST_DE.source, 'giu'), ' ');
  if (changes === 'none' && (POSTS.test(undenied) || POSTS_DE.test(undenied))) {
    problems.push('claims a posting or a data change; the code changes no data');
  }
  if (changes === 'changes' && (DOES_NOT_POST.test(t) || DOES_NOT_POST_DE.test(t))) {
    problems.push('says it does not post or change data; the code changes data');
  }
  if (!facts.outputs.mail && (MAIL.test(t) || MAIL_DE.test(t))) problems.push('claims correspondence; the code sends none');
  if ((APPROVAL.test(t) || APPROVAL_DE.test(t)) && !facts.changes.actions.some((a) => /^(?:Release|Start)\b/.test(a.word))) {
    problems.push('claims an approval; the code runs none');
  }
  // Any amount the money guard knows — "USD 40,000" puts the code before the number (CI of fb74afe8,
  // tests/money-honesty-guard.spec.ts).
  if (MONEY.test(t) || MONEY_DE.test(t) || containsAmount(t)) problems.push('states money, savings or accuracy');

  // A table named in a sentence that says it is changed must be one the code writes — by its
  // code, so in any language: "Änderungen erfolgen direkt in den Standardtabellen (VBAK, VBAP)" for a
  // program that writes only VBAP (SD review, 12.10.2026). Coarse on purpose — one sentence that
  // reads one table and changes another is held too; the engine's own sentence then stands alone.
  const written = new Set([...facts.writes.map((o) => o.name), ...facts.changes.actions.map((a) => a.name)]);
  const readOnly = new Set(facts.reads.map((o) => o.name).filter((name) => !written.has(name)));
  const namedAsChanged = new Set<string>();
  for (const sentence of undenied.split(/(?<=[.!?;])\s+|\n+/)) {
    if (!CHANGE_WORD.test(sentence)) continue;
    for (const m of sentence.matchAll(CODE)) if (readOnly.has(m[0])) namedAsChanged.add(m[0]);
  }
  for (const code of namedAsChanged) problems.push(`names ${code} as changed; the code does not write ${code}`);

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
  // but only the denial itself is set aside, whatever joins it to the rest: "It does not post,
  // but reads …" and "It does not post and reads …" still claim what they read. A denial that
  // names its object outside the
  // matched words is checked too: on the safe side, the engine's own sentence is shown instead.
  const affirmed = undenied;
  for (const { re, tables } of WORD_TABLES) {
    const hit = re.exec(affirmed);
    if (!hit) continue;
    if (![...tables].some((name) => touched.has(name))) problems.push(`names “${hit[0]}”, which the code does not read`);
  }
  return { ok: problems.length === 0, problems };
}
