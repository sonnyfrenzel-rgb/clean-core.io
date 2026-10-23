/**
 * The top of First insights in the Business view, as at most five short blocks
 * a process owner reads in one screen — roadmap 3.0.21, "First insights
 * becomes the strongest page of the app" (owner decisions 22.10.2026; the
 * analysis's proposal: in short, who · in · out, step by step, what it decides,
 * what it changes).
 *
 * Nothing here reads the code. It picks and trims the sentences the engine
 * already wrote — the shared summary (`lib/program-summary-text.ts`) and the
 * rule explanation (`lib/abap/business-rule-set-explain.ts`) — so every
 * sentence on top is still an engine sentence with its line. A sentence is
 * only ever shortened at a clause the engine itself joined on (", reading …",
 * ", selected by …"), never reworded.
 *
 * Pure: no React, no DOM, no network, no model.
 */
import type { SummaryLine } from './program-summary-text';
import type { RuleSetExplanation } from './abap/business-rule-set-explain';

export interface BriefLine {
  text: string;
  /** `L42` or `L60-75`; null when the engine gave the sentence no line. */
  anchor: string | null;
}

/** One sentence of "In short", and the whole summary line it is cut from — the key a plain wording of that line has. */
export interface InShortPart {
  text: string;
  line: string;
  anchor: string | null;
}

export interface FirstLookBrief {
  /** One or two sentences, at most {@link IN_SHORT_WORDS} words: what the program does for the business. */
  inShort: (BriefLine & { parts: InShortPart[] }) | null;
  /** Who starts it — the summary's trigger sentence. */
  startedBy: BriefLine | null;
  /** What goes in — the data it reads and what selects it, cut from the purpose sentence. */
  goesIn: BriefLine | null;
  /** What comes out — the summary's result sentence. */
  comesOut: BriefLine | null;
}

/**
 * The most words of "In short" (analysis §3, block A: one sentence of 25). Owner, 23.10.2026: two short sentences,
 * about 40 words, where one would drop what the program does.
 */
export const IN_SHORT_WORDS = 40;

/** The most rule statements under "What it decides" on top (analysis §3, block E). */
export const DECIDES_SHOWN = 3;

