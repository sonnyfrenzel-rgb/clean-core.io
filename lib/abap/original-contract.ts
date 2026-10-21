import { readStatements, type AbapStatement } from './statement-reader';
import { formalParameterNames } from './call-graph';

/**
 * The original's contract as its source states it — the checks that refuse,
 * stop or skip, the packed decimals it declares and its selection inputs: the
 * facts the code draft must keep (roadmap 3.0.12; CO/FI/PP/SD reviews).
 *
 * The CO review of v3.0.10 found the generated code had dropped the original's
 * policy guards (a sender as its own receiver, quotas over 100 %, no
 * receivers). The engine's business rules (`business-rule-set.ts`) only hold
 * conditions on a value written in the code, so `IF gt_rcv IS INITIAL` or
 * `IF ls_rcv-kostl = p_sender` are not rules there — yet both refuse the input.
 * `readGuards` lists every IF/ELSEIF whose own branch ends the flow (an error
 * message, RETURN, EXIT, CONTINUE, LEAVE, STOP, RAISE) and every CHECK, by line.
 *
 * The external CO and PP reviews found generated code that computed packed
 * decimals in binary floating point (a status changed at 0.3 kg), cut a ratio
 * of six places to two, and accepted values the original's type could never
 * hold. The type is in the source: `TYPE p LENGTH 8 DECIMALS 3` says 15 digits,
 * 3 of them after the point, so the largest value is 999999999999.999. This
 * reader writes that down per field, and lists the selection inputs, so the
 * prompt can say "this field, these places, this bound" instead of "be precise".
 *
 * Only what the source itself declares: a field typed by a DDIC element
 * (`TYPE wrbtr`) has places the source does not hold, and is not guessed.
 * Pure: no catalogue, no model.
 */

export interface DeclaredDecimal {
  /** The field or component as the source writes it. */
  name: string;
  line: number;
  /** Bytes: `LENGTH 8`, or `(8)` in the old form; 8 when the source gives none. */
  length: number;
  /** Places after the point; 0 for a packed integer. */
  decimals: number;
  /** Total digits a packed number of this length holds: 2 × length − 1. */
  digits: number;
  /** The largest value the type holds, as a decimal string (the smallest is its negative). */
  max: string;
  /**
   * Set when the field is typed through a local type or another field of this
   * source (`qty TYPE ty_qty`, `lv_b LIKE lv_a`): the name it was resolved
   * through. Absent for a field that says `TYPE p` itself.
   */
  via?: string;
}

export type SelectionInputKind = 'parameter' | 'select-option';

export interface SelectionInput {
  name: string;
  line: number;
  kind: SelectionInputKind;
  /** `TYPE x`, `LIKE x` or `FOR x` as written; null when the source names none. */
  type: string | null;
  obligatory: boolean;
  /** `AS CHECKBOX` or `RADIOBUTTON GROUP g` — a switch rather than a value. */
  flag: 'checkbox' | 'radiobutton' | null;
  /** `DEFAULT v` as written. */
  defaultValue: string | null;
  /** `NO INTERVALS` / `NO-EXTENSION` on a select-option. */
  restrictions: string[];
}

export type GuardEffect = 'error-message' | 'return' | 'exit' | 'continue' | 'check' | 'leave' | 'stop' | 'raise';

export interface Guard {
  /** Line of the IF, ELSEIF or CHECK. */
  line: number;
  /** The condition as written, whitespace collapsed. */
  condition: string;
  effect: GuardEffect;
  /** The statement that ends the flow, as written (`MESSAGE e004(zco)`), cut short. */
  ending: string;
  /** Line of that statement. */
  endingLine: number;
}

export interface OriginalContract {
  guards: Guard[];
  decimals: DeclaredDecimal[];
  inputs: SelectionInput[];
}

const DECLARING = /^(?:DATA|TYPES|STATICS|CLASS-DATA|CONSTANTS|PARAMETERS)\s*:?\s*([\w/]+(?:-[\w/]+)*)(?:\((\d+)\))?\s+TYPE\s+p\b(.*)$/i;

