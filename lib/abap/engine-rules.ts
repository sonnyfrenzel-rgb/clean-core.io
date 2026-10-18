import { maskLiterals, type AbapStatement } from './statement-reader';

/**
 * The four small engine rules of roadmap 3.0.13 (owner decision 14.10.2026)
 * and the customer's own enhancement point, read from the statements.
 *
 * Pure: statements in, facts out. `evidence-model.ts` turns the facts into
 * findings, and only for a run of engine 3.0.13 or later
 * (`PRECISION_FIXES_FROM`), so a signed run of an earlier engine keeps what it
 * signed. None of these facts costs score points or chooses the route: each is
 * a question or a rework item the reader needs, not a clean core violation.
 *
 * `EngineRuleOptions.engineReads` — from engine 3.0.18 (`ENGINE_READS_FROM`,
 * QA delta of 73b8cad63d3e): `IS [NOT] INITIAL` on the server's date or time
 * and a decision on a plain copy of it count; a hook is delegated only when it
 * holds nothing but the calls that hand its work on; a `CO_` class is a proxy
 * only where a `TRY` that catches a proxy fault uses it.
 */

export interface EngineRuleOptions {
  engineReads?: boolean;
}

const CUSTOMER = /^[ZY]/i;

/* ------------------------------------------------------------------ *
 * (1) The server's date and time deciding something
 * ------------------------------------------------------------------ */

export type SystemTimeUse = 'comparison' | 'deadline' | 'write' | 'job-schedule';

export interface SystemTimeLine {
  line: number;
  /** The program unit (`readProgramUnits`) the statement belongs to. */
  unit: number;
  use: SystemTimeUse;
  /** `SY-DATUM` or `SY-UZEIT`; for a job, the scheduling parameter. */
  field: string;
  /** For a stored value: the field it is kept in, lower-cased (`erdat` for `ls_row-erdat = sy-datum`). */
  target?: string;
  text: string;
}

const RELATIONAL = /^(<>|<=|>=|=<|=>|<|>|EQ|NE|LT|LE|GT|GE|BETWEEN)$/i;
const CONDITION_KEYWORDS = new Set(['IF', 'ELSEIF', 'CHECK', 'WHILE', 'ASSERT', 'WHEN']);
const PARAMETER_PASSING = /\b(EXPORTING|IMPORTING|CHANGING|TABLES)\b/i;
const JOB_SCHEDULE_PARAMETERS = /\b(SDLSTRTDT|SDLSTRTTM|LASTSTRTDT|LASTSTRTTM)\b/i;

/**
 * Where `sy-datum` / `sy-uzeit` decides something: in a comparison (a
 * condition, a WHERE clause), in date arithmetic (a deadline) — or is only
 * stored in a field (`ls_row-erdat = sy-datum`, a `SET` clause, a component in
 * `VALUE #( )`). The evidence model makes a finding of the first two and of a
 * scheduled job; a stored stamp is a note beside the findings (owner decision
 * 14.10.2026: as little noise as possible about small things, without hiding them).
 * Both are the application server's date and time, which in a cloud system is
 * UTC: a rule written against the user's day tips at the wrong hour, and a
 * scheduled job shifts with it. A display (`WRITE`) and a value handed to a
 * function or method (`EXPORTING date = sy-datum`) are not counted — the
 * receiver decides there, and this source does not show how.
 *
 * `JOB_CLOSE` with a start date or time (`SDLSTRTDT`, `SDLSTRTTM`, …) joins it:
 * the start is read in the system's time zone.
 */
