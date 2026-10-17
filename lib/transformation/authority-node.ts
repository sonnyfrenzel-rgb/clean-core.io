/**
 * The original's AUTHORITY-CHECKs on the Node route (roadmap 3.0.17 criterion 3, scaffold version 15).
 *
 * The defect it closes: a step whose ABAP holds `AUTHORITY-CHECK OBJECT … IF sy-subrc <> 0. MESSAGE … TYPE 'E'.`
 * got a frame and a derived check `guard_G…(sel, st, record, { sySubrc })`, but nothing to compute sy-subrc from —
 * so the model invented it, each run differently (`checked(sel, st) ? 0 : 4`, a string), and the type check
 * failed on the side-by-side starter example three runs out of three.
 *
 * What the engine writes instead:
 *   - `srv/lib/authority.ts`, the seam: `authority_check(st, object, fields, line)` returns the sy-subrc of the
 *     check. It fails closed (4, "not authorized") until a developer maps the original's checks to the target's
 *     authorization — the open decision, as the RAP route leaves its `is_*_granted` helpers (FP-GUARD-05). A demo
 *     or a trial may grant with `CC_AUTHORITY_DEMO=grant`, set on purpose where the service runs; every check it
 *     grants says so on the run (`st.issues`), so a grant is never silent. Nothing in a request can grant.
 *   - in the frame of each step (and of the main path) whose lines hold a check, before the body:
 *     `const authority_L90 = (): number => authority_check(st, 'V_LIKP_VST', { 'VSTEL': sel.vstel, 'ACTVT': '03' }, 90);`
 *     — the values as the original names them (a literal, a constant, a selection field, a parameter of the
 *     routine). The body calls `authority_L90()` where the original runs that check, and its answer is sy-subrc:
 *     the check runs (and is noted on the run) only where the original reaches it, never at the step's entry
 *     (`IF p_upd = abap_true. AUTHORITY-CHECK …`). A check with a value the engine cannot read outside the
 *     routine (a local it computes first) gets no such function: the fill request names the exact call
 *     `authority_check(…)` for the body to write at its line, with that value to put in.
 *
 * Pure and deterministic. No network, no model.
 */

import type { AuthorityCheck } from '../abap/call-graph';
import type { AbapStatement } from '../abap/statement-reader';
import { camelName } from './naming';
import type { AuthorityEntry, Unit, UnitPlan } from './types';

/** The package file of the seam. */
export const AUTHORITY_FILE = 'srv/lib/authority.ts';
/** The environment variable a demo or trial sets to `grant`; never read from a request. */
export const AUTHORITY_DEMO_ENV = 'CC_AUTHORITY_DEMO';
/** The sy-subrc the seam answers until a developer writes the check: 4, "not authorized" (fail closed). */
export const AUTHORITY_DENIED_SUBRC = 4;
/** The comment that names one open check in `srv/lib/authority.ts`; `openAuthorityIn` and TRACE.md read it. */
export const AUTHORITY_OPEN_TAG = '@cc-open AUTH';

const comment = (s: string) => s.replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const sq = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** The object a check names, as one word: its literal or constant value, else what the original wrote. */
const objectOf = (c: AuthorityCheck) => (c.object ?? c.objectExpression).replace(/["']/g, '') || '(unread)';

/** `L90 V_LIKP_VST (VSTEL, ACTVT): AUTHORITY-CHECK OBJECT 'V_LIKP_VST' ID 'VSTEL' FIELD p_vstel …` — one line. */
export function authorityLine(c: AuthorityCheck): string {
  const ids = c.fields.map((f) => (f.dummy ? `${f.id} DUMMY` : f.id));
  return `L${c.lineStart} ${objectOf(c)}${ids.length ? ` (${ids.join(', ')})` : ''}: ${comment(c.text).slice(0, 200)}`;
}

/**
 * The CONSTANTS with a literal VALUE the source declares once (or always with the same value) — the same reading
 * as the call graph's, so a check's object and its field values resolve alike.
 */
function constantsOf(statements: readonly AbapStatement[]): Map<string, string> {
  const out = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const s of statements) {
    if (s.keyword !== 'CONSTANTS') continue;
    const m = /^CONSTANTS\s+([\w/]+)\b[\s\S]*?\bVALUE\s+'((?:[^']|'')*)'/i.exec(s.text);
    if (!m) continue;
    const name = m[1].toUpperCase();
    const value = m[2].replace(/''/g, "'");
    if (out.has(name) && out.get(name) !== value) ambiguous.add(name);
    out.set(name, value);
  }
  for (const n of ambiguous) out.delete(n);
  return out;
}

