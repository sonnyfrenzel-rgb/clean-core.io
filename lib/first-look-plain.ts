/**
 * The Business opening in plain business words — roadmap 3.0.20, owner report
 * 21.10.2026 on a goods-receipt / invoice check: *"ich verstehe überhaupt nicht
 * als business anwender was dieser code hier macht"*. The panel said a
 * read-only report "reads no table by name", opened its process on the
 * program's own demo cases, listed "Checks: Call failed or no day · Code given
 * · … and 23 more", led "What it decides" with "Only maximum scaled
 * 1000000000000 is processed" and said it changes by "Update the docline in
 * the list".
 *
 * What this module reads, each piece anchored to its lines and engine-written:
 *
 *   - **checks** — a decision point is *technical* when every part of its
 *     condition is: a return code or system field, "is filled / found",
 *     a yes/no flag or run option, the demo flag or case, a number of
 *     decimals, or a "no limit" value such as 1,000,000,000. Technical checks
 *     are counted, never listed; the rest stay in the code's plain words;
 *   - **stops** — where a step can end the run, said with the program's own
 *     message where it has one ("no purchase order found for the invoice")
 *     instead of the condition; a stop without a message under a technical
 *     condition is counted with the technical checks;
 *   - **the test data switch** — the step that runs the program's own demo
 *     cases (`lib/abap/demo-switches.ts`) is not a step of the business
 *     process and is said apart;
 *   - **changes to the result list** — "Update the docline in the list" says
 *     which values the program marks each line with.
 *
 * Pure and deterministic; no model. Presentation only: nothing here is stored
 * or signed. It applies from engine 3.0.20 (`ENGINE_READS_3020_FROM`), the
 * same gate as the demo switches it reads.
 */
import { readStatements, type AbapStatement } from './abap/statement-reader';
import { readBlocks, type BlockStructure } from './abap/block-structure';
import { conditionToQuestion, humaniseField, plainContext, type PlainContext } from './abap/plain-language';
import { isDemoSubject, type DemoSwitches } from './abap/demo-switches';
import { isKnownField, tableTerm } from './abap/business-glossary';
import type { RuleExplanation, RuleSetExplanation } from './abap/business-rule-set-explain';
import { engineReads3021Apply } from './abap/engine-reads-3021-gate';
import { APP_VERSION } from './version';

export interface FirstLookReading {
  ctx: PlainContext;
  statements: AbapStatement[];
  structure: BlockStructure;
  demo: DemoSwitches | null;
}

export function firstLookReadingOf(source: string, demo: DemoSwitches | null): FirstLookReading {
  const statements = readStatements(source);
  return { ctx: plainContext(source), statements, structure: readBlocks(statements), demo };
}

const statementAt = (r: FirstLookReading, line: number): number =>
  r.statements.findIndex((s) => s.lineStart <= line && s.lineEnd >= line);

/** A value no business would choose as a limit: 999999, 1000000000 — "no limit" written as a number. */
export function isSentinelValue(value: string): boolean {
  const v = value.replace(/^'|'$/g, '').trim();
  return /^9{6,}$/.test(v) || /^10{6,}$/.test(v);
}

const SYSTEM_FIELD = /\bsy-[a-z]+\b/i;
const FILLED = /\bIS\s+(?:NOT\s+)?(?:INITIAL|BOUND|ASSIGNED|SUPPLIED)\b/i;
const TRUTH = /^(?:abap_true|abap_false|space|'X'|' '|'')$/i;
const DECIMALS = /(?:^|[_-])(?:dec|decs|decimals?|digits)$/i;

/** The parts of a condition joined by AND / OR, without NOT and brackets. */
function atomsOf(condition: string): string[] {
  return condition
    .replace(/'(?:[^']|'')*'/g, (m) => m.replace(/\s+(AND|OR)\s+/gi, ' _$1_ '))
    // `lines( gt_x ) = 0` — how many rows a table holds: one operand, kept whole.
    .replace(/\blines\s*\(\s*([\w/<>-]+)\s*\)/gi, 'LINES_OF_$1')
    .split(/\s+(?:AND|OR)\s+/i)
    .map((a) => a.replace(/[()]/g, ' ').replace(/^\s*NOT\s+/i, '').trim())
    .filter(Boolean);
}