export function readSystemTimeUses(
  statements: readonly AbapStatement[],
  units: ProgramUnits = readProgramUnits(statements),
  options: EngineRuleOptions = {},
): SystemTimeLine[] {
  const reads = options.engineReads === true;
  const out: SystemTimeLine[] = [];
  // From 3.0.18: plain copies of the server's date or time, per program unit
  // (`lv_date = sy-datum.`), by upper-cased name → the field copied.
  const copies = new Map<number, Map<string, string>>();
  for (const [index, statement] of statements.entries()) {
    const unit = units.unitOf[index];
    if (statement.nativeSql) continue;
    const text = statement.text;
    const code = maskLiterals(text);
    if (/^CALL\s+FUNCTION\s+'JOB_CLOSE'/i.test(text)) {
      const parameter = JOB_SCHEDULE_PARAMETERS.exec(code);
      if (parameter) out.push({ line: statement.lineStart, unit, use: 'job-schedule', field: parameter[1].toUpperCase(), text });
      continue;
    }
    if (statement.keyword === 'WRITE') continue;
    const copied = reads ? (copies.get(unit) ?? new Map<string, string>()) : null;
    if (copied) {
      copies.set(unit, copied);
      const statementCode = code.trim().replace(/\.$/, '').trim();
      const copy = /^(?:DATA\(\s*([\w/]+)\s*\)|([\w/]+))\s*=\s*@?sy-(datum|uzeit)$/i.exec(statementCode);
      const move = /^MOVE\s+sy-(datum|uzeit)\s+TO\s+([\w/]+)$/i.exec(statementCode);
      if (copy) { copied.set((copy[1] || copy[2]).toUpperCase(), `SY-${copy[3].toUpperCase()}`); continue; }
      if (move) { copied.set(move[2].toUpperCase(), `SY-${move[1].toUpperCase()}`); continue; }
      // A copy written again with anything else is no copy any more.
      const rewritten = /^(?:DATA\(\s*([\w/]+)\s*\)|([\w/]+))\s*=/i.exec(statementCode) ?? /^(?:CLEAR|MOVE\b[\s\S]*?\bTO)\s+()([\w/]+)$/i.exec(statementCode);
      if (rewritten) copied.delete((rewritten[1] || rewritten[2]).toUpperCase());
    }
    const names = copied && copied.size ? [...copied.keys()].map((n) => n.replace(/[/]/g, '\\/')).join('|') : '';
    const pattern = new RegExp(String.raw`@?\bsy-(datum|uzeit)\b(\+\d+)?(\(\d+\))?${names ? String.raw`|(?<![\w/-])(${names})(?![\w/-])(\+\d+)?(\(\d+\))?` : ''}`, 'gi');
    let match: RegExpExecArray | null;
    let found: SystemTimeLine | null = null;
    while ((match = pattern.exec(code)) && !found) {
      const field = match[1] ? `SY-${match[1].toUpperCase()}` : copied!.get(match[4].toUpperCase())!;
      const before = code.slice(0, match.index).trimEnd();
      const after = code.slice(match.index + match[0].length).trimStart();
      const prevToken = (before.match(/(\S+)$/)?.[1] ?? '').toUpperCase();
      const nextToken = (after.match(/^(\S+)/)?.[1] ?? '').toUpperCase().replace(/\.$/, '');
      const inCondition = CONDITION_KEYWORDS.has(statement.keyword)
        || /\b(WHERE|HAVING|ON)\b/i.test(before);
      const use: SystemTimeUse | null =
        RELATIONAL.test(prevToken) || RELATIONAL.test(nextToken) || (prevToken === '=' && inCondition) ? 'comparison'
        // From 3.0.18: `IF sy-datum IS INITIAL`, `IF sy-uzeit IS NOT INITIAL`.
        : reads && nextToken === 'IS' && inCondition && /^IS\s+(?:NOT\s+)?INITIAL\b/i.test(after) ? 'comparison'
        : nextToken === '+' || nextToken === '-' || prevToken === '+' || prevToken === '-' ? 'deadline'
        : prevToken === '=' && !PARAMETER_PASSING.test(before) && storedField(before) ? 'write'
        : null;
      if (use) found = { line: statement.lineStart, unit, use, field, ...(use === 'write' ? { target: storedTarget(before) } : {}), text };
    }
    if (found) out.push(found);
  }
  return out;
}

/** The name of the field a stored value is kept in: the last component of the left side (`ls_row-erdat` → `erdat`). */
function storedTarget(before: string): string {
  const target = before.replace(/=\s*$/, '').trimEnd().match(/([\w\/~>-]+)$/)?.[1] ?? '';
  return (target.split(/->|-|~/).pop() ?? target).toLowerCase();
}

