import { maskLiterals, readStatements, type AbapStatement } from './statement-reader';
import { readBlocks, type Block, type BlockStructure } from './block-structure';
import { FIELD_TERMS_EN, TABLE_TERMS_EN } from './plain-glossary';
import { plainContext, type PlainContext } from './plain-language';

/**
 * A check in the program's own words — roadmap 3.0.21, owner decision
 * 22.10.2026 on the First-insights page: a step's check read "Mmsta 01 or Z9",
 * "Gewei", "Ustyp B or C" — a condition on a field the dictionary words for no
 * business reader — while the program says on that very branch what it means:
 * `PERFORM reject USING 'Material is blocked for purchasing in this plant'`.
 *
 * This module reads, for one decision point:
 *
 *   - its **arms** — the `IF` and every `ELSEIF` / `ELSE` at its own level,
 *     or the `WHEN`s of a `CASE` — each with its condition;
 *   - each arm's **message**: the first text the program itself gives on that
 *     arm, at the arm's own level — `MESSAGE '…'`, `MESSAGE e001 WITH '…'`,
 *     a sentence handed to a routine (`PERFORM reject USING '…'`), a reason,
 *     message or note field set to a sentence (`ls_result-reason = '…'`,
 *     `CONCATENATE cv_note '…' INTO cv_note`). A text the arm does not hold
 *     itself — one a called routine raises — is not tied to it;
 *   - the **raw fields** of a condition: dictionary fields (`TYPE marc-mmsta`,
 *     a component of an SAP table's row, a structure component typed by a
 *     dictionary field) the plain glossary has no word for. Said as they are
 *     written they are a field name, not a business word.
 *
 * Deterministic and anchored: nothing is inferred, a text is the program's own
 * literal. Pure: the statement reader, the block structure and the glossary.
 * The caller gates it (`ENGINE_READS_3021_FROM`).
 */

export interface BranchReading {
  statements: AbapStatement[];
  structure: BlockStructure;
  ctx: PlainContext;
  /** Variables and structure components declared by a dictionary field — `lv_mmsta` → `marc-mmsta`. */
  dictionaryTyped: ReadonlyMap<string, string>;
}

export function branchReadingOf(source: string): BranchReading {
  const statements = readStatements(source);
  const dictionaryTyped = new Map<string, string>();
  for (const s of statements) {
    if (!/^(?:DATA|TYPES|CLASS-DATA|STATICS|PARAMETERS?)$/i.test(s.keyword)) continue;
    const text = maskLiterals(s.text).replace(/^\S+\s*:?\s*/, '');
    for (const m of text.matchAll(/(?:^|,)\s*(?:BEGIN\s+OF\s+[\w/]+\s*,\s*)?([\w/]+)\s+(?:TYPE|LIKE)\s+([\w/]+-[\w/]+)\b/gi)) {
      const name = m[1].toLowerCase();
      if (!dictionaryTyped.has(name)) dictionaryTyped.set(name, m[2].toLowerCase());
    }
  }
  return { statements, structure: readBlocks(statements), ctx: plainContext(source), dictionaryTyped };
}

export interface DecisionArm {
  /** Index of the arm's header statement (`IF`, `ELSEIF`, `ELSE`, `WHEN`). */
  header: number;
  /** The arm's condition, without its keyword; null for `ELSE` / `WHEN OTHERS`. */
  condition: string | null;
  /** The program's own text on this arm (see the file comment), or null. */
  message: string | null;
}

const statementAt = (r: BranchReading, line: number): number => r.statements.findIndex((s) => s.lineStart <= line && s.lineEnd >= line);

/** The innermost block that opens at statement `at`, of an `if` or `case` kind. */
function blockOpeningAt(r: BranchReading, at: number): Block | null {
  return r.structure.blocks.find((b) => b.openIndex === at && (b.kind === 'if' || b.kind === 'case')) ?? null;
}

const innermost = (r: BranchReading, index: number): Block | undefined => {
  const around = r.structure.enclosing[index] ?? [];
  return around[around.length - 1];
};

