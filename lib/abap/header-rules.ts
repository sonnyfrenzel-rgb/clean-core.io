import type { SourceRange } from './statement-reader';

/**
 * Rules the header comment states (roadmap 3.0.13, SD review, 14.10.2026,
 * CR-A2).
 *
 * The reviewed program's header specified sixteen numbered rules (`R01` …
 * `R16`: filter by both cutoffs before deduplication, round once per claim,
 * unknown is not zero …) and its input bounds. None reached the register,
 * because the register reads conditions in code, and a comment is not code.
 *
 * They are read here as **candidates**: what the author says the program
 * does, quoted with their lines, never a fact the engine read — the register
 * lists them apart, marked "stated in the header, not read from code", and a
 * reader confirms each against the code before it counts.
 *
 * What counts:
 *
 *   - a numbered item in the comment block before the first statement:
 *     `R01`, `R01.`, `BR-01:`, `Rule 3`, `Regel 3` at the start of a comment
 *     line, with the lines indented under it as its continuation;
 *   - the sentences under a heading in capitals that names bounds or limits
 *     (`INPUT BOUNDS`, `LIMITS`, `CONSTRAINTS`, `GRENZEN`).
 *
 * Nothing else in the header is read as a rule: a purpose, a change log or a
 * list of what the program does not do is not one.
 *
 * Pure: string work only.
 */

export interface HeaderRuleCandidate extends SourceRange {
  /** The number as the author wrote it (`R01`), or `Bound n` for a sentence under a bounds heading. */
  id: string;
  kind: 'rule' | 'bound';
  /** The author's words, verbatim, lines joined with one space. */
  text: string;
}

/** Provenance words for a candidate wherever it is shown. */
export const HEADER_RULE_LABEL = 'Stated in the header, not read from code';

// A bare "R" needs two digits — "R3 system" is a release, "R03" a rule.
const ITEM = /^((?:R\d{2,3}|(?:BR-?|RULE\s+|REGEL\s+)\d{1,3}))\b[.:)]?\s+(\S.*)$/i;
const BOUNDS_HEADING = /^(?:[A-Z]+\s+)*(?:BOUNDS|LIMITS|CONSTRAINTS|GRENZEN|WERTEBEREICHE)(?:\s+[A-Z]+)*:?$/;
const HEADING = /^[A-Z][A-Z0-9 ()/&,.-]{3,}:?$/;
const DECOR = /^[-=*&_#\s]*$/;

/** The comment content of a line — after `*`, `*&` or a leading `"` — or null for a line of code. */
function commentOf(raw: string): string | null {
  const m = /^(?:\*&?|\s*")(.*)$/.exec(raw);
  return m ? m[1].replace(/\*+\s*$/, '').replace(/\s+$/, '') : null;
}

/** The rules and bounds the header comment states. Empty when it states none. */
export function readHeaderRules(source: string): HeaderRuleCandidate[] {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: HeaderRuleCandidate[] = [];
  let open: (HeaderRuleCandidate & { indent: number }) | null = null;
  let bounds: { lines: Array<{ text: string; line: number }> } | null = null;
  const close = () => {
    if (open) out.push({ id: open.id, kind: open.kind, text: open.text, lineStart: open.lineStart, lineEnd: open.lineEnd });
    open = null;
  };
  const closeBounds = () => {
    if (!bounds) return;
    let n = 0;
    // Sentences across the section's lines, each with the lines it spans.
    let text = '';
    let start = 0;
    for (const { text: t, line } of bounds.lines) {
      for (const piece of t.split(/(?<=[.!?])\s+/)) {
        if (!piece.trim()) continue;
        if (!text) start = line;
        text = text ? `${text} ${piece.trim()}` : piece.trim();
        if (/[.!?]$/.test(text)) {
          n += 1;
          out.push({ id: `Bound ${n}`, kind: 'bound', text, lineStart: start, lineEnd: line });
          text = '';
        }
      }
    }
    if (text) out.push({ id: `Bound ${n + 1}`, kind: 'bound', text, lineStart: start, lineEnd: bounds.lines[bounds.lines.length - 1].line });
    bounds = null;
  };
  for (let i = 0; i < lines.length && i < 400; i++) {
    const content = commentOf(lines[i]);
    if (content === null) {
      // The header ends at the first line of code; blank lines do not end it.
      if (lines[i].trim()) break;
      continue;
    }
    const trimmed = content.trim();
    const indent = content.length - content.trimStart().length;
    if (!trimmed || DECOR.test(trimmed)) {
      close();
      closeBounds();
      continue;
    }
    const item = ITEM.exec(trimmed);
    if (item) {
      close();
      closeBounds();
      open = { id: item[1].replace(/\s+/g, ' ').toUpperCase(), kind: 'rule', text: item[2].trim(), lineStart: i + 1, lineEnd: i + 1, indent };
      continue;
    }
    if (HEADING.test(trimmed)) {
      close();
      closeBounds();
      if (BOUNDS_HEADING.test(trimmed)) bounds = { lines: [] };
      continue;
    }
    if (open && indent > open.indent) {
      open.text = `${open.text} ${trimmed}`;
      open.lineEnd = i + 1;
      continue;
    }
    close();
    if (bounds) bounds.lines.push({ text: trimmed, line: i + 1 });
  }
  close();
  closeBounds();
  return out;
}

/**
 * "R01–R16" — the numbered ids, a run of three or more consecutive numbers of
 * one prefix as a range, everything else listed as written: "R01, R03, R04",
 * never "R01–R04" when R02 is absent (QA delta of 73b8cad63d3e).
 */
export function headerRuleRange(candidates: readonly HeaderRuleCandidate[]): string {
  const ids = candidates.filter((c) => c.kind === 'rule').map((c) => c.id);
  const parts: string[] = [];
  let run: Array<{ id: string; prefix: string; n: number }> = [];
  const flush = () => {
    if (run.length >= 3) parts.push(`${run[0].id}–${run[run.length - 1].id}`);
    else parts.push(...run.map((r) => r.id));
    run = [];
  };
  for (const id of ids) {
    const m = /^(.*?)(\d+)$/.exec(id);
    const item = { id, prefix: m ? m[1] : id, n: m ? Number(m[2]) : NaN };
    const last = run[run.length - 1];
    if (last && !(m && item.prefix === last.prefix && item.n === last.n + 1)) flush();
    if (m) run.push(item);
    else parts.push(id);
  }
  flush();
  return parts.join(', ');
}
