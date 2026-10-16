/**
 * The base request's values (coordinator, 12.10.2026): every value the call
 * contract's base request carries comes from the original, never from a
 * placeholder. In this order:
 *
 *   1. the selection screen's DEFAULT (or an INITIALIZATION assignment);
 *   2. a value the original's own demo-data routines use for the field
 *      (`VALUE #( quota = '40.00' )`, `p_sender = 'C900'`, or a literal handed
 *      to a demo routine's parameter that it puts into the field);
 *   3. a fixed list in the code (`programSummaryFactsOf(...).fixedLists`: one
 *      routine called again and again with literals);
 *   4. a value that satisfies the original's checks on the field (the literals
 *      they compare against, and one unit either side).
 *
 * Every candidate must fit the field's type and pass every check on the field
 * that can be decided from the field alone. A checkbox without a DEFAULT is
 * off and a selection range empty — their natural state, not a guess — unless
 * a check refuses the range empty: then it carries one value (3.0.15). An
 * obligatory field with no candidate gets none: the contract lists it as
 * needing a value and the engine cases read "Not run — no valid base value
 * known for X" instead of failing for a value nobody chose.
 *
 * Pure: no network, no model.
 */

import { containerAt } from '../abap/block-structure';
import { programSummaryFactsOf } from '../program-summary-facts';
import type { EngineFacts } from './unit-plan';
import type { ContractField, NotCarried } from './types';

type Base = NonNullable<ContractField['base']>;

const unquote = (t: string): string | null => {
  const m = /^'((?:[^']|'')*)'$/.exec(t.trim()) ?? /^`([^`]*)`$/.exec(t.trim());
  return m ? m[1].replace(/''/g, "'") : null;
};
const literalOf = (t: string): string | null => unquote(t) ?? (/^[-+]?\d+(?:\.\d+)?$/.test(t.trim()) ? t.trim() : null);

const DEC = /^([-+]?)(\d+)(?:\.(\d+))?$/;

function compareText(a: string, b: string): number {
  const x = DEC.exec(a.trim());
  const y = DEC.exec(b.trim());
  if (x && y) {
    const d = Math.max((x[3] ?? '').length, (y[3] ?? '').length);
    const big = (m: RegExpExecArray) => BigInt(`${m[1] === '-' ? '-' : ''}${m[2]}${(m[3] ?? '').padEnd(d, '0')}`);
    const l = big(x);
    const r = big(y);
    return l === r ? 0 : l < r ? -1 : 1;
  }
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Does `value` fit the field's declared type, as the input contract will read it? */
export function fitsKind(f: ContractField, value: string): boolean {
  const v = value.trim();
  switch (f.kind) {
    case 'packed': {
      const m = DEC.exec(v);
      if (!m) return false;
      const whole = m[2].replace(/^0+/, '').length;
      return whole <= (f.digits ?? 31) - f.places;
    }
    case 'integer':
      return /^[-+]?\d{1,18}$/.test(v) && (f.max === null || BigInt(v.replace(/^\+/, '')) <= BigInt(f.max));
    case 'digits':
      return /^\d+$/.test(v) && v.length <= (f.digits ?? 99);
    case 'date': {
      const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
      if (!m) return false;
      const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      return t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3];
    }
    case 'text':
      return v.length > 0;
    default:
      return false;
  }
}

/* --------------------------------------------------------------- checks */

interface Atom {
  field: string;
  op: string;
  /** The literal compared against; null for IS [NOT] INITIAL. */
  value: string | null;
  initial?: 'is' | 'not';
}

const OPS: Record<string, string> = { '>': '>', GT: '>', '>=': '>=', GE: '>=', '<': '<', LT: '<', '<=': '<=', LE: '<=', '=': '=', EQ: '=', '<>': '<>', NE: '<>' };