/** The operand on the left and the value on the right of one comparison, if it is one. */
function comparisonOf(atom: string): { left: string; right: string } | null {
  const m = /^([\w/<>~-]+(?:\[\])?)\s*(?:=|<>|><|<=|>=|=<|=>|<|>|EQ|NE|LT|GT|LE|GE)\s*(\S+)$/i.exec(atom.trim());
  return m ? { left: m[1], right: m[2] } : null;
}

/** A component of a structure the SAP dictionary knows — `ls_eban-frgkz`: a business field, whatever it is tested for. */
function businessField(operand: string, r: FirstLookReading): boolean {
  const parts = operand.toLowerCase().split(/-/);
  if (parts.length < 2) return false;
  if (isKnownField(parts[parts.length - 1])) return true;
  // A row of an SAP table the glossary knows — `gs_eban TYPE eban`: its fields are the business's.
  const type = r.ctx.types.get(parts[0])?.replace(/^(?:standard\s+table\s+of|table\s+of|ref\s+to)\s+/, '');
  return !!type && tableTerm(type) !== null;
}

/** The answer of a permission check: `sy-subrc` read right after `AUTHORITY-CHECK`. */
function afterAuthority(r: FirstLookReading, at: number): boolean {
  for (let j = at - 1; j >= 0 && j >= at - 4; j -= 1) if (/^AUTHORITY-CHECK\b/i.test(r.statements[j].text)) return true;
  return false;
}

/** One part of a condition a business reader need not decide on; `at` is the condition's statement. */
function technicalAtom(atom: string, r: FirstLookReading, at: number): boolean {
  const c = comparisonOf(atom);
  const operand = (c?.left ?? atom.split(/\s+/)[0]).replace(/\[\]$/, '');
  if (SYSTEM_FIELD.test(atom)) return !afterAuthority(r, at);
  if (/^LINES_OF_/.test(atom)) return true;
  if (FILLED.test(atom)) return !businessField(operand, r);
  if (isDemoSubject(r.demo, operand)) return true;
  if (DECIMALS.test(operand.split(/-/).pop() ?? operand)) return true;
  if (!c) return false;
  if (TRUTH.test(c.right)) return !businessField(operand, r);
  const right = c.right.toLowerCase();
  const constant = r.ctx.constants.get(right);
  if (isSentinelValue(constant ?? c.right)) return true;
  return false;
}

const conditionText = (s: AbapStatement): string => s.text.replace(/\.\s*$/, '').replace(/^(?:IF|ELSEIF|CHECK|WHILE)\s+/i, '').trim();

/** The conditions of an `IF` and its `ELSEIF` arms, with their statements; just the one for `CHECK` / `WHILE`. */
function armConditionsAt(r: FirstLookReading, at: number): AbapStatement[] {
  const s = r.statements[at];
  if (s.keyword.toUpperCase() !== 'IF') return [s];
  const block = r.structure.blocks.find((b) => b.openIndex === at && b.kind === 'if');
  if (!block) return [s];
  const out = [s];
  for (let j = at + 1; j < block.closeIndex; j += 1) {
    const around = r.structure.enclosing[j] ?? [];
    if (around[around.length - 1] === block && r.statements[j].keyword.toUpperCase() === 'ELSEIF') out.push(r.statements[j]);
  }
  return out;
}

/** `IF lv_diff < 0. lv_diff = - lv_diff. ENDIF.` — arithmetic (an absolute value), not a decision. */
function signFlipAt(r: FirstLookReading, at: number): boolean {
  const block = r.structure.blocks.find((b) => b.openIndex === at && b.kind === 'if');
  if (!block || block.closeIndex !== at + 2) return false;
  const m = /^([\w/<>-]+)\s*=\s*(?:-\s*([\w/<>-]+)|abs\s*\(\s*([\w/<>-]+)\s*\))$/i.exec(r.statements[at + 1].text.replace(/\.\s*$/, '').trim());
  return !!m && (m[2] ?? m[3])?.toLowerCase() === m[1].toLowerCase();
}