/** The ID/FIELD pairs as the statement writes them, the FIELD token raw (quoted when a literal), null for DUMMY. */
function rawFields(text: string): Array<{ id: string; token: string | null }> {
  const out: Array<{ id: string; token: string | null }> = [];
  const re = /\bID\s+('(?:[^']|'')*'|[\w/-]+)\s+(?:FIELD\s+('(?:[^']|'')*'|`[^`]*`|[\w/<>-]+)|(DUMMY)\b)/gi;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const id = m[1].replace(/^'|'$/g, '').replace(/''/g, "'").toUpperCase();
    out.push({ id, token: m[3] !== undefined ? null : m[2] });
  }
  return out;
}

interface Resolved {
  /** The TypeScript expression of the value, or null when the engine cannot read it at the step's entry. */
  expr: string | null;
  /** The name the original uses, for the request's template. */
  name: string;
}

function resolveField(token: string | null, u: Unit, plan: Pick<UnitPlan, 'fields'>, constants: ReadonlyMap<string, string>): Resolved {
  if (token === null) return { expr: 'null', name: 'DUMMY' };
  if (/^'/.test(token)) return { expr: sq(token.slice(1, -1).replace(/''/g, "'")), name: token };
  if (/^`/.test(token)) return { expr: sq(token.slice(1, -1)), name: token };
  if (/^-?\d+$/.test(token)) return { expr: sq(token), name: token };
  const upper = token.toUpperCase();
  const constant = constants.get(upper);
  if (constant !== undefined) return { expr: sq(constant), name: token };
  const selection = plan.fields.find((f) => f.where === 'selection' && f.original === upper);
  if (selection) return { expr: `sel.${selection.key}`, name: token };
  // A parameter of the routine, read from the step's own arguments (only a whole step has `args`).
  const [base, ...components] = token.toLowerCase().split('-');
  const param = !u.part ? u.parameters.find((p) => p.name.toLowerCase() === base) : undefined;
  if (param && components.length === 0) return { expr: `args.${camelName(base)}${param.direction === 'changing' ? '.value' : ''}`, name: token };
  return { expr: null, name: token };
}

/** Is a line inside one of the unit's own ranges? */
const inUnit = (u: Unit, line: number) => u.abap.some((r) => line >= r.lineStart && line <= r.lineEnd);

/**
 * The original's checks inside this unit's lines, each with the constant the frame computes or, where a value
 * is only known inside the routine, the call the body writes. A split routine's parent has no checks of its
 * own: its parts carry them.
 */
export function authorityEntriesOf(u: Unit, plan: Pick<UnitPlan, 'fields' | 'units'>, checks: readonly AuthorityCheck[], statements: readonly AbapStatement[]): AuthorityEntry[] {
  if (plan.units.some((p) => p.part?.parent === u.id)) return [];
  const constants = constantsOf(statements);
  // Two checks on one line get two names (QA finding 90667d2a91ae): `authority_L90`, then `authority_L90_2`.
  const onLine = new Map<number, number>();
  return checks
    .filter((c) => inUnit(u, c.lineStart))
    .sort((a, b) => a.lineStart - b.lineStart)
    .map((c) => {
      const n = (onLine.get(c.lineStart) ?? 0) + 1;
      onLine.set(c.lineStart, n);
      const object = objectOf(c);
      const fields = rawFields(c.text).map((f) => ({ id: f.id, ...resolveField(f.token, u, plan, constants) }));
      const unread = fields.filter((f) => f.expr === null).map((f) => f.name);
      const values = fields.map((f) => `${sq(f.id)}: ${f.expr ?? `<${f.name}>`}`).join(', ');
      return {
        line: c.lineStart,
        object,
        check: comment(c.text).slice(0, 200),
        fn: unread.length === 0 ? `authority_L${c.lineStart}${n === 1 ? '' : `_${n}`}` : null,
        call: `authority_check(st, ${sq(object)}, { ${values} }, ${c.lineStart})`,
        ...(unread.length ? { unread } : {}),
      };
    });
}

/** The frame lines before a body: one function per check the engine writes, run where the body calls it. */
export function authorityFrameLines(entries: readonly AuthorityEntry[]): string[] {
  return entries
    .filter((e) => e.fn !== null)
    .map((e) => `  const ${e.fn} = (): number => ${e.call}; // the AUTHORITY-CHECK at L${e.line}: call it there, it answers sy-subrc (engine, srv/lib/authority.ts)`);
}