/** The left side of the `=` in front of the value is a field that is kept: a structure component or a `SET` column. */
function storedField(before: string): boolean {
  const left = before.replace(/=\s*$/, '').trimEnd();
  const target = left.match(/([\w\/~>-]+)$/)?.[1] ?? '';
  if (/\bSET\b/i.test(left)) return true;
  // A component of a row built in place: `VALUE #( … erdat = sy-datum )`.
  if (/\bVALUE\s+[\w#\/]+\s*\(/i.test(left)) return true;
  return /\w-\w/.test(target);
}

/* ------------------------------------------------------------------ *
 * (2) Exit, BAdI and VOFM implementations: logic in the hook or delegated
 * ------------------------------------------------------------------ */

export type HookKind = 'user-exit' | 'customer-exit' | 'badi' | 'vofm';

export interface HookImplementation {
  kind: HookKind;
  /** The FORM, FUNCTION or METHOD name as written, upper-cased. */
  name: string;
  lineStart: number;
  lineEnd: number;
  /** Executable statements inside the hook — declarations are not counted. */
  statements: number;
  /** The class the hook hands its work to, when it does nothing else. */
  delegatedTo: string | null;
  /** Customer includes the hook pulls its logic from (`INCLUDE ZX…` in a customer exit). */
  includes: string[];
  /** For a BAdI method: the class it is implemented in, when the source names it. */
  owner?: string;
  /** For a BAdI method: which `CLASS … IMPLEMENTATION` block it stands in, counted from 1 (0: none). */
  ownerBlock?: number;
}

const VOFM_FORM = /^(KOBED|KOBEV|FRM_KONDI_WERT|FRM_KOND_BASIS|DATEN_KOPIEREN|BEDINGUNG_PRUEFEN)_\d+$/i;
const DECLARATION = new Set(['DATA', 'TYPES', 'CONSTANTS', 'FIELD-SYMBOLS', 'STATICS', 'TABLES', 'RANGES', 'CLASS-DATA']);
/** At most this many executable statements may stand beside the call for the hook to count as delegated. */
const DELEGATION_LIMIT = 3;

function hookKindOf(statement: AbapStatement, badiInterfaces: ReadonlySet<string>): { kind: HookKind; name: string } | null {
  const code = maskLiterals(statement.text);
  const form = /^FORM\s+([\w\/]+)/i.exec(code);
  if (form) {
    const name = form[1].toUpperCase();
    if (/^USEREXIT_\w+/.test(name)) return { kind: 'user-exit', name };
    if (VOFM_FORM.test(name)) return { kind: 'vofm', name };
    return null;
  }
  const fn = /^FUNCTION\s+([\w\/]+)/i.exec(code);
  if (fn && /^EXIT_\w+/i.test(fn[1])) return { kind: 'customer-exit', name: fn[1].toUpperCase() };
  const method = /^METHOD\s+([\w\/]+)~([\w\/]+)/i.exec(code);
  if (method) {
    const intf = method[1].toUpperCase();
    if (/^IF_EX_/.test(intf) || /^IF_BADI_/.test(intf) || badiInterfaces.has(intf)) {
      return { kind: 'badi', name: `${intf}~${method[2].toUpperCase()}` };
    }
  }
  return null;
}

const HOOK_END: Record<HookKind, string> = {
  'user-exit': 'ENDFORM',
  vofm: 'ENDFORM',
  'customer-exit': 'ENDFUNCTION',
  badi: 'ENDMETHOD',
};

/**
 * Every exit, BAdI or VOFM implementation in the source, with how much of its
 * logic stands in the hook itself. A hook that only hands its work to a class
 * moves with that class, and only the call is re-pointed; a hook holding the
 * logic moves statement by statement. A customer exit written as its include
 * (`ZX…`) without the `FUNCTION EXIT_…` frame is read as one hook when the
 * file name says so.
 */
export function readHookImplementations(statements: readonly AbapStatement[], fileName = '', options: EngineRuleOptions = {}): HookImplementation[] {
  const onlyCalls = options.engineReads === true;
  // A class that implements IF_BADI_INTERFACE implements a new BAdI through
  // whatever interface the BAdI definition names; those are BAdI methods too.
  const badiInterfaces = new Set<string>();
  let inDefinition: string[] | null = null;
  for (const s of statements) {
    if (/^CLASS\s+[\w\/]+\s+DEFINITION\b/i.test(s.text) && !/\b(DEFERRED|LOAD)\b/i.test(s.text)) inDefinition = [];
    else if (inDefinition && s.keyword === 'ENDCLASS') {
      if (inDefinition.includes('IF_BADI_INTERFACE')) for (const intf of inDefinition) if (intf !== 'IF_BADI_INTERFACE') badiInterfaces.add(intf);
      inDefinition = null;
    } else if (inDefinition) {
      const intf = /^INTERFACES\s+([\w\/]+)/i.exec(s.text)?.[1]?.toUpperCase();
      if (intf) inDefinition.push(intf);
    }
  }
  const out: HookImplementation[] = [];
  let owner: string | undefined;
  let ownerBlock = 0;
  for (let i = 0; i < statements.length; i++) {
    const impl = /^CLASS\s+([\w\/]+)\s+IMPLEMENTATION\b/i.exec(statements[i].text);
    if (impl) { owner = impl[1].toUpperCase(); ownerBlock += 1; }
    const hook = hookKindOf(statements[i], badiInterfaces);
    if (!hook) continue;
    const end = statements.findIndex((s, j) => j > i && s.keyword === HOOK_END[hook.kind]);
    const body = statements.slice(i + 1, end < 0 ? statements.length : end);
    const measured = measureHook(hook.kind, hook.name, statements[i].lineStart, (end < 0 ? statements[statements.length - 1] : statements[end]).lineEnd, body, onlyCalls);
    // An empty method is a stub the interface requires, not an implementation.
    if (measured.statements > 0 || measured.includes.length > 0) out.push(hook.kind === 'badi' ? { ...measured, ...(owner ? { owner } : {}), ownerBlock } : measured);
    if (end > i) i = end;
  }
  const file = fileName.replace(/\.[^.]*$/, '').toUpperCase();
  if (out.length === 0 && /^ZX\w+/.test(file) && statements.length > 0 && !statements.some((s) => /^(REPORT|PROGRAM|FUNCTION-POOL|CLASS|FORM|FUNCTION)$/.test(s.keyword))) {
    out.push(measureHook('customer-exit', file, statements[0].lineStart, statements[statements.length - 1].lineEnd, [...statements], onlyCalls));
  }
  return out;
}

/** The class a statement hands work to (`ZCL_X=>run( )`, `NEW zcl_x( )`), `(object)` for a call through an object, or null. */
function delegationTargetOf(statement: AbapStatement): string | null {
  if (statement.keyword === 'RAISE') return null;
  const t = maskLiterals(statement.text).replace(/\b[ZY]\w*CX_\w+/gi, '');
  return /\b([ZY][\w\/]*)\s*=>\s*\w+/i.exec(t)?.[1] ?? /\bNEW\s+([ZY][\w\/]*)\s*\(/i.exec(t)?.[1] ?? /\bCALL\s+METHOD\s+([ZY][\w\/]*)\s*=>/i.exec(t)?.[1] ?? (/(->|\bCALL\s+METHOD\b)/i.test(t) ? '(object)' : null);
}

function measureHook(kind: HookKind, name: string, lineStart: number, lineEnd: number, body: readonly AbapStatement[], onlyCalls = false): HookImplementation {
  // An `INCLUDE ZX…` inside a customer exit is where its logic stands, so it
  // counts; an include of SAP's own does not.
  const executable = body.filter((s) => (!DECLARATION.has(s.keyword) && s.keyword !== 'INCLUDE') || /^INCLUDE\s+[ZY]/i.test(s.text));
  // A raised exception is no delegation, and neither is a call of an exception class.
  const classCall = executable.map(delegationTargetOf).find((c) => c);
  // From 3.0.18 (`onlyCalls`): delegated means the hook holds nothing but the
  // hand-over — creating the object (`CREATE OBJECT`, `NEW`, also only once:
  // `IF mo_x IS NOT BOUND. … ENDIF.`) and calling it. An assignment, a check on
  // data or a raise beside the call is logic in the hook.
  const handsOverOnly = !onlyCalls || executable.every((s) => delegationTargetOf(s) !== null
    || /^CREATE\s+OBJECT\b/i.test(s.text)
    || /^IF\s+(?:NOT\s+)?[\w/>-]+\s+IS\s+(?:NOT\s+)?BOUND\s*\.?$/i.test(s.text.trim())
    || s.keyword === 'ENDIF');
  const delegatedTo = classCall && executable.length <= DELEGATION_LIMIT && handsOverOnly ? classCall.toUpperCase() : null;
  const includes = executable.map((s) => /^INCLUDE\s+([ZY][\w\/]*)/i.exec(s.text)?.[1]?.toUpperCase()).filter((n): n is string => Boolean(n));
  return {
    kind, name, lineStart, lineEnd,
    statements: executable.length - includes.length,
    delegatedTo: delegatedTo === '(OBJECT)' ? 'an object of a class' : delegatedTo,
    includes,
  };
}

/* ------------------------------------------------------------------ *
 * (3) Form output
 * ------------------------------------------------------------------ */

export type FormTechnology = 'sapscript' | 'smart-forms' | 'adobe-forms';

export interface FormOutputUse {
  technology: FormTechnology;
  /** The function modules the source calls for it, in order of first call. */
  modules: string[];
  lineStart: number;
  lines: number[];
}

const FORM_MODULES: Array<{ technology: FormTechnology; re: RegExp }> = [
  { technology: 'sapscript', re: /^(OPEN_FORM|START_FORM|WRITE_FORM|WRITE_FORM_LINES|END_FORM|CLOSE_FORM|CONTROL_FORM)$/ },
  { technology: 'smart-forms', re: /^(SSF_FUNCTION_MODULE_NAME|SSF_OPEN|SSF_CLOSE|SSFCOMP_OPEN|SSFCOMP_CLOSE)$/ },
  { technology: 'adobe-forms', re: /^(FP_JOB_OPEN|FP_JOB_CLOSE|FP_FUNCTION_MODULE_NAME)$/ },
];

/** SAPscript, Smart Forms and Adobe Forms calls, one entry per technology. */
export function readFormOutput(statements: readonly AbapStatement[], units: ProgramUnits = readProgramUnits(statements)): FormOutputUse[] {
  const by = new Map<string, FormOutputUse>();
  statements.forEach((s, i) => {
    const fm = /^CALL\s+FUNCTION\s+'([\w\/]+)'/i.exec(s.text)?.[1]?.toUpperCase();
    if (!fm) return;
    const tech = FORM_MODULES.find((f) => f.re.test(fm))?.technology;
    if (!tech) return;
    const key = `${units.unitOf[i]}:${tech}`;
    const use = by.get(key) ?? { technology: tech, modules: [], lineStart: s.lineStart, lines: [] };
    if (!use.modules.includes(fm)) use.modules.push(fm);
    if (!use.lines.includes(s.lineStart)) use.lines.push(s.lineStart);
    by.set(key, use);
  });
  return [...by.values()].sort((a, b) => a.lineStart - b.lineStart);
}

/* ------------------------------------------------------------------ *
 * (4) ABAP proxies
 * ------------------------------------------------------------------ */

export interface AbapProxyUse {
  direction: 'consumer' | 'provider';
  /** The proxy class (consumer) or proxy interface (provider). */
  name: string;
  lineStart: number;
  /**
   * From 3.0.18, for a consumer proxy: whether the source shows a call of it —
   * an object of the class created or called. A class the source only defines
   * (`INHERITING FROM CL_PROXY_CLIENT`) and never calls is `false`.
   */
  called?: boolean;
}

/**
 * ABAP proxies the source defines, implements or calls.
 *
 * A consumer proxy is a class inheriting from `CL_PROXY_CLIENT`; it is called
 * through a class named `<prefix>CO_<service>` — counted as a call only where
 * the source also handles a proxy fault (`CX_AI_SYSTEM_FAULT`,
 * `CX_AI_APPLICATION_FAULT`), so an ordinary class with "CO_" in its name is
 * not mistaken for one. A provider (inbound) proxy is implemented through its
 * generated interface `<prefix>II_<service>`.
 *
 * From 3.0.18 (`engineReads`) the fault handling has to belong to the class: a
 * `TRY` whose `CATCH` names a proxy fault and whose body creates or calls the
 * class, or an object declared with it. A fault caught elsewhere in the source
 * makes no `CO_` class a proxy. A consumer proxy says whether the source shows
 * a call of it (`called`).
 */
export function readAbapProxies(statements: readonly AbapStatement[], options: EngineRuleOptions = {}): AbapProxyUse[] {
  const reads = options.engineReads === true;
  const out: AbapProxyUse[] = [];
  const seen = new Set<string>();
  const add = (use: AbapProxyUse) => {
    const key = `${use.direction}:${use.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(use);
  };
  const FAULT = /\bCX_AI_(SYSTEM|APPLICATION)_FAULT\b/i;
  const codes = statements.map((s) => maskLiterals(s.text));
  const handlesFault = codes.some((c) => FAULT.test(c));
  // From 3.0.18: objects declared with a class (`lo_proxy TYPE REF TO zco_x`),
  // by class, and the statements in the body of a TRY that catches a proxy fault.
  const refsOf = new Map<string, Set<string>>();
  const guarded = new Set<number>();
  if (reads) {
    for (const c of codes) {
      const ref = /^(?:DATA|CLASS-DATA|STATICS)\s*:?\s*([\w\/]+)\s+TYPE\s+REF\s+TO\s+([\w\/]+)/i.exec(c);
      if (ref) refsOf.set(ref[2].toUpperCase(), (refsOf.get(ref[2].toUpperCase()) ?? new Set()).add(ref[1].toUpperCase()));
      const inline = /^DATA\(\s*([\w\/]+)\s*\)\s*=\s*NEW\s+([\w\/]+)\s*\(/i.exec(c);
      if (inline) refsOf.set(inline[2].toUpperCase(), (refsOf.get(inline[2].toUpperCase()) ?? new Set()).add(inline[1].toUpperCase()));
    }
    const open: Array<{ body: number[]; inBody: boolean; catchesFault: boolean }> = [];
    statements.forEach((s, i) => {
      if (s.keyword === 'TRY') { open.forEach((t) => t.inBody && t.body.push(i)); open.push({ body: [], inBody: true, catchesFault: false }); return; }
      const top = open[open.length - 1];
      if (!top) return;
      if (s.keyword === 'CATCH' || s.keyword === 'CLEANUP') {
        top.inBody = false;
        if (s.keyword === 'CATCH' && FAULT.test(codes[i])) top.catchesFault = true;
        return;
      }
      if (s.keyword === 'ENDTRY') {
        open.pop();
        if (top.catchesFault) for (const j of top.body) guarded.add(j);
        return;
      }
      for (const t of open) if (t.inBody) t.body.push(i);
    });
  }
  const mentions = (code: string, name: string): boolean => {
    const names = [name, ...(refsOf.get(name) ?? [])].map((n) => n.replace(/[/]/g, '\\/'));
    return new RegExp(String.raw`(?<![\w/-])(?:${names.join('|')})(?![\w/])`, 'i').test(code);
  };
  const callsOf = (name: string): boolean => {
    const refs = [...(refsOf.get(name) ?? [])].map((n) => n.replace(/[/]/g, '\\/'));
    return codes.some((c) => new RegExp(String.raw`\bNEW\s+${name.replace(/[/]/g, '\\/')}\s*\(|\bCREATE\s+OBJECT\s+[\w/]+\s+TYPE\s+${name.replace(/[/]/g, '\\/')}\b`, 'i').test(c)
      || (refs.length > 0 && new RegExp(String.raw`(?<![\w/-])(?:${refs.join('|')})\s*->|\bCREATE\s+OBJECT\s+(?:${refs.join('|')})\b`, 'i').test(c)));
  };
  for (const [index, s] of statements.entries()) {
    const code = codes[index];
    const consumerDef = /^CLASS\s+([\w\/]+)\s+DEFINITION\b[\s\S]*\bINHERITING\s+FROM\s+CL_PROXY_CLIENT\b/i.exec(code);
    if (consumerDef) {
      const name = consumerDef[1].toUpperCase();
      add({ direction: 'consumer', name, lineStart: s.lineStart, ...(reads ? { called: callsOf(name) } : {}) });
      continue;
    }
    const provider = /^INTERFACES\s+([ZY][\w\/]*II_[\w\/]+)/i.exec(code);
    if (provider) { add({ direction: 'provider', name: provider[1].toUpperCase(), lineStart: s.lineStart }); continue; }
    if (!handlesFault) continue;
    const consumerUse = /\b(?:TYPE\s+REF\s+TO|NEW|TYPE)\s+([ZY][\w\/]*?CO_[\w\/]+)/i.exec(code);
    if (!consumerUse) continue;
    const name = consumerUse[1].toUpperCase();
    if (reads && ![...guarded].some((j) => mentions(codes[j], name))) continue;
    add({ direction: 'consumer', name, lineStart: s.lineStart, ...(reads ? { called: true } : {}) });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The customer's own enhancement point
 * ------------------------------------------------------------------ */

/**
 * The program unit each statement belongs to, and the unit's name.
 *
 * A unit starts at `REPORT`, `PROGRAM`, `FUNCTION-POOL`, `CLASS-POOL`,
 * `INTERFACE-POOL`, `FUNCTION` or a global `CLASS … DEFINITION PUBLIC`. The
 * rules that say one thing per program (the server's time, form output, the
 * program an enhancement point is declared in) answer per unit, so two programs
 * read as one file answer as they did apart (tests/abap-metamorphic.spec.ts,
 * "concatenation is union"). Statements before the first unit statement belong
 * to a unit named after the file (without extension).
 */
export interface ProgramUnits {
  /** `unitOf[i]` is the unit of `statements[i]`. */
  unitOf: number[];
  /** The upper-cased name of each unit. */
  names: string[];
}

const UNIT_START = /^(?:(?:REPORT|PROGRAM|FUNCTION-POOL|CLASS-POOL|INTERFACE-POOL|FUNCTION)\s+([\w\/]+)|CLASS\s+([\w\/]+)\s+DEFINITION\b[\s\S]*\bPUBLIC\b)/i;

export function readProgramUnits(statements: readonly AbapStatement[], fileName = ''): ProgramUnits {
  const names: string[] = [fileName.replace(/\.[^.]*$/, '').toUpperCase()];
  const unitOf: number[] = [];
  let current = 0;
  for (const s of statements) {
    const m = UNIT_START.exec(s.text);
    if (m) {
      const name = (m[1] ?? m[2]).toUpperCase();
      // The first unit statement names the unit the file opened, unless code stood before it.
      if (unitOf.length === 0) names[0] = name;
      else { names.push(name); current = names.length - 1; }
    }
    unitOf.push(current);
  }
  return { unitOf, names };
}

/**
 * True when an `ENHANCEMENT-POINT` / `ENHANCEMENT-SECTION` is the customer's
 * own: declared in a program of the customer namespace (Z, Y), for enhancement
 * spots that are all in the customer namespace. Such a point enhances no SAP
 * object — it is an option the customer offers in its own code. A point for an
 * SAP spot, in a program that is not the customer's, or in one whose name the
 * source does not give, stays what it was.
 */
export function isOwnEnhancementPoint(statementText: string, programName: string): boolean {
  if (!CUSTOMER.test(programName)) return false;
  const spots = /\bSPOTS\s+([\w\/\s]+?)(?:\s+(?:STATIC|INCLUDE\s+BOUND))?\s*\.?$/i.exec(maskLiterals(statementText).trim())?.[1];
  if (!spots) return false;
  const names = spots.trim().split(/\s+/).filter((n) => !/^(STATIC|INCLUDE|BOUND)$/i.test(n));
  return names.length > 0 && names.every((n) => CUSTOMER.test(n));
}