/** Whether the condition of the decision point on `line` is a technical check (see the file comment). Every arm counts. */
export function technicalCheckAt(r: FirstLookReading, line: number): boolean {
  const at = statementAt(r, line);
  if (at < 0) return false;
  const s = r.statements[at];
  const keyword = s.keyword.toUpperCase();
  if (keyword === 'CASE') return isDemoSubject(r.demo, s.text.replace(/\.\s*$/, '').replace(/^CASE\s+/i, '').trim());
  if (!/^(?:IF|ELSEIF|CHECK|WHILE)$/.test(keyword)) return false;
  if (signFlipAt(r, at)) return true;
  return armConditionsAt(r, at).every((arm) => {
    const atoms = atomsOf(conditionText(arm));
    return atoms.length > 0 && atoms.every((a) => technicalAtom(a, r, r.statements.indexOf(arm)));
  });
}

/**
 * A chain of `IF … ELSEIF` the plain wording can only call "Which case
 * applies": its business arms in words — "Diff above limit, or invoice
 * amount above purchase order amount". Null when no arm can be said.
 */
export function chainWordsAt(r: FirstLookReading, line: number): string | null {
  const at = statementAt(r, line);
  if (at < 0 || r.statements[at].keyword.toUpperCase() !== 'IF') return null;
  const arms = armConditionsAt(r, at);
  if (arms.length < 2) return null;
  const said = arms
    .filter((arm) => !atomsOf(conditionText(arm)).every((a) => technicalAtom(a, r, r.statements.indexOf(arm))))
    .map((arm) => {
      // A constant is said by its value, as the code's reader sees it: `gc_status_rejected` → 'INPUT_REJECTED'.
      const condition = conditionText(arm).replace(/(?<![\w-])([a-z_][\w]*)(?![\w-])/gi, (m) => {
        const value = r.ctx.constants.get(m.toLowerCase());
        return value !== undefined && !/^\d+$/.test(value) ? `'${value}'` : m;
      });
      return conditionToQuestion(condition, r.ctx, arm.lineStart).question.replace(/\?\s*$/, '');
    })
    .filter((t): t is string => !!t && !/\b(?:sy-\w+|abap_true|abap_false|[gl][vst]_\w+)\b/i.test(t));
  if (said.length === 0) return null;
  const shown = said.slice(0, 2).map((t, i) => (i === 0 ? t : lcFirst(t)));
  return `${shown.join(', or ')}${said.length > 2 ? `, or ${said.length - 2} more` : ''}`;
}

/** The innermost IF / ELSEIF / CASE arm around statement `index`, by its header statement. */
function armHeaderAround(r: FirstLookReading, index: number): number | null {
  const blocks = (r.structure.enclosing[index] ?? []).filter((b) => b.kind === 'if' || b.kind === 'case');
  const block = blocks[blocks.length - 1];
  if (!block) return null;
  let header = block.openIndex;
  for (let j = block.openIndex + 1; j < index; j += 1) {
    const around = r.structure.enclosing[j] ?? [];
    if (around[around.length - 1] !== block) continue;
    if (/^(?:ELSEIF|ELSE|WHEN)$/i.test(r.statements[j].keyword)) header = j;
  }
  return header;
}

/** The program's own message text in the arm a stop stands in, or null. */
function messageOfArm(r: FirstLookReading, index: number): string | null {
  const header = armHeaderAround(r, index);
  const from = header ?? Math.max(0, index - 3);
  for (let j = index; j > from; j -= 1) {
    const m = /^MESSAGE\s+'((?:[^']|'')+)'/i.exec(r.statements[j].text);
    if (m) return m[1].replace(/''/g, "'").trim();
    if (/^(?:IF|ELSEIF|ELSE|WHEN|ENDIF|ENDCASE)$/i.test(r.statements[j].keyword)) break;
  }
  for (let j = index + 1; j < Math.min(r.statements.length, index + 3); j += 1) {
    const m = /^MESSAGE\s+'((?:[^']|'')+)'/i.exec(r.statements[j].text);
    if (m) return m[1].replace(/''/g, "'").trim();
    if (/^(?:ENDIF|ELSEIF|ELSE|WHEN|ENDCASE)$/i.test(r.statements[j].keyword)) break;
  }
  return null;
}

const MAX_STOP = 90;
const MISSING = /\b(?:no|not|none|missing)\b[\s\S]*\b(?:found|complete|exists?|available|maintained|known)\b|\bnot\s+(?:found|complete|available|maintained)\b|\bdoes not exist\b/i;
const lcFirst = (text: string): string => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

/**
 * A place where a step can end the run, in plain words: the program's own
 * message where it has one, and whether it is technical — a stop without a
 * message under a technical condition.
 */
