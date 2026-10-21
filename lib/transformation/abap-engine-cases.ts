/**
 * The engine cases as executable ABAP Unit (roadmap 3.0.14 item 7, owner 15.10.2026).
 *
 * The first SAP activation of an engine-led RAP package (SD example, BTP ABAP trial, 15.10.2026) ran 77 ABAP Unit
 * methods: 37 green, 0 red, 40 skipped — every TC_ENG_* case was written as its specification in comments and then
 * skipped itself. This module writes the given/when/then of each case as ABAP against the logic class and the
 * access double, from the case's machine form (`EngineCaseCall`, `lib/engine-call-contract.ts`) — the same data the
 * Node route runs through its call contract:
 *
 *   - **a guard example** (`check`: does G-0061's condition hold on this input?) creates the logic class with the
 *     access double, puts the case's input where the original's condition reads it — an attribute of the class (a
 *     selection input, a global) or a parameter of the guard's predicate `when_g<line>` (a local, `sy-subrc`) — calls
 *     the predicate and asserts the original's answer. A precision example the original's check stops (`999.99`
 *     over a limit of 30) asks the same predicate;
 *   - **a precision example** assigns the value to a variable of the field's declared type — the class's own
 *     selection type for a selection input — and asserts the value it holds (rounded commercially), the exact
 *     decimal result of a calculation, or the overflow ABAP raises for a value the declaration cannot hold;
 *   - **an input-channel or run-identity case** (an empty request, "2026x", NaN, an invalid date, null, two runs in
 *     one millisecond) has no counterpart in the logic class: on the ABAP route the typed parameters of the service
 *     or the job convert the input before `run( )` sees it, and the class keeps no run id. It keeps a skip that says
 *     exactly that.
 *
 * An example the module cannot make executable is named in a comment with the reason (which value or input is not
 * known); a case none of whose examples is executable skips with those reasons — never a pass without a
 * comparison. Derived from the engine's cases, never a model's: deterministic. Pure: no I/O.
 */

import type { CallValue, EngineCaseCall, EngineCheckCall } from '../engine-call-contract';
import type { EngineTestCase } from '../testing-engine-cases';

/** A guard predicate of the logic class (`when_g0061`), as the RAP scaffold declares it. */
export interface AbapPredicate {
  name: string;
  /** Its IMPORTING parameters: name, phrase, and the original's operand it stands for (`ls_rcv`, `sy-subrc`, `<a row of s_x>`). */
  params: ReadonlyArray<{ name: string; phrase: string; arg: string }>;
  /** True when the engine wrote the condition; false when the predicate is a fill region (a stub until filled). */
  engineWritten: boolean;
}

/** A check of the original as the plan carries it. */
export interface AbapCaseGuard {
  id: string;
  line: number;
  rule: string | null;
  carried: boolean;
  /** `check` for a CHECK statement: it refuses when its condition fails; every other check refuses when it holds. */
  effect: string;
  outcome: 'refuses' | 'stops' | 'skips';
  subject: string | null;
  condition: string;
}

export interface AbapEngineCaseContext {
  logicClass: string;
  /** The local test double of the access layer, when the logic class takes one. */
  accessDouble: string | null;
  /** The exception a stub raises (`zcx_<name>_nofill`). */
  nofill: string;
  /** Guard id (`G-0061`) → its predicate. Only carried guards have one. */
  predicates: ReadonlyMap<string, AbapPredicate>;
  guards: readonly AbapCaseGuard[];
  /** Attributes of the logic class a case may set (selection inputs, globals), lower case → declaration phrase. */
  attributes: ReadonlyMap<string, string>;
  /** Constants of the logic class, lower case: never set by a case. */
  constants: ReadonlySet<string>;
  /** Attributes known to be elementary whatever their type's name (a PARAMETERS input: ABAP allows no other). */
  elementary: ReadonlySet<string>;
  /** The ABAP type of a declared packed field, named as the original names it (`P_DISCNT`, `QUOTA`), or null. */
  packedType(field: string): string | null;
  /** The shape of a declaration phrase: a table, a structure, an elementary value, or null when it cannot be told. */
  shapeOf(phrase: string): 'table' | 'structure' | 'elementary' | null;
  /** The phrase of a component of a structure-typed declaration, or null. */
  componentPhrase(phrase: string, component: string): string | null;
}