/** The arms of the decision whose header stands on `line`; a `CHECK` is one arm without a body. Null when the line holds none. */
export function decisionArmsAt(r: BranchReading, line: number): DecisionArm[] | null {
  const at = statementAt(r, line);
  if (at < 0) return null;
  const s = r.statements[at];
  const keyword = s.keyword.toUpperCase();
  if (keyword === 'CHECK') return [{ header: at, condition: conditionOf(s), message: null }];
  // An ELSEIF stands for its own arm only.
  if (keyword === 'ELSEIF') {
    const block = innermost(r, at);
    return block ? armsOf(r, block).filter((a) => a.header === at) : null;
  }
  if (keyword !== 'IF' && keyword !== 'CASE') return null;
  const block = blockOpeningAt(r, at);
  return block ? armsOf(r, block) : null;
}

function conditionOf(s: AbapStatement): string | null {
  const text = s.text.replace(/\.\s*$/, '').trim();
  if (/^(?:ELSE|WHEN\s+OTHERS)$/i.test(text)) return null;
  return text.replace(/^(?:IF|ELSEIF|CHECK|WHILE|CASE|WHEN)\s+/i, '').trim();
}

function armsOf(r: BranchReading, block: Block): DecisionArm[] {
  const headers: number[] = block.kind === 'if' ? [block.openIndex] : [];
  for (let j = block.openIndex + 1; j < block.closeIndex; j += 1) {
    if (innermost(r, j) !== block) continue;
    const keyword = r.statements[j].keyword.toUpperCase();
    if (block.kind === 'if' ? keyword === 'ELSEIF' || keyword === 'ELSE' : keyword === 'WHEN') headers.push(j);
  }
  return headers.map((header, i) => {
    const end = headers[i + 1] ?? block.closeIndex;
    let message: string | null = null;
    for (let j = header + 1; j < end && message === null; j += 1) {
      if (innermost(r, j) !== block) continue;
      message = messageOf(r.statements[j].text);
    }
    return { header, condition: conditionOf(r.statements[header]), message };
  });
}

/** The innermost `IF` / `CASE` arm statement `index` stands in, with its block; null outside any. */
export function armAround(r: BranchReading, index: number): { arm: DecisionArm; arms: DecisionArm[] } | null {
  const blocks = (r.structure.enclosing[index] ?? []).filter((b) => b.kind === 'if' || b.kind === 'case');
  const block = blocks[blocks.length - 1];
  if (!block) return null;
  const arms = armsOf(r, block);
  const arm = [...arms].reverse().find((a) => a.header < index);
  return arm ? { arm, arms } : null;
}

/** The arm around the statement on `line` (see `armAround`). */
export function armAroundLine(r: BranchReading, line: number): { arm: DecisionArm; arms: DecisionArm[] } | null {
  const at = statementAt(r, line);
  return at < 0 ? null : armAround(r, at);
}

/* ------------------------------------------------------------ the messages */

const LITERAL = /'((?:[^']|'')*)'/g;
const NOTE_FIELD = /(?:^|[_\->])(?:reason|message|msg|text|note|error|errtext|remark)s?$/i;

/** A literal a reader can take as a sentence: two words or more, not a code. */
export function isSentenceLiteral(text: string): boolean {
  const t = text.trim();
  return t.length >= 6 && t.length <= 160 && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(t) && !/^[A-Z0-9_\-/]+$/.test(t);
}

const literalsOf = (text: string): string[] => [...text.matchAll(LITERAL)].map((m) => m[1].replace(/''/g, "'"));
const firstSentence = (text: string): string | null => literalsOf(text).find(isSentenceLiteral) ?? null;
const clean = (text: string | null): string | null => (text ? text.trim().replace(/\s*[:.!]+$/, '').replace(/\s+/g, ' ') : null);

/** The program's own text a statement gives, if it is one of the forms the file comment names. */
export function messageOf(statementText: string): string | null {
  const text = statementText.trim();
  if (/^MESSAGE\b/i.test(text)) {
    const direct = /^MESSAGE\s+'((?:[^']|'')+)'/i.exec(text);
    if (direct && isSentenceLiteral(direct[1])) return clean(direct[1].replace(/''/g, "'"));
    const withPart = /\bWITH\b([\s\S]*)$/i.exec(text);
    return withPart ? clean(firstSentence(withPart[1])) : null;
  }
  if (/^PERFORM\b/i.test(text)) {
    const using = /\bUSING\b([\s\S]*?)(?:\bCHANGING\b|\bTABLES\b|$)/i.exec(text);
    return using ? clean(firstSentence(using[1])) : null;
  }
  if (/^CONCATENATE\b/i.test(text)) {
    const m = /^CONCATENATE\b([\s\S]*?)\bINTO\s+([\w/<>~-]+)/i.exec(text);
    return m && NOTE_FIELD.test(m[2]) ? clean(firstSentence(m[1])) : null;
  }
  const assign = /^([\w/<>~-]+)\s*=\s*'((?:[^']|'')*)'\s*\.?$/.exec(text);
  if (assign && NOTE_FIELD.test(assign[1]) && isSentenceLiteral(assign[2])) return clean(assign[2].replace(/''/g, "'"));
  return null;
}