export function stopReading(r: FirstLookReading, line: number, label: string): { text: string; technical: boolean } {
  const at = statementAt(r, line);
  if (at < 0) return { text: label, technical: false };
  const message = messageOfArm(r, at);
  const header = armHeaderAround(r, at);
  const technical = header !== null && technicalCheckAt(r, r.statements[header].lineStart);
  // Under a technical condition only a message that says data is missing is the business's
  // ("no purchase order found"); "Enter a document", "Decimals must be …" are input checks.
  const tellsMissing = !!message && MISSING.test(message);
  if (message && (!technical || tellsMissing) && !demoArm(r, header)) {
    const text = lcFirst(message.replace(/[.!]+$/, ''));
    return { text: text.length > MAX_STOP ? `${text.slice(0, MAX_STOP - 1).trimEnd()}…` : text, technical: false };
  }
  // A message by number is already said by its text in the label: "no purchase requisition found (E001)".
  return { text: label, technical: technical && !MISSING.test(label) };
}

/** An arm whose condition tests the demo flag or a demo case only. */
function demoArm(r: FirstLookReading, header: number | null): boolean {
  if (header === null) return false;
  const text = r.statements[header].text.replace(/^(?:IF|ELSEIF|CHECK)\s+/i, '').replace(/\.\s*$/, '');
  const atoms = atomsOf(text);
  return atoms.length > 0 && atoms.every((a) => isDemoSubject(r.demo, (comparisonOf(a)?.left ?? a.split(/\s+/)[0])));
}

/** The routine a step performs, when its line is a `PERFORM`. */
export function performedAt(r: FirstLookReading, line: number): string | null {
  const at = statementAt(r, line);
  const m = at >= 0 ? /^PERFORM\s+([\w/]+)/i.exec(r.statements[at].text) : null;
  return m ? m[1].toUpperCase() : null;
}

/** Whether the step on `line` runs the program's own demo cases (`DemoSwitches.routines`, `cases`). */
export function testDataStepAt(r: FirstLookReading, line: number): boolean {
  if (!r.demo) return false;
  const routine = performedAt(r, line);
  if (!routine) return false;
  return r.demo.routines.includes(routine) || r.demo.cases.some((c) => c.routine === routine);
}

/* --------------------------------------------------- changes to the result list */

/** "INPUT_REJECTED" → "input rejected", "BLOCKED_FOR_PAYMENT" → "blocked for payment". */
function valueWords(value: string): string {
  const v = value.replace(/^'|'$/g, '').trim();
  if (/^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(v) || /^[A-Z]{4,}$/.test(v)) return v.toLowerCase().replace(/_/g, ' ');
  return v;
}

const WORDS: Record<string, string> = { doc: 'document', docline: 'document line', doclines: 'document lines', pos: 'item', itm: 'item', inv: 'invoice', po: 'purchase order' };

/** A work area or table name as a business reader says it: `gs_docline` → "document line". */
function rowWords(name: string, ctx: PlainContext): string {
  const stem = name.toLowerCase().replace(/^(?:gs|ls|wa|gw|lw|gt|lt|it)_/, '').replace(/^<|>$/g, '').replace(/^fs_/, '');
  if (WORDS[stem]) return WORDS[stem];
  const said = lcFirst(humaniseField(name, ctx) || stem.replace(/_/g, ' '));
  return said.replace(/^the\s+/i, '');
}

/**
 * What "Update the … in the list" does, in business words: the fields the
 * program sets on the row before it writes the row back, with the values the
 * code gives them — "Marks each document line of the result list with a
 * status — input rejected, blocked for payment or matched — and a code".
 * Null when the row gets no named value before the write.
 */