export interface AbapEngineCaseMethods {
  /** `METHODS tc_eng_nn FOR TESTING.` lines. */
  defs: string[];
  /** The method implementations. */
  impls: string[];
  /** Per case: executable (every example runs), partial (some do, the rest named in a comment), skipped (none does, with why). */
  tally: { executable: string[]; partial: string[]; skipped: Array<{ id: string; why: string }> };
  /** True when a method reads a private member of the logic class: the include then makes the test class a local friend. */
  friends: boolean;
}

const GENERIC = /^TYPE\s+(?:any|data|c|n|x|p|clike|csequence|numeric|simple|(?:STANDARD\s+|ANY\s+|INDEX\s+|SORTED\s+|HASHED\s+)?TABLE)$/i;
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const comment = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/"/g, "'").replace(/[–—]/g, '-');
/** A literal for a message: at most `max` characters, quotes doubled, so the statement stays far below 255 characters. */
const msg = (s: string, max = 160): string => {
  let t = comment(s);
  while (t.replace(/'/g, "''").length > max) t = t.slice(0, -1);
  return lit(t.trimEnd());
};
/** An assertion with its message on a line of its own: every line stays far below ABAP's 255 characters. */
const assertion = (head: string, text: string, indent = '    '): string[] => [`${indent}${head}`, `${indent}  msg = ${msg(text)} ).`];
/** The given part of an example, without the list of the other checks it satisfies. */
const shortInput = (input: string) => input.split(/;\s*every other guard/)[0];

/** The case kinds whose example is an input channel's or a run's, not the logic class's, with why they do not run in ABAP. */
const CHANNEL_WHY: Readonly<Record<string, string>> = {
  'contract-empty-request':
    'an empty request reaches the logic class only through the OBLIGATORY parameters of the service or the job - check it there',
  'contract-integer': "'2026x', '1.9' and NaN are refused by the typed parameter of the service or the job before run( ) sees them",
  'contract-non-finite': 'NaN, Infinity and malformed numbers are refused by the typed parameter of the service or the job before run( ) sees them',
  'contract-date': 'an invalid date is refused by the typed date parameter of the service or the job before run( ) sees it',
  'contract-null-not-zero': 'ABAP has no null: a missing value is the typed parameter of the service or the job, not the logic class',
  'run-identity': "the logic class keeps no run id: a run's identity is the job's or the business object's key",
  'guard-authority-closed':
    "AUTHORITY-CHECK is the system's on the ABAP route, not the logic class's: run the job or the service with a test user that lacks the authorization",
};

/** Does the condition hold on the subject's initial value? null when that cannot be told exactly. */
function holdsOnInitial(condition: string): boolean | null {
  const c = condition.trim();
  const initial = /^(?:<[\w/~]+>|[\w/~]+)(?:-[\w/~]+)*\s+IS\s+(NOT\s+)?INITIAL$/i.exec(c);
  if (initial) return !initial[1];
  const cmp = /^(?:<[\w/~]+>|[\w/~]+)(?:-[\w/~]+)*\s*(=|<>|\bEQ\b|\bNE\b)\s*('(?:[^']|'')*'|[-+]?\d+(?:\.\d+)?|abap_true|abap_false|space)$/i.exec(c);
  if (!cmp) return null;
  const op = cmp[1].toUpperCase();
  const raw = cmp[2];
  const blank = /^(?:abap_false|space)$/i.test(raw) || /^'\s*'$/.test(raw) || /^[-+]?0+(?:\.0+)?$/.test(raw);
  // A text literal of digits ('0') is initial for a numeric field and not for a character one: not told exactly.
  if (/^'[-+]?\d+(?:\.\d+)?'$/.test(raw)) return null;
  const equal = blank;
  return op === '=' || op === 'EQ' ? equal : !equal;
}

/** A value a guard example sets: as the engine's call contract names it, or "any filled value". */
type AbapSet = { field: string; to: CallValue | { filled: true } };

/**
 * The examples of a guard case the engine wrote no machine form for, read from the check's own condition where it
 * names one subject and one value (`CHECK gv_rejected = abap_false`, `IF lv_code IS NOT INITIAL`): the breaking
 * example makes the check reject, the passing one lets it pass. Null for any other condition (an OR, a constant).
 */
function fromCondition(c: EngineTestCase, guards: readonly AbapCaseGuard[], constants: ReadonlySet<string>): Array<{ check: EngineCheckCall; set: AbapSet[] }> | null {
  const line = c.engineCase.trace.lines[0]?.start;
  const g = guards.find((x) => x.line === line);
  if (!g) return null;
  const cond = g.condition.trim();
  const initial = /^((?:<[\w/~]+>|[\w/~]+)(?:-[\w/~]+)*)\s+IS\s+(NOT\s+)?INITIAL$/i.exec(cond);
  const cmp = /^((?:<[\w/~]+>|[\w/~]+)(?:-[\w/~]+)*)\s*(=|<>|\bEQ\b|\bNE\b)\s*('(?:[^']|'')*'|abap_true|abap_false|space)$/i.exec(cond);
  const m = initial ?? cmp;
  if (!m || constants.has(m[1].toLowerCase().split('-')[0]) || /^sy-/i.test(m[1])) return null;
  const subject = m[1].toUpperCase();
  let whenHolds: AbapSet['to'];
  let whenFails: AbapSet['to'];
  if (initial) {
    whenHolds = initial[2] ? { filled: true } : { special: 'empty' };
    whenFails = initial[2] ? { special: 'empty' } : { filled: true };
  } else {
    const raw = cmp![3];
    const value = /^abap_true$/i.test(raw) ? 'X' : /^(?:abap_false|space)$/i.test(raw) ? '' : raw.slice(1, -1).replace(/''/g, "'");
    const equal: AbapSet['to'] = value.trim() === '' ? { special: 'empty' } : { value };
    // A literal of zeros ('0', '0.00', '00000000') is the initial value of a numeric, NUMC or date field, so a
    // cleared field is not different from it there; a filled one ('1', 'X') is, whatever the type.
    const zeros = /^[-+]?0+(?:[.,]0+)?$/.test(value.trim());
    const different: AbapSet['to'] = value.trim() === '' || zeros ? { filled: true } : { special: 'empty' };
    const eq = /^(?:=|EQ)$/i.test(cmp![2]);
    whenHolds = eq ? equal : different;
    whenFails = eq ? different : equal;
  }
  const rejectsWhenHolds = g.effect !== 'check';
  const breaking = { check: { guard: g.id, holds: rejectsWhenHolds, field: subject }, set: [{ field: subject, to: rejectsWhenHolds ? whenHolds : whenFails }] };
  const passing = { check: { guard: g.id, holds: !rejectsWhenHolds, field: subject }, set: [{ field: subject, to: rejectsWhenHolds ? whenFails : whenHolds }] };
  const order = c.engineCase.kind === 'guard-breaks-one' ? [breaking] : g.outcome === 'skips' ? [passing, breaking] : [breaking, passing];
  return order.length === c.engineCase.examples.length ? order : null;
}