/** The largest value of a packed number with `digits` digits, `decimals` of them after the point. */
export function packedMax(digits: number, decimals: number): string {
  const whole = Math.max(0, digits - decimals);
  const intPart = whole > 0 ? '9'.repeat(whole) : '0';
  return decimals > 0 ? `${intPart}.${'9'.repeat(decimals)}` : intPart;
}

function decimalOf(statement: AbapStatement): DeclaredDecimal | null {
  const m = DECLARING.exec(statement.text.replace(/\.$/, ''));
  if (!m) return null;
  const tail = m[3];
  const lengthWord = /\bLENGTH\s+(\d+)\b/i.exec(tail);
  const decimalsWord = /\bDECIMALS\s+(\d+)\b/i.exec(tail);
  const length = Number(lengthWord?.[1] ?? m[2] ?? 8);
  // ABAP: a packed number is 1..16 bytes; anything else is not a declaration this reader understands.
  if (!Number.isInteger(length) || length < 1 || length > 16) return null;
  const digits = 2 * length - 1;
  const decimals = Math.min(Number(decimalsWord?.[1] ?? 0), digits);
  return { name: m[1], line: statement.lineStart, length, decimals, digits, max: packedMax(digits, decimals) };
}

/**
 * A field typed through a packed type this source declares before it:
 * `TYPES ty_qty TYPE p LENGTH 8 DECIMALS 3.` and then `qty TYPE ty_qty` (also
 * inside BEGIN OF … END OF, which the statement reader hands over chain-expanded),
 * an alias of an alias (`TYPES ty_b TYPE ty_a.`), or `LIKE` a field whose type
 * is known. A DDIC type (`TYPE wrbtr`, `menge_d`) is not in `known` and stays
 * unguessed; a table of a packed type is a table, not a field.
 */
const ALIASING = /^(?:DATA|TYPES|STATICS|CLASS-DATA|CONSTANTS|PARAMETERS)\s*:?\s*([\w/]+(?:-[\w/]+)*)\s+(TYPE|LIKE)\s+([\w/]+(?:-[\w/]+)*)(?:\s+(?:VALUE|READ-ONLY|OBLIGATORY|DEFAULT)\b.*)?$/i;

/** The name any declaration introduces, whatever its type — for shadowing a global inside a procedure. */
const DECLARED_NAME = /^(?:DATA|TYPES|STATICS|CONSTANTS)\s*:?\s*(?!(?:BEGIN|END)\s+OF\b)([\w/]+(?:-[\w/]+)*)\b/i;

const PROCEDURE_OPENS =new Set(['METHOD', 'FORM', 'FUNCTION', 'MODULE']);
const PROCEDURE_CLOSES = new Set(['ENDMETHOD', 'ENDFORM', 'ENDFUNCTION', 'ENDMODULE']);

function aliasOf(statement: AbapStatement, known: { get(name: string): DeclaredDecimal | undefined }): DeclaredDecimal | null {
  const m = ALIASING.exec(statement.text.replace(/\.$/, ''));
  if (!m) return null;
  const target = known.get(m[3].toLowerCase());
  if (!target) return null;
  return {
    name: m[1],
    line: statement.lineStart,
    length: target.length,
    decimals: target.decimals,
    digits: target.digits,
    max: target.max,
    via: target.via ?? target.name,
  };
}