export function listChangeAt(r: FirstLookReading, line: number): string | null {
  const at = statementAt(r, line);
  if (at < 0) return null;
  const m = /^MODIFY\s+([\w/<>-]+)\s+FROM\s+([\w/<>-]+)/i.exec(r.statements[at].text);
  if (!m) return null;
  const area = m[2].toLowerCase();
  // The loop the write stands in: every assignment to the row inside it counts.
  const loop = [...(r.structure.enclosing[at] ?? [])].reverse().find((b) => b.kind === 'loop');
  const from = loop ? loop.openIndex : Math.max(0, at - 20);
  const to = loop ? loop.closeIndex : at;
  const fields = new Map<string, string[]>();
  for (let j = from; j < to; j += 1) {
    const a = new RegExp(`^${area.replace(/[<>]/g, '\\$&')}-([\\w]+)\\s*=\\s*(\\S+)$`, 'i').exec(r.statements[j].text.replace(/\.\s*$/, '').trim());
    if (!a) continue;
    const raw = a[2];
    const value = r.ctx.constants.get(raw.toLowerCase()) ?? (/^'.*'$/.test(raw) ? raw.slice(1, -1) : null);
    if (value === null || value === '') continue;
    const list = fields.get(a[1].toLowerCase()) ?? [];
    if (!list.includes(value)) list.push(value);
    fields.set(a[1].toLowerCase(), list);
  }
  if (fields.size === 0) return null;
  const row = rowWords(m[2], r.ctx);
  // The field with words as values first ("status"), codes after ("code").
  const ordered = [...fields.entries()].sort((x, y) => Number(/^[A-Z]\d+$/.test(x[1][0])) - Number(/^[A-Z]\d+$/.test(y[1][0])));
  const parts = ordered.slice(0, 2).map(([field, values]) => {
    const name = lcFirst(humaniseField(field, r.ctx) || field).replace(/^the\s+/i, '');
    const shown = values.slice(0, 3).map(valueWords);
    const more = values.length > 3 ? ` and ${values.length - 3} more` : '';
    return `a ${name} (${joinOr(shown)}${more})`;
  });
  return `Marks each ${row} of the result list with ${parts.join(' and ')}`;
}

/* ------------------------------------------------------------ what it decides */

export interface OpeningDecisions {
  /** The weightiest business rules, weightiest topic first — what each does to a case, in words. */
  rules: Array<{ id: string; text: string; anchor: string | null }>;
  /** Business rules not shown here (the rules card lists them). */
  more: number;
  /** Technical settings — caps, decimals, system fields, demo data — counted, never listed here. */
  technical: number;
}

/**
 * "What it decides" from the rule explanations (`explainBusinessRules`):
 * the business rules in their reading order (topics by their weightiest rule),
 * each said by what it does to a case ("Leaves out entries where … kind REV
 * …"); a rule that decides nothing as written is not shown, and technical
 * settings are only counted.
 *
 * From engine 3.0.21 (`ENGINE_READS_3021_FROM`; owner decision 22.10.2026) it
 * reads the rule's basket — the classification the basket line below it counts
 * (`RuleBasketLine`, `explanation.baskets`): a rule of the technical basket (a
 * marker the program sets itself, a plausibility check of the input …) is
 * counted as technical, not listed as a business decision, and a rule whose
 * basket is not determined is neither. Before, it read the rule's topic, which
 * calls only the technical-settings topic technical: the delivery priority's
 * one rule — a class the program sets itself and checks back — stood under
 * "What it decides" while the basket line said "0 questions for the business ·
 * 1 technical rule".
 */
export function openingDecisions(
  explanation: RuleSetExplanation,
  max = 4,
  /** The engine the panel is read for (`ENGINE_READS_3021_FROM`). */
  engineVersion: string | null = APP_VERSION,
): OpeningDecisions {
  const byId = new Map(explanation.rules.map((r) => [r.id, r]));
  const ordered = explanation.order.map((id) => byId.get(id)).filter((r): r is RuleExplanation => !!r);
  const byBasket = engineReads3021Apply(engineVersion);
  const technical = ordered.filter((r) => (byBasket ? r.basket.kind === 'technical' : r.topic === 'technical')).length;
  const business = ordered.filter((r) => (byBasket ? r.basket.kind === 'business' : r.topic !== 'technical'));
  const deciding = business.filter((r) => r.impact.score > 0);
  const rules = deciding.slice(0, max).map((r) => {
    const clause = r.protects.text.split(/:\s/)[0].replace(/[.;]\s*$/, '').replace(/^It\s+/, '');
    const anchor = r.protects.anchors[0] ?? null;
    return {
      id: r.id,
      text: clause.charAt(0).toUpperCase() + clause.slice(1),
      anchor: anchor ? (anchor.lineEnd > anchor.lineStart ? `L${anchor.lineStart}-${anchor.lineEnd}` : `L${anchor.lineStart}`) : null,
    };
  });
  return { rules, more: business.length - rules.length, technical };
}

function joinOr(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}