const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const sentence = (text: string): string => {
  const t = text.trim().replace(/[,;:]\s*$/, '');
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

function anchorOf(line: Pick<SummaryLine, 'anchors'>): string | null {
  const a = line.anchors[0];
  if (!a) return null;
  return a.lineEnd > a.lineStart ? `L${a.lineStart}-${a.lineEnd}` : `L${a.lineStart}`;
}

/**
 * "Creates purchase orders and starts workflows in SAP, reading purchase
 * requisitions and suppliers, selected by purchase requisition number." →
 * head "Creates purchase orders and starts workflows in SAP" and tail
 * "purchase requisitions and suppliers, selected by purchase requisition number".
 * The summary joins those clauses itself (`programSummary`), so the cut is at
 * its own seams.
 */
export function splitPurpose(text: string): { head: string; tail: string | null } {
  const t = text.trim().replace(/\.\s*$/, '');
  const reading = t.search(/,\s+reading\s+/i);
  if (reading > 0) {
    return { head: t.slice(0, reading), tail: t.slice(reading).replace(/^,\s+reading\s+/i, '') };
  }
  const selected = t.search(/,\s+selected by\s+/i);
  if (selected > 0) {
    return { head: t.slice(0, selected), tail: t.slice(selected).replace(/^,\s+/, '') };
  }
  return { head: t, tail: null };
}

/**
 * A clause that says only what the program does not do or does not name —
 * "A read-only report that reads no table by name", "It does not post or
 * change data in SAP". True to the code, and the weakest thing to open with:
 * it never leads "In short" while a sentence of what the program does exists
 * (owner, 23.10.2026). It stays in the summary one fold down.
 */
export function isNegativeClause(text: string): boolean {
  return /\bno table by name\b|\breads (?:no|nothing)\b|^(?:it )?does not\b|^no\b|^nothing\b/i.test(text.trim());
}

/**
 * The top blocks out of the shared summary lines (`businessInShort`, without
 * codes).
 *
 * "In short" leads with what the program does for the business (owner,
 * 23.10.2026, after the 22.10.2026 rebuild opened his report with "A read-only
 * report that reads no table by name." and moved its description into the
 * fold): the purpose the program's own names give (`aim`, 3.0.20), then the
 * engine's purpose line cut at its own seam, then a further purpose or reads
 * line — at most two sentences and {@link IN_SHORT_WORDS} words. A negative
 * clause ({@link isNegativeClause}) stays in the fold; where nothing else says
 * what the program does, what comes out leads (and "Comes out" is then not said
 * a second time). Each part names the whole summary line it comes from, so a plain
 * wording of that line (`usePlainWording`) can stand in its place.
 */
export function firstLookBrief(lines: readonly SummaryLine[]): FirstLookBrief {
  const aim = lines.find((l) => l.key === 'purpose' && l.aim);
  const main = lines.find((l) => l.key === 'purpose' && !l.aim);
  const trigger = lines.find((l) => l.key === 'trigger');
  const result = lines.find((l) => l.key === 'result');

  const split = main ? splitPurpose(main.text) : null;
  const part = (text: string, line: SummaryLine): InShortPart => ({ text: sentence(text), line: line.text, anchor: anchorOf(line) });
  const candidates: InShortPart[] = [];
  if (aim) candidates.push(part(aim.text, aim));
  if (main && split) candidates.push(part(split.head, main));
  for (const l of lines) {
    if ((l.key === 'purpose' && l !== aim && l !== main) || (l.key === 'reads' && /^It reads\b/.test(l.text))) candidates.push(part(l.text, l));
  }
  const strong = candidates.filter((c) => !isNegativeClause(c.text));
  const negative = candidates.filter((c) => isNegativeClause(c.text));
  // Nothing says what it does: what comes out leads.
  const resultLeads = strong.length === 0 && !!result;
  // A negative clause leads only where the summary says nothing else at all.
  const ordered = resultLeads && result ? [part(capital(result.text), result)] : strong.length ? strong : negative.slice(0, 1);
  const parts: InShortPart[] = [];
  for (const c of ordered) {
    if (parts.length === 2) break;
    // A second sentence only while both stay short.
    if (parts.length === 0 || words(parts[0].text) + words(c.text) <= IN_SHORT_WORDS) parts.push(c);
  }
  const inShort = parts.length ? { text: parts.map((p) => p.text).join(' '), anchor: parts[0].anchor, parts } : null;

  return {
    inShort,
    startedBy: trigger ? { text: sentence(trigger.text), anchor: anchorOf(trigger) } : null,
    goesIn: main && split?.tail ? { text: sentence(capital(split.tail)), anchor: anchorOf(main) } : null,
    comesOut: result && !resultLeads ? { text: sentence(capital(result.text.replace(/^The result is\s+/i, ''))), anchor: anchorOf(result) } : null,
  };
}

export interface DecidesLine extends BriefLine {
  /** The question's id (`Q-BR-009`) — the rules it speaks for are asked about in Design. */
  id: string;
  /** Further questions whose statement reads word for word the same — one line, each one's lines kept (23.10.2026). */
  also?: Array<{ id: string; anchor: string | null }>;
}

/**
 * "What it decides" on top: the weightiest questions for the business, said as
 * the statement of what the code does (`RuleQuestion.statement`) — without the
 * ask, because nothing is decided here (owner decision 21.10.2026). Only the
 * business basket, so the block and the basket line under it count the same
 * rules (the fourth small fix of 22.10.2026: a rule listed here as a business
 * decision while the basket counted it as technical).
 */
export function decidesOnTop(explanation: RuleSetExplanation, max = DECIDES_SHOWN): { lines: DecidesLine[]; more: number } {
  // One sentence never stands twice (owner decision 23.10.2026): two questions whose statement reads the same are
  // one line, with the other one's lines beside it, and the next question takes the freed place.
  const lines: DecidesLine[] = [];
  let listed = 0;
  for (const q of explanation.questions) {
    const a = q.statement.anchors[0];
    const line = { id: q.id, text: q.statement.text, anchor: a ? (a.lineEnd > a.lineStart ? `L${a.lineStart}-${a.lineEnd}` : `L${a.lineStart}`) : null };
    const same = lines.find((l) => l.text.toLowerCase() === line.text.toLowerCase());
    if (same) {
      same.also = [...(same.also ?? []), { id: line.id, anchor: line.anchor }];
      listed += 1;
    } else if (lines.length < max) {
      lines.push(line);
      listed += 1;
    }
  }
  return { lines, more: Math.max(0, explanation.questions.length - listed) };
}

/** The most changes on top (3.0.21); the rest stand in the fold with their lines. */
export const CHANGES_SHOWN = 3;

/** A change named by a table, a transaction or another code — "Create entry in ZMM_PO_APPR", "(ME21N)". */
const CODE_NAMED = /\b[ZY][A-Z0-9_/]{2,}\b|\([A-Z0-9_]{3,}\)|\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/;

/**
 * "What it changes" on top: at most {@link CHANGES_SHOWN}, the ones said in
 * business words first (the analysis's block D — business objects on top,
 * table and transaction names one fold down). Order within each group stays
 * the engine's (creating first, then changing). Nothing is dropped: `more`
 * counts the rest, and the fold lists every change.
 */
export function changesOnTop<T extends { text: string }>(all: readonly T[], more = 0, max = CHANGES_SHOWN): { changes: T[]; more: number } {
  const plain = all.filter((c) => !CODE_NAMED.test(c.text));
  const coded = all.filter((c) => CODE_NAMED.test(c.text));
  const changes = [...plain, ...coded].slice(0, max);
  return { changes, more: more + all.length - changes.length };
}