/* ---------------------------------------------------------- the raw fields */

/** The parts of a condition joined by AND / OR (literals kept whole), without NOT and brackets. */
function atomsOf(condition: string): string[] {
  return condition
    .replace(/'(?:[^']|'')*'/g, (m) => m.replace(/\s+(AND|OR)\s+/gi, ' _$1_ '))
    .split(/\s+(?:AND|OR)\s+/i)
    .map((a) => a.replace(/[()]/g, ' ').replace(/^\s*NOT\s+/i, '').trim())
    .filter(Boolean);
}

const IDENTIFIER = /^[A-Za-z_<][\w/<>~-]*$/;
const KEYWORDS = /^(?:IS|NOT|INITIAL|BOUND|ASSIGNED|SUPPLIED|IN|CP|NP|CS|NS|CA|NA|CO|CN|EQ|NE|LT|GT|LE|GE|BETWEEN|MOD|DIV|SPACE|ABAP_TRUE|ABAP_FALSE|LINES)$/i;

/** One identifier of a condition is a raw dictionary field — see the file comment. Returns the field's dictionary name. */
function rawField(identifier: string, r: BranchReading): string | null {
  const id = identifier.toLowerCase().replace(/[<>]/g, '').replace(/\[\]$/, '');
  if (!IDENTIFIER.test(identifier) || KEYWORDS.test(id) || /^sy-/.test(id)) return null;
  if (r.ctx.constants.has(id) || r.ctx.selections.has(id)) return null;
  const parts = id.split(/->|=>|-|~/).filter(Boolean);
  const field = parts[parts.length - 1];
  if (FIELD_TERMS_EN[field]) return null;
  const typed = r.dictionaryTyped.get(field);
  if (typed) {
    const dictField = typed.split('-').pop() as string;
    return FIELD_TERMS_EN[dictField] ? null : dictField;
  }
  if (parts.length > 1) {
    const ownerType = (r.ctx.types.get(parts[parts.length - 2]) ?? '').replace(/^(?:standard\s+table\s+of|table\s+of|ref\s+to)\s+/, '');
    if (ownerType && TABLE_TERMS_EN[ownerType] && !field.includes('_')) return field;
  }
  return null;
}

/**
 * The raw dictionary fields a condition tests, by their dictionary name ("mmsta", "gewei") and, where it differs,
 * by the stem of the name the code uses; empty when it tests none.
 */
export function rawFieldsOf(condition: string | null, r: BranchReading): string[] {
  if (!condition) return [];
  const out = new Set<string>();
  for (const atom of atomsOf(maskLiteralsKeep(condition))) {
    for (const token of atom.split(/\s+|(?=<>|<=|>=|=|<|>)|(?<=<>|<=|>=|=|<|>)/)) {
      const t = token.trim();
      if (!t || /^'/.test(t) || /^-?\d/.test(t)) continue;
      const raw = rawField(t, r);
      if (!raw) continue;
      out.add(raw);
      // The name as the plain wording says it: `lv_matstat` is worded "Matstat", whatever its dictionary field.
      const stem = t.toLowerCase().replace(/[<>]/g, '').split(/->|=>|-|~/).pop()?.replace(/^(?:[glcp][vstd]|l[sto]|i[stv]|e[sv]|c[sv]|wa|fs|ls|lt|gs|gt)_/, '');
      if (stem && stem !== raw) out.add(stem);
    }
  }
  return [...out];
}

/** Literals masked to `''` so their words are not read as identifiers. */
function maskLiteralsKeep(condition: string): string {
  return condition.replace(/'(?:[^']|'')*'/g, "''");
}

/** "INPUT_REJECTED" → "input rejected", "DEPT_HEAD" → "dept head": a code value said as its words. */
export function plainValues(text: string): string {
  return text.replace(/(?<![\w-])([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?![\w-])/g, (m) => m.toLowerCase().replace(/_/g, ' '));
}