function inputOf(statement: AbapStatement): SelectionInput | null {
  const m = /^(PARAMETERS|PARAMETER|SELECT-OPTIONS)\s*:?\s*([\w/]+)(.*)$/i.exec(statement.text.replace(/\.$/, ''));
  if (!m) return null;
  const tail = m[3];
  const kind: SelectionInputKind = /^SELECT-OPTIONS$/i.test(m[1]) ? 'select-option' : 'parameter';
  const typed = kind === 'select-option'
    ? /\bFOR\s+([\w/@-]+)/i.exec(tail)
    : /\b(?:TYPE|LIKE)\s+((?:[\w/]+)(?:-[\w/]+)*)/i.exec(tail);
  const deflt = /\bDEFAULT\s+('(?:[^']|'')*'|[\w/-]+)/i.exec(tail);
  const restrictions: string[] = [];
  if (/\bNO\s+INTERVALS\b/i.test(tail)) restrictions.push('NO INTERVALS');
  if (/\bNO-EXTENSION\b/i.test(tail)) restrictions.push('NO-EXTENSION');
  return {
    name: m[2],
    line: statement.lineStart,
    kind,
    type: typed ? typed[1] : null,
    obligatory: /\bOBLIGATORY\b/i.test(tail),
    flag: /\bAS\s+CHECKBOX\b/i.test(tail) ? 'checkbox' : /\bRADIOBUTTON\s+GROUP\b/i.test(tail) ? 'radiobutton' : null,
    defaultValue: deflt ? deflt[1] : null,
    restrictions,
  };
}

const OPENS = new Set(['IF', 'CASE', 'LOOP', 'DO', 'WHILE', 'TRY', 'PROVIDE']);
const CLOSES = new Set(['ENDIF', 'ENDCASE', 'ENDLOOP', 'ENDDO', 'ENDWHILE', 'ENDTRY', 'ENDPROVIDE']);