/** The lines of a unit's doc comment that name its checks. */
export function authorityDocLines(entries: readonly AuthorityEntry[]): string[] {
  return entries.map((e) =>
    e.fn !== null
      ? ` * Authority (engine): ${e.fn}() is the AUTHORITY-CHECK at L${e.line} (${e.check}) — call it where the original checks; it answers sy-subrc.`
      : ` * Authority: at L${e.line} the body calls ${e.call.replace(/\*\//g, '* /')} — it answers sy-subrc (${(e.unread ?? []).join(', ')} known only inside the routine).`,
  );
}

/** `srv/lib/authority.ts` — the seam, failing closed, with the original's checks listed. */
export function authorityFile(program: string | null, checks: readonly AuthorityCheck[]): string {
  const lines: string[] = [];
  lines.push('/**');
  lines.push(` * The authority checks of ${program ?? 'the original'} — the seam of this package, written by Clean-Core.io (engine).`);
  lines.push(' * OPEN DECISION: who may run this. The original checks (read by the engine):');
  for (const c of [...checks].sort((a, b) => a.lineStart - b.lineStart)) lines.push(` *   ${AUTHORITY_OPEN_TAG} ${authorityLine(c)}`);
  lines.push(' * A step calls authority_check where the original checks, with the values the original checks; the answer is sy-subrc.');
  lines.push(` * It FAILS CLOSED: every check answers ${AUTHORITY_DENIED_SUBRC} (not authorized) until you map it to the authorization of your`);
  lines.push(" * target — on SAP BTP the caller's roles (req.user.is(<role>) in srv/service.ts, the roles in xs-security.json,");
  lines.push(' * @requires on the service in srv/service.cds) — and pass what you decide to this function.');
  lines.push(` * Demo or trial only: ${AUTHORITY_DEMO_ENV}=grant in the environment of the service grants every check, and each run says`);
  lines.push(' * so in its issues. Never set it where real data is processed. Nothing in a request can grant.');
  lines.push(' * Failure pattern FP-GUARD-05: a port without the original\'s authorization.');
  lines.push(' */');
  lines.push("import type { RunState } from './types.ts';");
  lines.push('');
  lines.push('/** The ID/FIELD pairs of one AUTHORITY-CHECK, as the original names them; null for an ID it checks as DUMMY. */');
  lines.push('export type AuthorityFields = Readonly<Record<string, unknown>>;');
  lines.push('');
  lines.push('/** sy-subrc of AUTHORITY-CHECK: 0 authorized, 4 not authorized for these values. */');
  lines.push(`export const AUTHORITY_DENIED = ${AUTHORITY_DENIED_SUBRC};`);
  lines.push(`export const AUTHORITY_DEMO_ENV = ${sq(AUTHORITY_DEMO_ENV)};`);
  lines.push('');
  lines.push('function note(st: RunState, severity: string, message: string): void {');
  lines.push("  if (!st.issues.some((i) => i.rule === 'AUTH' && i.message === message)) st.issues.push({ severity, rule: 'AUTH', message });");
  lines.push('}');
  lines.push('');
  lines.push('/** The sy-subrc of the original\'s AUTHORITY-CHECK at `line` for this run. */');
  lines.push('export function authority_check(st: RunState, object: string, fields: AuthorityFields, line: number): number {');
  lines.push("  const what = `L${line} AUTHORITY-CHECK OBJECT '${object}' (${Object.keys(fields).join(', ')})`;");
  lines.push(`  // ${AUTHORITY_OPEN_TAG}: map this check to your target's authorization here; until then it is denied (fail closed).`);
  lines.push(`  if (typeof process !== 'undefined' && process.env[AUTHORITY_DEMO_ENV] === 'grant') {`);
  lines.push("    note(st, 'warning', `${what}: granted by ${AUTHORITY_DEMO_ENV}=grant (demo or trial) - no authorization was checked.`);");
  lines.push('    return 0;');
  lines.push('  }');
  lines.push("  note(st, 'error', `${what}: denied - this package checks no authorization yet (fail closed, srv/lib/authority.ts).`);");
  lines.push('  return AUTHORITY_DENIED;');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

/** The open checks `srv/lib/authority.ts` names (`L90 V_LIKP_VST (VSTEL, ACTVT)`), for TRACE.md; none when absent. */
export function openAuthorityIn(content: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`^ \\*\\s+${AUTHORITY_OPEN_TAG} (L\\d+ [^:]+):`, 'gm');
  for (let m = re.exec(content); m !== null; m = re.exec(content)) out.push(m[1]);
  return out;
}
