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

export interface FirstLookBrief {
  /** One sentence, at most {@link IN_SHORT_WORDS} words: what the program is for. */
  inShort: BriefLine | null;
  /** Who starts it — the summary's trigger sentence. */
  startedBy: BriefLine | null;
  /** What goes in — the data it reads and what selects it, cut from the purpose sentence. */
  goesIn: BriefLine | null;
  /** What comes out — the summary's result sentence. */
  comesOut: BriefLine | null;
}

/** The most words of the one "In short" sentence (analysis §3, block A). */
export const IN_SHORT_WORDS = 25;

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
 * The top blocks out of the shared summary lines (`businessInShort`, without
 * codes). The purpose the program's own names give (`aim`, 3.0.20) leads when
 * there is one; the engine's line on what it changes follows it when both fit
 * into {@link IN_SHORT_WORDS} words.
 */
export function firstLookBrief(lines: readonly SummaryLine[]): FirstLookBrief {
  const aim = lines.find((l) => l.key === 'purpose' && l.aim);
  const main = lines.find((l) => l.key === 'purpose' && !l.aim);
  const trigger = lines.find((l) => l.key === 'trigger');
  const result = lines.find((l) => l.key === 'result');

  const split = main ? splitPurpose(main.text) : null;
  let inShort: BriefLine | null = null;
  if (aim) {
    const first = sentence(aim.text);
    const second = split ? sentence(split.head) : null;
    inShort = {
      text: second && words(first) + words(second) <= IN_SHORT_WORDS ? `${first} ${second}` : first,
      anchor: anchorOf(aim),
    };
  } else if (main && split) {
    inShort = { text: sentence(split.head), anchor: anchorOf(main) };
  }

  return {
    inShort,
    startedBy: trigger ? { text: sentence(trigger.text), anchor: anchorOf(trigger) } : null,
    goesIn: main && split?.tail ? { text: sentence(capital(split.tail)), anchor: anchorOf(main) } : null,
    comesOut: result ? { text: sentence(capital(result.text.replace(/^The result is\s+/i, ''))), anchor: anchorOf(result) } : null,
  };
}

export interface DecidesLine extends BriefLine {
  /** The question's id (`Q-BR-009`) — the rules it speaks for are asked about in Design. */
  id: string;
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
  const lines = explanation.questions.slice(0, max).map((q) => {
    const a = q.statement.anchors[0];
    return {
      id: q.id,
      text: q.statement.text,
      anchor: a ? (a.lineEnd > a.lineStart ? `L${a.lineStart}-${a.lineEnd}` : `L${a.lineStart}`) : null,
    };
  });
  return { lines, more: Math.max(0, explanation.questions.length - lines.length) };
}