/** A condition as atoms joined by AND/OR (parentheses dropped); null when an atom is not `x op literal` or `x IS [NOT] INITIAL`. */
function atomsOf(condition: string, constants: ReadonlyMap<string, string>): { atoms: Atom[]; joins: string[] } | null {
  const parts = condition.replace(/[()]/g, ' ').split(/\s+(AND|OR)\s+/i);
  const atoms: Atom[] = [];
  const joins: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      joins.push(parts[i].toUpperCase());
      continue;
    }
    const p = parts[i].trim();
    // `s_vkorg[] IS INITIAL`: the body of a selection range (3.0.15 item 5f).
    const init = /^([\w/~<>-]+)(?:\[\])?\s+IS\s+(NOT\s+)?INITIAL$/i.exec(p);
    if (init) {
      atoms.push({ field: init[1].toLowerCase(), op: 'initial', value: null, initial: init[2] ? 'not' : 'is' });
      continue;
    }
    const cmp = /^([\w/~<>-]+)\s*(>=|<=|<>|=|>|<|\bGE\b|\bLE\b|\bNE\b|\bEQ\b|\bGT\b|\bLT\b)\s*('(?:[^']|'')*'|[\w/~.+-]+)$/i.exec(p);
    if (!cmp) return null;
    const raw = cmp[3];
    const value = literalOf(raw) ?? constants.get(raw.toLowerCase()) ?? null;
    atoms.push({ field: cmp[1].toLowerCase(), op: OPS[cmp[2].toUpperCase()] ?? cmp[2], value: value ?? `@${raw.toLowerCase()}` });
  }
  return { atoms, joins };
}

const component = (name: string) => (name.includes('-') ? name.slice(name.lastIndexOf('-') + 1) : name).replace(/^<|>$/g, '');

function holds(atom: Atom, value: string): boolean | null {
  if (atom.op === 'initial') {
    const empty = value.trim() === '' || /^[-+]?0+(\.0+)?$/.test(value.trim());
    return atom.initial === 'is' ? empty : !empty;
  }
  if (atom.value === null || atom.value.startsWith('@')) return null;
  const c = compareText(value, atom.value);
  switch (atom.op) {
    case '>': return c > 0;
    case '>=': return c >= 0;
    case '<': return c < 0;
    case '<=': return c <= 0;
    case '=': return c === 0;
    case '<>': return c !== 0;
    default: return null;
  }
}

/** AND binds before OR, as in ABAP. */
function evaluate(atoms: Atom[], joins: string[], valueOf: (atom: Atom) => boolean | null): boolean | null {
  let or: boolean | null = false;
  let and: boolean | null = valueOf(atoms[0]);
  for (let i = 0; i < joins.length; i++) {
    const next = valueOf(atoms[i + 1]);
    if (joins[i] === 'AND') and = and === false || next === false ? false : and === null || next === null ? null : true;
    else {
      or = or === true || and === true ? true : or === null || and === null ? null : false;
      and = next;
    }
  }
  return or === true || and === true ? true : or === null || and === null ? null : false;
}

interface CheckOnField {
  atoms: Atom[];
  joins: string[];
  /** The check rejects when the condition holds (IF) or fails (CHECK). */
  rejectsWhen: boolean;
  /** Only this field and literals: decidable from the field alone. */
  single: boolean;
}

/* ---------------------------------------------------------------- reader */

