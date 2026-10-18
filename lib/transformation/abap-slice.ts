/**
 * The ABAP slice of one unit (design §8.1): what a fill prompt shows of the
 * original for that unit, and nothing else.
 *
 * Included, in this order, each line with its original number:
 *   1. the unit's own lines (the routine, or the event blocks for the orchestrator);
 *   2. the lines of every helper folded into it;
 *   3. the global TYPES/DATA/CONSTANTS statements whose names its lines read,
 *      at most `SLICE_DECLARATION_CHARS` characters (cut, and said so);
 *   4. up to three call sites with their actual parameters;
 *   5. masked: the lines of rules the owner dropped
 *      (`* [BR-007 dropped by the owner — not carried over]`).
 *
 * Excluded: other routines' bodies (their signatures reach the prompt as
 * callees), comment blocks longer than one line (kept as their first line),
 * and the selection screen (the input contract is engine-written).
 *
 * Pure and deterministic. No network, no model.
 */

import { containerAt } from '../abap/block-structure';
import type { EngineFacts } from './unit-plan';
import { SLICE_CALL_SITES, SLICE_DECLARATION_CHARS, type AbapSlice, type Unit, type UnitPlan } from './types';

const DECLARING = new Set(['TYPES', 'DATA', 'CONSTANTS', 'STATICS', 'CLASS-DATA', 'FIELD-SYMBOLS', 'RANGES', 'TABLES']);

const isCommentLine = (raw: string) => /^\s*\*/.test(raw) || /^\s*"/.test(raw);

function numbered(line: number, text: string, width: number): string {
  return `${String(line).padStart(width, '0')} ${text}`;
}

interface Declaration {
  names: string[];
  lineStart: number;
  lineEnd: number;
}

/** Global declarations, a chain or a BEGIN OF … END OF block as one, with the names they declare. */
function globalDeclarations(facts: EngineFacts): Declaration[] {
  const out: Declaration[] = [];
  let open: Declaration | null = null;
  let depth = 0;
  for (const st of facts.statements) {
    if (!DECLARING.has(st.keyword)) {
      open = null;
      continue;
    }
    if (containerAt(facts.blocks.containers, st.lineStart)) continue;
    const rest = st.text.slice(st.keyword.length).replace(/^\s*:?\s*/, '');
    const begin = /^BEGIN\s+OF\s+([\w/]+)/i.exec(rest);
    const end = /^END\s+OF\b/i.test(rest);
    const name = begin ? begin[1] : /^<?([\w/]+)>?/.exec(rest)?.[1] ?? null;
    const chainHead = st.fromChain ? st.chainHeadLine ?? st.lineStart : st.lineStart;
    if (open && (depth > 0 || (st.fromChain && open.lineStart === chainHead))) {
      if (name && !end && depth <= 1) open.names.push(name.toLowerCase());
      open.lineEnd = Math.max(open.lineEnd, st.lineEnd);
    } else {
      open = { names: name ? [name.toLowerCase()] : [], lineStart: chainHead, lineEnd: st.lineEnd };
      out.push(open);
    }
    if (begin) depth++;
    if (end) depth = Math.max(0, depth - 1);
  }
  return out;
}

const wordsOf = (text: string) => new Set((text.toLowerCase().match(/[a-z_][\w/]*/g) ?? []));

/** Collapse runs of full-line comments to their first line; mask lines of dropped rules. */
function sliceLines(
  facts: EngineFacts,
  ranges: Unit['abap'],
  masks: Map<number, string>,
  width: number,
  maskedOut: AbapSlice['masked'],
): string[] {
  const out: string[] = [];
  for (const r of ranges) {
    let commentRun = 0;
    for (let line = r.lineStart; line <= r.lineEnd; line++) {
      const raw = facts.lines[line - 1] ?? '';
      const rule = masks.get(line);
      if (rule) {
        const first = !masks.has(line - 1) || masks.get(line - 1) !== rule || line === r.lineStart;
        out.push(numbered(line, first ? `* [${rule} dropped by the owner — not carried over]` : '*', width));
        maskedOut.push({ line, rule });
        commentRun = 0;
        continue;
      }
      if (isCommentLine(raw)) {
        commentRun++;
        if (commentRun === 1) out.push(numbered(line, raw, width));
        else if (commentRun === 2) out[out.length - 1] += ' …';
        continue;
      }
      commentRun = 0;
      out.push(numbered(line, raw, width));
    }
  }
  return out;
}

/** The slice of `unit` — see the file comment. */
export function sliceFor(unit: Unit, plan: Pick<UnitPlan, 'rules' | 'units'>, facts: EngineFacts): AbapSlice {
  const width = Math.max(4, String(facts.lines.length).length);
  const masks = new Map<number, string>();
  for (const r of plan.rules) {
    if (r.decision !== 'drop') continue;
    for (const rg of r.ranges) for (let l = rg.lineStart; l <= rg.lineEnd; l++) if (!masks.has(l)) masks.set(l, r.id);
  }
  const masked: AbapSlice['masked'] = [];
  const own = sliceLines(facts, unit.abap, masks, width, masked);
  const text = own.join('\n');

  // Declarations the lines read, one level of type references followed.
  const used = wordsOf(own.map((l) => l.slice(width + 1)).join('\n'));
  const decls = globalDeclarations(facts);
  const chosen: Declaration[] = [];
  const pick = (names: Set<string>) => {
    for (const d of decls) if (!chosen.includes(d) && d.names.some((n) => names.has(n))) chosen.push(d);
  };
  pick(used);
  const second = wordsOf(chosen.map((d) => facts.lines.slice(d.lineStart - 1, d.lineEnd).join('\n')).join('\n'));
  pick(second);
  chosen.sort((a, b) => a.lineStart - b.lineStart);
  const declLines: string[] = [];
  let declChars = 0;
  let cut = 0;
  for (const d of chosen) {
    const block = [];
    for (let l = d.lineStart; l <= d.lineEnd; l++) {
      const raw = facts.lines[l - 1] ?? '';
      if (isCommentLine(raw)) continue;
      block.push(numbered(l, raw, width));
    }
    const len = block.join('\n').length + 1;
    if (declChars + len > SLICE_DECLARATION_CHARS) {
      cut++;
      continue;
    }
    declChars += len;
    declLines.push(...block);
  }
  if (cut > 0) declLines.push(`* … ${cut} more declaration${cut === 1 ? '' : 's'} not shown (budget ${SLICE_DECLARATION_CHARS} characters)`);

  // Call sites of the unit's routine.
  // PERFORM calls a FORM: a method of the same name has none of them (scaffold 17).
  const callSites: AbapSlice['callSites'] = unit.routine && unit.kind !== 'method'
    ? facts.graph.performs
        .filter((p) => p.target === unit.routine)
        .slice(0, SLICE_CALL_SITES)
        .map((p) => ({ line: p.lineStart, caller: p.caller, text: p.text }))
    : [];

  const lines = unit.abap.reduce((n, r) => n + (r.lineEnd - r.lineStart + 1), 0);
  const declarations = declLines.join('\n');
  return {
    unitId: unit.id,
    ranges: unit.abap,
    text,
    declarations,
    declarationsCut: cut,
    callSites,
    masked,
    chars: text.length + (declarations ? declarations.length + 1 : 0) + callSites.reduce((n, c) => n + c.text.length + width + 2, 0),
    lines,
  };
}