/** A filled value of an elementary declaration: 'X' for a flag, '1' for any other (a number, a date, a text). */
const filledLiteral = (phrase: string) => (/^TYPE\s+(?:abap_bool(?:ean)?|xfeld|flag|boole_d|c(?:\s+LENGTH\s+1)?)$/i.test(phrase.trim()) ? "'X'" : "'1'");

interface Setter {
  /** Statements before the call (an attribute set on `lo_cut`). */
  before: string[];
  /** Predicate parameter → actual. */
  args: Map<string, string>;
}

/** Why an example has no machine form: for a check, the condition the engine reads no single input value from. */
function noForm(c: EngineTestCase): string {
  const t = c.engineCase.trace;
  if (c.engineCase.family !== 'guard') return 'the engine names no value for it';
  const at = t.lines[0] ? `L${t.lines[0].start}` : 'the check';
  return `the engine derives no single input value from the condition at ${at} (${(t.quote ?? '').slice(0, 70)})`;
}

/** Writes the case examples as ABAP Unit methods — see the file comment. */
export function abapEngineCaseMethods(cases: readonly EngineTestCase[], ctx: AbapEngineCaseContext): AbapEngineCaseMethods {
  const defs: string[] = [];
  const impls: string[] = [];
  const tally: AbapEngineCaseMethods['tally'] = { executable: [], partial: [], skipped: [] };
  let friends = false;
  const create = ctx.accessDouble ? `NEW #( io_access = NEW ${ctx.accessDouble}( ) )` : 'NEW #( )';

  /** Where a value goes: the predicate's parameter, or an attribute of the class; with the shape of what it sets. */
  const placeOf = (
    p: AbapPredicate,
    field: string,
  ): { kind: 'param'; param: string; phrase: string; component: string | null } | { kind: 'attr'; target: string; phrase: string; elementary?: boolean } | { why: string } => {
    const parts = field.toLowerCase().split('-');
    const base = parts[0];
    const component = parts.slice(1);
    if (component.length > 1) return { why: `${field} is a nested component` };
    if (base === 'sy') {
      const name = `iv_sy_${component[0] ?? ''}`;
      const param = p.params.find((x) => x.name === name);
      return param ? { kind: 'param', param: name, phrase: param.phrase, component: null } : { why: `${p.name} takes no ${field}` };
    }
    const param = p.params.find((x) => x.arg.toLowerCase() === base) ?? p.params.find((x) => x.arg.toLowerCase() === `<a row of ${base}>`);
    if (param) {
      if (GENERIC.test(param.phrase)) return { why: `${p.name} takes ${param.name} with the generic ${param.phrase.replace(/^TYPE\s+/i, '')}, so the test cannot build a value of it` };
      return { kind: 'param', param: param.name, phrase: param.phrase, component: component[0] ?? null };
    }
    if (ctx.constants.has(base)) return { why: `${field} is a constant` };
    const phrase = ctx.attributes.get(base);
    if (phrase === undefined) return { why: `${field} is neither an attribute of ${ctx.logicClass} nor a parameter of ${p.name}` };
    if (component.length === 0) return { kind: 'attr', target: `lo_cut->${base}`, phrase, elementary: ctx.elementary.has(base) };
    const comp = ctx.componentPhrase(phrase, component[0]);
    return { kind: 'attr', target: `lo_cut->${base}-${component[0]}`, phrase: comp ?? '' };
  };

  /** A non-initial value of a declaration, or why there is none the test can write. */
  const filled = (phrase: string, what: string, elementary = false): { kind: 'table' | 'value' } | { why: string } => {
    const shape = elementary ? 'elementary' : phrase ? ctx.shapeOf(phrase) : null;
    if (shape === 'table') return { kind: 'table' };
    if (shape === 'elementary') return { kind: 'value' };
    return { why: `a filled value of ${what} cannot be written: its type is ${shape === 'structure' ? 'a structure' : 'not known to the engine'}` };
  };

  /** One value into its place. */
  const setValue = (p: AbapPredicate, field: string, to: CallValue | { filled: true }, s: Setter): string | null => {
    const at = placeOf(p, field);
    if ('why' in at) return at.why;
    let source: { kind: 'literal'; text: string } | { kind: 'clear' } | { kind: 'filled' } | { kind: 'from'; expr: string };
    // `{ special: 'filled' }` is the Node contract's "the base request's value, filled": in ABAP the test fills it itself.
    if ('filled' in to || ('special' in to && to.special === 'filled')) source = { kind: 'filled' };
    else if ('value' in to) {
      if (to.value === null) return `${field} = null has no ABAP value`;
      source = { kind: 'literal', text: lit(to.value) };
    } else if ('special' in to) {
      if (to.special !== 'empty') return `${field} = ${to.special} has no ABAP value`;
      source = { kind: 'clear' };
    } else {
      const other = 'sameAs' in to ? to.sameAs : to.differentFrom;
      const o = other.toLowerCase();
      if (ctx.constants.has(o) || !ctx.attributes.has(o) || o.includes('-')) return `${field} is compared with ${other}, which the test cannot set to a known value`;
      // The other field is cleared, so "the same" is its initial value and "different" any filled value.
      s.before.push(`    CLEAR lo_cut->${o}.`);
      source = 'sameAs' in to ? { kind: 'from', expr: `lo_cut->${o}` } : { kind: 'filled' };
    }
    const phrase = at.kind === 'attr' ? at.phrase : at.component ? ctx.componentPhrase(at.phrase, at.component) ?? '' : at.phrase;
    let fill: { kind: 'table' | 'value' } | null = null;
    if (source.kind === 'filled') {
      const f = filled(phrase, field, at.kind === 'attr' && at.elementary === true);
      if ('why' in f) return f.why;
      fill = f;
    }
    if (at.kind === 'attr') {
      if (source.kind === 'clear') s.before.push(`    CLEAR ${at.target}.`);
      else if (source.kind === 'literal') s.before.push(`    ${at.target} = ${source.text}.`);
      else if (source.kind === 'from') s.before.push(`    ${at.target} = ${source.expr}.`);
      else s.before.push(fill!.kind === 'table' ? `    APPEND INITIAL LINE TO ${at.target}.` : `    ${at.target} = ${filledLiteral(phrase)}.`);
      return null;
    }
    const value =
      source.kind === 'clear' ? null : source.kind === 'literal' ? source.text : source.kind === 'from' ? source.expr : fill!.kind === 'table' ? null : filledLiteral(phrase);
    if (at.component) {
      if (fill?.kind === 'table') return `a filled value of ${field} cannot be written: it is a table inside a structure`;
      s.args.set(at.param, value === null ? 'VALUE #( )' : `VALUE #( ${at.component} = ${value} )`);
    } else if (fill?.kind === 'table') s.args.set(at.param, 'VALUE #( ( ) )');
    else s.args.set(at.param, value === null ? 'VALUE #( )' : `CONV #( ${value} )`);
    return null;
  };

  /** A guard example: the predicate asked on the case's input. Lines, or why it cannot run. */
  const guardExample = (check: EngineCheckCall, set: readonly AbapSet[], what: string): string[] | { why: string } => {
    const g = ctx.guards.find((x) => x.id === check.guard);
    const p = ctx.predicates.get(check.guard);
    if (!p || !g) return { why: `${check.guard} is not carried into the package${g && !g.carried ? ' (its rule is dropped, or the check is in demo data or unreachable code)' : ''}` };
    const s: Setter = { before: [], args: new Map() };
    for (const one of set) {
      const why = setValue(p, one.field, one.to, s);
      if (why) return { why };
    }
    if (set.length === 0) {
      // The example passes on the Node contract's base request; in ABAP the fresh class is the base: the subject initial.
      const subject = check.field ?? g.subject?.toUpperCase() ?? null;
      const atInitial = holdsOnInitial(g.condition);
      if (atInitial === null || !subject) return { why: `the passing value of ${subject ?? 'the checked value'} is the Node base request's; no ABAP value for it is known` };
      if (atInitial !== check.holds) {
        if (!/\bIS\s+(?:NOT\s+)?INITIAL$/i.test(g.condition.trim())) return { why: `the passing value of ${subject} is the Node base request's; no ABAP value for it is known` };
        // "IS INITIAL" must not hold: the subject filled — a row for a table, 'X' for a flag, '1' for any other value.
        const why = setValue(p, subject, { filled: true }, s);
        if (why) return { why };
      } else {
        const why = setValue(p, subject, { special: 'empty' }, s);
        if (why) return { why };
      }
    }
    for (const x of p.params) {
      if (s.args.has(x.name)) continue;
      if (GENERIC.test(x.phrase)) return { why: `${p.name} takes ${x.name} with the generic ${x.phrase.replace(/^TYPE\s+/i, '')}, so the test cannot build a value of it` };
      s.args.set(x.name, 'VALUE #( )');
    }
    friends = true;
    const args = [...s.args];
    const call =
      args.length === 0
        ? [`lv_holds = lo_cut->${p.name}( ).`]
        : [`lv_holds = lo_cut->${p.name}(`, ...args.map(([k, v], i) => `  ${k} = ${v}${i === args.length - 1 ? ' ).' : ''}`)];
    const expect = check.holds ? 'abap_true' : 'abap_false';
    const label = `${g.id} (L${g.line}${g.rule ? `, ${g.rule}` : ''}): ${g.condition} ${check.holds ? 'holds' : 'does not hold'} for ${what}`;
    const out = [`    lo_cut = ${create}.`, ...s.before];
    if (p.engineWritten) out.push(...call.map((l) => `    ${l}`));
    else
      out.push(
        '    TRY.',
        ...call.map((l) => `        ${l}`),
        `      CATCH ${ctx.nofill}.`,
        ...assertion('cl_abap_unit_assert=>fail(', `${g.id}: ${p.name} is still a stub - the original's check is not implemented`, '        '),
        '    ENDTRY.',
      );
    out.push(...assertion(`cl_abap_unit_assert=>assert_equals( act = lv_holds exp = ${expect}`, label));
    return out;
  };

  /** The guard a refusal or a skip of a precision example names (`BR-001`, `L24`), on the example's field. */
  const guardNamed = (rule: string | undefined, field: string): AbapCaseGuard | null => {
    if (!rule) return null;
    const line = /^L(\d+)$/.exec(rule);
    const last = field.toLowerCase().split('-').pop() ?? '';
    const hits = ctx.guards.filter((g) => (line ? g.line === Number(line[1]) : g.rule === rule));
    return hits.find((g) => (g.subject ?? '').toLowerCase().split('-').pop() === last) ?? hits[0] ?? null;
  };

  /** How a check's condition names a field (`QUOTA` → `<LS_RCV>-QUOTA`), upper case; null when it does not read it. */
  const operandOf = (g: AbapCaseGuard, field: string): string | null => {
    const last = field.toLowerCase().split('-').pop() ?? '';
    if (g.subject && g.subject.toLowerCase().split('-').pop() === last) return g.subject.toUpperCase();
    if (!/^[\w/~]+$/.test(last)) return null;
    const esc = last.replace(/[/~]/g, (c) => `\\${c}`);
    const m = new RegExp(`(?<![\\w>/-])((?:<[\\w/~]+>|[\\w/~]+)(?:-[\\w/~]+)*-${esc}|${esc})(?![\\w-])`, 'i').exec(g.condition);
    return m ? m[1].toUpperCase() : null;
  };

  let variable = 0;
  /** A precision example: a value into the declared type. Lines, or why it cannot run. */
  const precisionExample = (call: EngineCaseCall, what: string): string[] | { why: string } => {
    const valueOf = (): { field: string; value: string } | null => {
      const one = call.set[0];
      return one && 'value' in one.to && one.to.value !== null ? { field: one.field, value: one.to.value } : null;
    };
    if (call.op === 'compute' && call.compute) {
      const type = ctx.packedType(call.compute.field);
      if (!type) return { why: `the declared type of ${call.compute.field} is not one the engine reads` };
      const name = `lv_value_${++variable}`;
      if (call.expect.kind === 'equals') {
        return [
          `    DATA ${name} TYPE ${type}.`,
          `    ${name} = '${call.compute.start}'.`,
          ...call.compute.steps.map((step) => `    ${name} = ${name} ${step.op} '${step.b}'.`),
          `    DATA ${name}_exp TYPE ${type}.`,
          `    ${name}_exp = '${call.expect.value}'.`,
          ...assertion(`cl_abap_unit_assert=>assert_equals( act = ${name} exp = ${name}_exp`, what),
        ];
      }
      if (call.expect.kind === 'refused' && call.compute.steps.every((s) => s.op === '+' && s.b === '0')) return overflow(name, type, call.compute.field, call.compute.start, what);
      return { why: `the expectation ${call.expect.kind} of a calculation has no ABAP form here` };
    }
    if (call.op === 'validate') {
      const v = valueOf();
      if (!v) return { why: 'the example sets no value' };
      const type = ctx.packedType(v.field);
      if (!type) return { why: `the declared type of ${v.field} is not one the engine reads` };
      const name = `lv_value_${++variable}`;
      if (call.expect.kind === 'accepted' && call.expect.normalized !== undefined) {
        return [
          `    DATA ${name} TYPE ${type}.`,
          `    ${name} = ${lit(v.value)}.`,
          `    DATA ${name}_exp TYPE ${type}.`,
          `    ${name}_exp = ${lit(call.expect.normalized)}.`,
          ...assertion(`cl_abap_unit_assert=>assert_equals( act = ${name} exp = ${name}_exp`, what),
        ];
      }
      if (call.expect.kind === 'refused') return overflow(name, type, v.field, v.value, what);
      return { why: `the expectation ${call.expect.kind} has no ABAP form here` };
    }
    if (call.op === 'simulate' && call.check) return guardExample(call.check, call.set, what);
    if (call.op === 'simulate') {
      // A value the original's check refuses or skips (precision-max of P(5,2) = 999.99 against "p_discnt > 30"): its predicate.
      const v = valueOf();
      if (!v) return { why: 'the example sets no value' };
      const skips = call.expect.kind === 'records-delta';
      const named = call.expect.kind === 'refused' ? guardNamed(call.expect.rule, call.expect.field ?? v.field) : null;
      const g = skips ? ctx.guards.find((x) => x.carried && x.outcome === 'skips' && operandOf(x, v.field) !== null) ?? null : named;
      // The value goes where the check reads it: QUOTA is `ls_rcv-quota` in "ls_rcv-quota > 100".
      const field = g ? (call.expect.kind === 'refused' && call.expect.field) || operandOf(g, v.field) : null;
      if (!g || !field) return { why: `the check that ${skips ? 'skips' : 'refuses'} ${v.field} = ${v.value} is not one the package carries` };
      const rejects = call.expect.kind === 'records-delta' ? call.expect.delta === 0 : true;
      const holds = rejects === (g.effect !== 'check');
      return guardExample({ guard: g.id, holds, field }, [{ field, to: { value: v.value } }], what);
    }
    if (call.op === 'check' && call.check) return guardExample(call.check, call.set, what);
    return { why: `the ${call.op} example has no ABAP form here` };
  };

  function overflow(name: string, type: string, field: string, value: string, what: string): string[] {
    return [
      `    DATA ${name} TYPE ${type}.`,
      `    DATA ${name}_refused TYPE abap_bool.`,
      '    TRY.',
      `        ${name} = ${lit(value)}.`,
      '      CATCH cx_sy_conversion_overflow.',
      `        ${name}_refused = abap_true.`,
      '    ENDTRY.',
      ...assertion(`cl_abap_unit_assert=>assert_true( act = ${name}_refused`, what),
    ];
  }

  for (const c of cases) {
    const m = c.id.toLowerCase();
    defs.push(`    METHODS ${m} FOR TESTING.`);
    const body: string[] = [];
    const notRun: string[] = [];
    let ran = 0;
    let usesCut = false;
    variable = 0;
    const channel = CHANNEL_WHY[c.engineCase.kind];
    for (const [index, e] of c.engineCase.examples.entries()) {
      body.push(`    " given/when: ${comment(e.input).slice(0, 200)}`, `    " then: ${comment(e.expected).slice(0, 200)}`);
      if (channel) continue;
      const what = `${shortInput(e.input)} - ${e.expected}`;
      const own = !e.call && c.engineCase.family === 'guard' ? fromCondition(c, ctx.guards, ctx.constants)?.[index] : undefined;
      const lines = e.call
        ? c.engineCase.family === 'guard' && e.call.check
          ? guardExample(e.call.check, e.call.set, what)
          : precisionExample(e.call, what)
        : own
          ? guardExample(own.check, own.set, what)
          : { why: noForm(c) };
      if (Array.isArray(lines)) {
        body.push(...lines);
        ran++;
        if (lines.some((l) => l.includes('lo_cut'))) usesCut = true;
      } else {
        body.push(`    " Not run in ABAP: ${comment(lines.why).slice(0, 200)}.`);
        notRun.push(lines.why);
      }
    }
    impls.push(`  METHOD ${m}.`, `    " ${comment(c.name)}`);
    if (usesCut) impls.push(`    DATA lo_cut TYPE REF TO ${ctx.logicClass}.`, '    DATA lv_holds TYPE abap_bool.');
    impls.push(...body);
    if (ran === 0) {
      const why = channel ?? [...new Set(notRun)].join('; ');
      impls.push(...assertion('cl_abap_unit_assert=>skip(', `${c.id}: not run in ABAP - ${why}`));
      tally.skipped.push({ id: c.id, why });
    } else if (notRun.length > 0) tally.partial.push(c.id);
    else tally.executable.push(c.id);
    impls.push('  ENDMETHOD.', '');
  }
  return { defs, impls, tally, friends };
}