/** Fill `base` of every field — see the file comment. Returns the obligatory fields that got none. */
export function assignBaseValues(fields: ContractField[], facts: EngineFacts, notCarried: readonly NotCarried[]): string[] {
  const { statements, blocks, graph, contract } = facts;
  const constants = new Map<string, string>();
  for (const st of statements) {
    if (st.keyword !== 'CONSTANTS') continue;
    const m = /^CONSTANTS\s*:?\s*([\w/]+)\b.*\bVALUE\s+('(?:[^']|'')*'|[-+]?\d+(?:\.\d+)?)/i.exec(st.text);
    if (m) constants.set(m[1].toLowerCase(), literalOf(m[2]) ?? m[2]);
  }
  const fieldOf = (name: string): ContractField | undefined => {
    const n = name.toLowerCase();
    return fields.find((f) => f.original.toLowerCase() === n) ?? fields.find((f) => f.where === 'record' && f.original.toLowerCase() === component(n));
  };

  // The checks on each field.
  const checks = new Map<ContractField, CheckOnField[]>();
  for (const g of contract.guards) {
    const parsed = atomsOf(g.condition, constants);
    if (!parsed) continue;
    const touched = new Set(parsed.atoms.map((a) => fieldOf(a.field)).filter((f): f is ContractField => Boolean(f)));
    const single = touched.size === 1 && parsed.atoms.every((a) => fieldOf(a.field) && (a.value === null || !a.value.startsWith('@')));
    for (const f of touched) {
      const list = checks.get(f) ?? [];
      list.push({ atoms: parsed.atoms, joins: parsed.joins, rejectsWhen: g.effect !== 'check', single });
      checks.set(f, list);
    }
  }
  const passes = (f: ContractField, value: string): boolean =>
    (checks.get(f) ?? [])
      .filter((c) => c.single)
      .every((c) => {
        const r = evaluate(c.atoms, c.joins, (a) => holds(a, value));
        return r === null || r !== c.rejectsWhen;
      });
  const usable = (f: ContractField, value: string | null): value is string => value !== null && fitsKind(f, value) && passes(f, value);

  // 1. defaults, and INITIALIZATION assignments to selection inputs.
  const initialisation = new Map<string, string>();
  for (const st of statements) {
    const c = containerAt(blocks.containers, st.lineStart);
    if (!c || c.kind !== 'event' || c.name !== 'INITIALIZATION') continue;
    const m = /^([\w/]+)\s*=\s*('(?:[^']|'')*'|[-+]?\d+(?:\.\d+)?)\s*\.?$/.exec(st.text);
    if (m) initialisation.set(m[1].toLowerCase(), literalOf(m[2])!);
  }

  // 2. demo data: literals the fixture routines put into a field, directly or through a parameter.
  const fixtures = notCarried.filter((n) => n.reason === 'fixture');
  const inFixture = (line: number) => fixtures.some((n) => line >= n.lineStart && line <= n.lineEnd);
  const demo = new Map<string, string[]>();
  const addDemo = (name: string, value: string | null) => {
    if (value === null) return;
    const key = component(name.toLowerCase());
    const list = demo.get(key) ?? [];
    if (!list.includes(value)) list.push(value);
    demo.set(key, list);
  };
  const paramValues = new Map<string, string[]>(); // `FORM.param` → literals handed in by calls
  for (const p of graph.performs) {
    if (!p.target || !inFixture(p.lineStart) && !fixtures.some((n) => n.routine === p.target)) continue;
    const form = graph.forms.find((f) => f.name === p.target);
    const m = /\bUSING\s+([\s\S]+?)(?:\s+CHANGING\b|\s+TABLES\b|$)/i.exec(p.text);
    if (!form || !m) continue;
    const args = m[1].match(/'(?:[^']|'')*'|`[^`]*`|\S+/g) ?? [];
    form.parameters.filter((x) => x.direction === 'using').forEach((param, i) => {
      const v = args[i] ? literalOf(args[i]) : null;
      if (v === null) return;
      const k = `${form.name}.${param.name.toLowerCase()}`;
      paramValues.set(k, [...(paramValues.get(k) ?? []), v]);
    });
  }
  for (const st of statements) {
    if (!inFixture(st.lineStart)) continue;
    const owner = containerAt(blocks.containers, st.lineStart);
    for (const m of st.text.matchAll(/(<?[\w/~]+>?(?:-[\w/~]+)*)\s*=\s*('(?:[^']|'')*'|`[^`]*`|[-+]?\d+(?:\.\d+)?|[\w/]+)/g)) {
      const lit = literalOf(m[2]);
      if (lit !== null) addDemo(m[1], lit);
      else if (owner) for (const v of paramValues.get(`${owner.name}.${m[2].toLowerCase()}`) ?? []) addDemo(m[1], v);
    }
  }

  // 3. fixed lists in the code: the column a routine puts into a field.
  const fixed = new Map<string, string[]>();
  let lists: ReturnType<typeof programSummaryFactsOf>['fixedLists'] = [];
  try {
    lists = programSummaryFactsOf(facts.source, { calls: graph, ruleSet: facts.ruleSet }).fixedLists;
  } catch {
    lists = [];
  }
  for (const list of lists) {
    const form = graph.forms.find((f) => f.name === list.routine);
    if (!form) continue;
    const params = form.parameters.filter((p) => p.direction === 'using').map((p) => p.name.toLowerCase());
    const text = facts.lines.slice(form.lineStart - 1, form.lineEnd).join('\n');
    params.forEach((param, i) => {
      for (const m of text.matchAll(new RegExp(`(<?[\\w/~]+>?(?:-[\\w/~]+)*)\\s*=\\s*${param.replace(/[/]/g, '\\/')}\\b`, 'gi'))) {
        const key = component(m[1].toLowerCase());
        fixed.set(key, [...(fixed.get(key) ?? []), ...list.rows.map((r) => r[i]).filter((v) => v !== undefined)]);
      }
    });
  }

  // 4. values that satisfy the checks on the field.
  const fromChecks = (f: ContractField): string[] => {
    const out: string[] = [];
    const unit = f.kind === 'packed' && f.places > 0 ? `0.${'0'.repeat(f.places - 1)}1` : '1';
    const step = (v: string, sign: 1 | -1): string | null => {
      const m = DEC.exec(v);
      const u = DEC.exec(unit)!;
      if (!m) return null;
      const d = Math.max((m[3] ?? '').length, (u[3] ?? '').length);
      const big = BigInt(`${m[1] === '-' ? '-' : ''}${m[2]}${(m[3] ?? '').padEnd(d, '0')}`) + BigInt(sign) * BigInt(`${u[2]}${(u[3] ?? '').padEnd(d, '0')}`);
      const neg = big < BigInt(0);
      const s = (neg ? -big : big).toString().padStart(d + 1, '0');
      const width = f.kind === 'digits' && f.digits ? f.digits : 0;
      const intPart = d > 0 ? s.slice(0, -d) : s;
      return `${neg ? '-' : ''}${width ? intPart.padStart(width, '0') : intPart}${d > 0 ? `.${s.slice(-d)}` : ''}`;
    };
    for (const c of checks.get(f) ?? []) {
      for (const a of c.atoms) {
        if (fieldOf(a.field) !== f || a.value === null || a.value.startsWith('@')) continue;
        for (const v of c.single ? [a.value, step(a.value, 1), step(a.value, -1)] : a.op === (c.rejectsWhen ? '<>' : '=') ? [a.value] : []) {
          if (v !== null && !out.includes(v)) out.push(v);
        }
      }
    }
    return out;
  };

  const missing: string[] = [];
  for (const f of fields) {
    if (f.where === 'internal') continue;
    if (f.kind === 'flag') {
      const d = f.defaultValue ? unquote(f.defaultValue) : initialisation.get(f.original.toLowerCase()) ?? null;
      f.base = { value: d !== null && /^x$/i.test(d), source: d !== null ? 'default' : 'kind' };
      continue;
    }
    const name = f.original.toLowerCase();
    if (f.kind === 'range') {
      // Empty, its natural state — unless a check of the original refuses it empty (`IF s_vkorg[] IS INITIAL.
      // MESSAGE e001 …`): then the base request carries one value, which the input contract reads as `I EQ value`,
      // from the DEFAULT (a literal or a constant), the demo data or a fixed list (3.0.15 item 5f — 31 engine cases
      // of the 1,000-line example did not run because the base request lacked the sales organisation).
      const refusedEmpty = (checks.get(f) ?? []).some((c) => c.single && evaluate(c.atoms, c.joins, (a) => holds(a, '')) === c.rejectsWhen);
      if (!refusedEmpty) {
        f.base = { value: [], source: 'kind' };
        continue;
      }
      const declared = f.defaultValue ? literalOf(f.defaultValue) ?? constants.get(f.defaultValue.trim().toLowerCase()) ?? null : null;
      const candidates: Array<[Base['source'], Array<string | null>]> = [
        ['default', [declared, initialisation.get(name) ?? null]],
        ['demo', demo.get(component(name)) ?? []],
        ['fixed-list', fixed.get(component(name)) ?? []],
      ];
      let chosen: Base | null = null;
      for (const [source, values] of candidates) {
        const v = values.find((x) => x !== null && x.trim() !== '' && passes(f, x));
        if (v !== undefined && v !== null) {
          chosen = { value: [v], source };
          break;
        }
      }
      f.base = chosen ?? { value: [], source: 'kind' };
      if (!chosen) missing.push(f.original);
      continue;
    }
    const sources: Array<[Base['source'], Array<string | null>]> = [
      ['default', [f.defaultValue ? literalOf(f.defaultValue) : null, initialisation.get(name) ?? null]],
      ['demo', demo.get(component(name)) ?? []],
      ['fixed-list', fixed.get(component(name)) ?? []],
      ['guard', fromChecks(f)],
    ];
    let chosen: Base | null = null;
    for (const [source, values] of sources) {
      const v = values.find((x) => usable(f, x));
      if (v !== undefined && v !== null) {
        chosen = { value: f.kind === 'digits' && f.digits ? v.padStart(f.digits, '0') : v, source };
        break;
      }
    }
    f.base = chosen;
    if (!chosen && f.obligatory) missing.push(f.original);
  }
  return missing;
}