/** Does this statement end the flow, and how? Messages of type S, I and W do not. */
function endingOf(statement: AbapStatement): GuardEffect | null {
  const text = statement.text;
  switch (statement.keyword) {
    case 'MESSAGE':
      return /^MESSAGE\s+[EAX]\d/i.test(text) || /\bTYPE\s+'[EAX]'/i.test(text) ? 'error-message' : null;
    case 'RETURN': return 'return';
    case 'EXIT': return 'exit';
    case 'CONTINUE': return 'continue';
    case 'STOP': return 'stop';
    case 'LEAVE': return /^LEAVE\s+(?:PROGRAM|TO\s+(?:SCREEN|TRANSACTION|LIST-PROCESSING))/i.test(text) || /^LEAVE\s*\.?$/i.test(text) ? 'leave' : null;
    case 'RAISE': return /^RAISE\s+EVENT\b/i.test(text) ? null : 'raise';
    default: return null;
  }
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Every check of the source that refuses, stops or skips: an IF/ELSEIF whose own
 * branch (not a nested one) holds a flow-ending statement, and every CHECK. In
 * source order. An ELSE branch is not listed: its condition is the negation of
 * the chain, which the source does not write.
 */
export function readGuardsFrom(statements: readonly AbapStatement[]): Guard[] {
  const guards: Guard[] = [];
  for (let i = 0; i < statements.length; i++) {
    const s = statements[i];
    if (s.nativeSql) continue;
    if (s.keyword === 'CHECK') {
      const condition = s.text.replace(/^CHECK\s+/i, '').replace(/\.$/, '');
      guards.push({ line: s.lineStart, condition: cut(condition, 160), effect: 'check', ending: cut(s.text, 80), endingLine: s.lineStart });
      continue;
    }
    if (s.keyword !== 'IF' && s.keyword !== 'ELSEIF') continue;
    let depth = 0;
    for (let j = i + 1; j < statements.length; j++) {
      const t = statements[j];
      const kw = t.keyword;
      if (depth === 0 && (kw === 'ELSE' || kw === 'ELSEIF' || kw === 'ENDIF')) break;
      if (OPENS.has(kw)) { depth++; continue; }
      if (CLOSES.has(kw)) { depth--; if (depth < 0) break; continue; }
      if (depth !== 0) continue;
      const effect = endingOf(t);
      if (!effect) continue;
      const condition = s.text.replace(/^(?:ELSE)?IF\s+/i, '').replace(/\.$/, '');
      guards.push({ line: s.lineStart, condition: cut(condition, 160), effect, ending: cut(t.text.replace(/\.$/, ''), 80), endingLine: t.lineStart });
      break;
    }
  }
  return guards;
}

/**
 * The lines inside a procedure — a FORM, METHOD, FUNCTION or MODULE, from its opening statement to its end. A
 * `CHECK` there that stands outside any loop leaves the procedure when its condition does not hold, and the
 * caller goes on; only a `CHECK` at event level ends its event block (roadmap 3.0.17 criterion 3: FORM
 * RATE_DEVIATION's `CHECK cs_result-status IS INITIAL` was carried as a refusal of the whole input).
 */
export function procedureLines(statements: readonly AbapStatement[]): Set<number> {
  const out = new Set<number>();
  let open: number | null = null;
  for (const st of statements) {
    if (PROCEDURE_OPENS.has(st.keyword)) open = st.lineStart;
    if (open !== null) for (let l = st.lineStart; l <= st.lineEnd; l++) out.add(l);
    if (PROCEDURE_CLOSES.has(st.keyword)) open = null;
  }
  return out;
}

/** The checks, the packed decimals and the selection inputs the source states, each in source order. */
export function readOriginalContract(source: string): OriginalContract {
  const statements = readStatements(source);
  const decimals: DeclaredDecimal[] = [];
  const inputs: SelectionInput[] = [];
  // Packed types and fields declared so far, by name: what a later `TYPE x` /
  // `LIKE x` resolves through. A declaration inside a METHOD, FORM, FUNCTION or
  // MODULE is local to it: it shadows a global of the same name there and is
  // gone once the procedure ends, so a later procedure resolves the name
  // against the global again (QA c38f8043).
  //
  // A local declaration of any other type shadows the global too: its name is
  // held with `null`, so a `LIKE` of it in the procedure stops there instead
  // of falling through to a packed global of the same name (QA 5a559787).
  const global = new Map<string, DeclaredDecimal>();
  let local: Map<string, DeclaredDecimal | null> | null = null;
  const known = {
    get: (name: string) => {
      if (local?.has(name)) return local.get(name) ?? undefined;
      return global.get(name);
    },
  };
  //
  // The formal parameters of a FORM, and of a method as its METHODS
  // declaration names them, shadow a global of the same name in the procedure
  // the same way. A method name declared in two
  // classes shadows the parameters of both: which class a METHOD belongs to
  // is not read here.
  const methodParameters = new Map<string, string[]>();
  for (const statement of statements) {
    const name = /^(?:CLASS-)?METHODS\s*:?\s*([\w/]+)/i.exec(statement.text)?.[1]?.toLowerCase();
    if (name) methodParameters.set(name, [...(methodParameters.get(name) ?? []), ...formalParameterNames(statement)]);
  }
  for (const statement of statements) {
    if (statement.nativeSql) continue;
    if (PROCEDURE_OPENS.has(statement.keyword)) {
      local = new Map();
      const method = statement.keyword === 'METHOD' ? /^METHOD\s+(?:[\w/]+~)?([\w/]+)/i.exec(statement.text)?.[1]?.toLowerCase() : undefined;
      const parameters = statement.keyword === 'FORM' ? formalParameterNames(statement) : method ? methodParameters.get(method) ?? [] : [];
      for (const p of parameters) local.set(p.toLowerCase(), null);
    } else if (PROCEDURE_CLOSES.has(statement.keyword)) local = null;
    const d = decimalOf(statement) ?? aliasOf(statement, known);
    if (d) {
      decimals.push(d);
      (local ?? global).set(d.name.toLowerCase(), d);
    } else if (local) {
      const declared = DECLARED_NAME.exec(statement.text);
      if (declared) local.set(declared[1].toLowerCase(), null);
    }
    const i = inputOf(statement);
    if (i) inputs.push(i);
  }
  return { guards: readGuardsFrom(statements), decimals, inputs };
}
