/**
 * The engine-case runtime: runs engine cases against a package's call contract
 * and judges the answers — no model-written assertion anywhere.
 *
 * Two halves, and they never run in the same process:
 *   - the COLLECTOR (`collectEngineCase`) runs in the process that executes the
 *     package and only records what the contract answered — raw outcomes, no
 *     verdict;
 *   - the JUDGE (`judgeEngineCase`) runs in a trusted process that never
 *     imports the package, and turns those answers into verdicts against the
 *     expectations it holds itself.
 *
 * The package's code never runs as a peer of the collector.
 * The process that executes it first calls SES's
 * `lockdown()` — every JavaScript intrinsic (Object.prototype, JSON, Function,
 * Array.prototype, …) is frozen — and then evaluates the package in a
 * `Compartment` (`createConfinement`): a global object of its own that holds
 * only the endowments listed there, no `process`, no `require` of Node's
 * modules beyond a short allowlist of hardened stand-ins, and an inert
 * `Function` constructor. The collector, the outcome writer and the response
 * channel live outside the compartment, and nothing the compartment can reach
 * leads back to them. The expectations of a case are never handed to the
 * package either: it sees the requests, nothing else. What the package can
 * still do is choose its answers — which is what is being tested.
 *
 * ONE source, used in three places:
 *   - the isolated test runner (roadmap 8.9): the app sends this file as
 *     `__cc_engine/runtime.mjs` beside the generated code, and the engine
 *     driver (`lib/test-sandbox/engine-suite.ts`) locks the process down,
 *     loads the contract into a compartment, collects with this runtime and
 *     prints one outcome line per case — hash-bound like every file of a run.
 *     The app carries it as `ENGINE_RUNTIME_JS` (`lib/test-sandbox/engine-runtime.ts`),
 *     generated from this file by `node scripts/acceptance/sync-engine-runtime.mjs`;
 *     `tests/engine-call-contract.spec.ts` fails when the two differ.
 *   - the app judges those lines (`lib/engine-case-run.ts`, `engineVerdicts`).
 *   - the acceptance harness: the sandboxed executor (`executor.mjs`) locks
 *     down, confines and collects, the harness process (`../engine-cases.mjs`) judges.
 * The failure-pattern probes reach a package through the same confinement:
 * `createProbeExecutor` answers their requests in the harness's executor and
 * in the runner's probe pass (`lib/test-sandbox/probe-suite.ts`, which sends
 * this file as `__cc_probe/runtime.mjs`).
 *
 * The contract a generated package exports (`lib/engine-call-contract.ts`, code-draft rule 24):
 *   CONTRACT = { version: 1, baseRequest, fields: { ORIGINAL_NAME: 'request.path' | 'list[].key' | null } }
 *   validate(request)        → { ok, errors: [{ field, rule, message }], normalized }
 *   simulate(request)        → { ok, runId, records, errors }
 *   getRun(runId)            → the stored run ({ runId, … }) or null
 *   compute(field, a, op, b) → the exact result as a decimal string at the field's places (op: + - * /)
 *   check(guard, request, values) → { ok: true, holds } | { ok: false, errors } — optional; the engine-led
 *                              scaffold exports it: whether the predicate of the original's check `guard`
 *                              (`G-0061`) holds on the request, with the computed values a derived check
 *                              reads (`values`, by original name). A case asks it where `set` cannot be
 *                              built through the request (a system field, a computed or internal value,
 *                              the record table itself) and for a check that ends a step early, which no
 *                              request outcome shows (3.0.12, owner 13.10.2026).
 *
 * Pure apart from calling the module it is handed and, in `createConfinement`,
 * the host capabilities its caller passes in. No imports.
 */

/** Where the contract module may stand, in the order they are tried. */
export const CALL_CONTRACT_PATHS = [
  'srv/engine-contract.ts',
  'srv/engine-contract.mjs',
  'srv/engine-contract.js',
  'engine-contract.ts',
  'engine-contract.mjs',
  'engine-contract.js',
];

export const CONTRACT_EXPORTS = ['CONTRACT', 'validate', 'simulate', 'getRun', 'compute'];

export const NOT_RUN_NO_CONTRACT = 'Not run — the code does not export the call contract';

/** Starts the line the engine suite prints per case: the marker, then `{ id, collected }` as JSON. */
export const ENGINE_OUTCOME_MARKER = '@@CC-ENGINE-OUTCOME ';

const NOT_EXPRESSIBLE = "not expressible through the call contract — asserted by the model's test only";

/**
 * The original's AUTHORITY-CHECKs in a Node package (3.0.17 criterion 3): `srv/lib/authority.ts` denies every check
 * (fail closed) unless `CC_AUTHORITY_DEMO=grant` is in its environment. The engine cases run with that grant — set
 * explicitly by the caller (`createConfinement({ authorityGrant: true })`, the generated test file) and said in the
 * report — so they test what follows the authorization; a case with `authority: 'denied'` runs without it and proves
 * the seam refuses. A refusal of the package names its check (`… the authorization check at L197 …`); `AUTHORITY_REFUSAL`
 * matches it to carry the reason a base request was refused, and it does not decide whether a case passes.
 */
export const AUTHORITY_DEMO_ENV = 'CC_AUTHORITY_DEMO';
const AUTHORITY_REFUSAL = /authorization check at L\d+/i;

/** The first error message of an answer that names an authorization check, or undefined. */
function authorityRefusalOf(answer) {
  const list = Array.isArray(answer?.errors) ? answer.errors : [];
  for (const e of list.slice(0, 20)) {
    const m = isObject(e) && typeof e.message === 'string' ? e.message : '';
    if (AUTHORITY_REFUSAL.test(m)) return m.slice(0, 240);
  }
  return undefined;
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Errors JavaScript throws by itself: a crash, not a refusal the code decided on. */
const CRASHES = new Set(['TypeError', 'ReferenceError', 'SyntaxError']);

/** The request path the contract maps an original field name to. */
export function resolveField(contract, name) {
  const fields = isObject(contract?.fields) ? contract.fields : {};
  const upper = String(name).toUpperCase();
  const keys = Object.keys(fields);
  const find = (n) => keys.find((k) => k.toUpperCase() === n);
  let key = find(upper);
  if (key === undefined && upper.includes('-')) key = find(upper.slice(upper.lastIndexOf('-') + 1));
  if (key === undefined) return { path: null, reason: `the contract maps no request field for ${upper}` };
  const path = fields[key];
  if (path === null) return { path: null, reason: `the contract marks ${upper} as internal (not part of a request)` };
  if (typeof path !== 'string' || !path.trim()) return { path: null, reason: `the contract's mapping for ${upper} is not a request path` };
  return { path: path.trim() };
}

/** `a.b` → { list: null, key: ['a', 'b'] }; `list[].key` → { list: ['list'], key: ['key'] }. */
function splitPath(path) {
  const at = path.indexOf('[]');
  if (at === -1) return { list: null, key: path.split('.').filter(Boolean) };
  return {
    list: path.slice(0, at).split('.').filter(Boolean),
    key: path.slice(at + 2).replace(/^\./, '').split('.').filter(Boolean),
  };
}

function getAt(obj, keys) {
  let cur = obj;
  for (const k of keys) {
    if (!isObject(cur) && !Array.isArray(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

function setAt(obj, keys, value) {
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!isObject(cur[keys[i]])) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  const last = keys[keys.length - 1];
  if (value && value.__missing) delete cur[last];
  else if (value && value.__empty) cur[last] = Array.isArray(cur[last]) ? [] : '';
  else cur[last] = value;
}

/** The current value of a mapped field in a request (a list field: of its first record). */
export function readField(request, path) {
  const p = splitPath(path);
  if (!p.list) return getAt(request, p.key);
  const list = getAt(request, p.list);
  return Array.isArray(list) && list.length > 0 ? getAt(list[0], p.key) : undefined;
}

function valueFor(to, contract, base) {
  if (!isObject(to)) return { error: 'the call names no value' };
  if ('value' in to) return { value: to.value };
  if (to.special === 'NaN') return { value: NaN };
  if (to.special === 'Infinity') return { value: Infinity };
  if (to.special === '-Infinity') return { value: -Infinity };
  if (to.special === 'missing') return { value: { __missing: true } };
  if (to.special === 'empty') return { value: { __empty: true } };
  if (to.special === 'filled') return { value: { __filled: true } };
  const other = to.sameAs ?? to.differentFrom;
  if (typeof other === 'string') {
    const r = resolveField(contract, other);
    if (!r.path) return { error: r.reason };
    const v = readField(base, r.path);
    if (v === undefined) return { error: `the base request has no value for ${other.toUpperCase()}` };
    if (to.sameAs !== undefined) return { value: v };
    return { value: typeof v === 'number' ? v + 1 : `${String(v)}X` };
  }
  return { error: 'the call names no value' };
}

/** The base request's rows of an original table (`GT_ORDERS` → `orders`; none handed in: empty), or null for a non-table. */
export function baseListOf(contract, field) {
  const base = isObject(contract?.baseRequest) ? contract.baseRequest : null;
  if (!base) return null;
  const stem = String(field).toLowerCase().replace(/^(?:gt|lt|it|mt|t)_/, '');
  const key = stem.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
  if (Array.isArray(base[key])) return base[key];
  // A table the base request does not hand in at all starts the check empty, like an empty list.
  return /^(?:gt|lt|it|mt)_/i.test(String(field)) ? [] : null;
}

/** The request one call sends, or `{ notRunnable }` with the reason. */
export function buildRequest(contract, call) {
  if (call.mode === 'empty') return { request: {} };
  if (!isObject(contract?.baseRequest)) return { notRunnable: 'the contract has no baseRequest' };
  const base = structuredClone(contract.baseRequest);
  const request = structuredClone(base);
  let appended = null;
  for (const s of call.set ?? []) {
    const r = resolveField(contract, s.field);
    if (!r.path) return { notRunnable: r.reason };
    const v = valueFor(s.to, contract, base);
    if (v.error) return { notRunnable: v.error };
    const p = splitPath(r.path);
    if (v.value && v.value.__filled) {
      // The base request's own value, which must be filled: without one the case shows nothing about the check.
      const cur = p.list ? readField(request, r.path) : getAt(request, p.key);
      if (cur === undefined || cur === null || cur === '' || cur === 0 || (Array.isArray(cur) && cur.length === 0)) {
        return { notRunnable: `the base request has no value for ${String(s.field).toUpperCase()}, so it cannot show the check with it filled` };
      }
      continue;
    }
    if (!p.list) {
      setAt(request, p.key, v.value);
      continue;
    }
    const list = getAt(request, p.list);
    if (!Array.isArray(list) || list.length === 0) return { notRunnable: `the base request has no record in ${p.list.join('.')}` };
    if (call.mode === 'append') {
      if (!appended) {
        appended = structuredClone(list[0]);
        list.push(appended);
      }
      setAt(appended, p.key, v.value);
    } else {
      for (const rec of list) setAt(rec, p.key, v.value);
    }
  }
  if (call.mode === 'append' && !appended) {
    // Nothing to change on the copy (a passing value "as in the base"): append a copy of the first record.
    const listPath = Object.values(contract.fields ?? {}).find((p) => typeof p === 'string' && p.includes('[]'));
    if (!listPath) return { notRunnable: 'the contract maps no record list to append to' };
    const list = getAt(request, splitPath(listPath).list);
    if (!Array.isArray(list) || list.length === 0) return { notRunnable: 'the base request has no record to append a copy of' };
    list.push(structuredClone(list[0]));
  }
  return { request };
}

/** The errors of an answer, reduced to what the judge reads. */
export function errorsOf(answer) {
  const list = Array.isArray(answer?.errors) ? answer.errors : [];
  return list.slice(0, 20).map((e) => ({
    field: isObject(e) && e.field !== undefined && e.field !== null ? String(e.field).slice(0, 120) : null,
    rule: isObject(e) && e.rule !== undefined && e.rule !== null ? String(e.rule).slice(0, 40) : null,
  }));
}

const sameField = (errField, name, path) => {
  if (!errField) return false;
  const f = String(errField).toLowerCase().replace(/\[\d*\]/g, '[]');
  const n = String(name).toLowerCase();
  const comp = n.includes('-') ? n.slice(n.lastIndexOf('-') + 1) : n;
  const p = path ? String(path).toLowerCase() : null;
  const pLast = p ? p.split(/[.\]]/).filter(Boolean).pop() : null;
  return f === n || f === comp || (p !== null && (f === p || f.endsWith(`.${pLast}`) || f === pLast));
};

const isZero = (v) => v === 0 || (typeof v === 'string' && /^[-+]?0+(\.0+)?$/.test(v.trim()));

const message = (err) => String(err && err.message ? err.message : err).split('\n')[0].slice(0, 200);

const crashed = (err) => {
  try {
    return Boolean(err) && typeof err === 'object' && CRASHES.has(String(err.name));
  } catch {
    return false;
  }
};

/** A value as the judge reads it, safe to print as JSON: decimals stay strings, everything else becomes text. */
function plain(v) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
  if (typeof v === 'bigint') return String(v);
  if (v === undefined) return undefined;
  try {
    const text = JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? String(x) : x));
    return text === undefined ? String(v) : text;
  } catch {
    return '[not serialisable]';
  }
}

/* ------------------------------------------------------------------ the judge */

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);

/** One answer of `validate` or `simulate` as the judge accepts it: `{ threw, crash } | { ok, errors, records? }`. */
function answerIn(raw) {
  if (!isObject(raw)) return null;
  if (raw.threw !== undefined) return { threw: str(String(raw.threw), 200), crash: raw.crash === true };
  const out = { ok: raw.ok === true ? true : raw.ok === false ? false : undefined, errors: errorsOf(raw) };
  if (typeof raw.records === 'number' && Number.isFinite(raw.records)) out.records = raw.records;
  // Words only, never a verdict: why a refused base request was refused (the original's authorization check).
  if (out.ok === false && typeof raw.authority === 'string' && AUTHORITY_REFUSAL.test(raw.authority)) out.authority = str(raw.authority, 240);
  return out;
}

/**
 * A raw outcome, read as untrusted data: it came from the process that ran the
 * package's code. Only the fields `judge` reads survive, each with its type.
 */
export function outcomeIn(raw) {
  if (!isObject(raw)) return null;
  if (typeof raw.notRunnable === 'string') return { notRunnable: raw.notRunnable.slice(0, 300) };
  const out = {};
  if (raw.threw !== undefined) {
    out.threw = String(raw.threw).slice(0, 200);
    out.crash = raw.crash === true;
  }
  if (raw.ok === true || raw.ok === false) out.ok = raw.ok;
  out.errors = errorsOf(raw);
  if (raw.normalized !== undefined) out.normalized = plain(raw.normalized);
  if (typeof raw.records === 'number' && Number.isFinite(raw.records)) out.records = raw.records;
  if (Array.isArray(raw.ids)) out.ids = raw.ids.slice(0, 2).map((x) => (typeof x === 'string' ? x.slice(0, 200) : null));
  if (raw.readBack !== undefined) out.readBack = typeof raw.readBack === 'string' ? raw.readBack.slice(0, 200) : null;
  if (raw.value !== undefined) out.value = plain(raw.value);
  if (typeof raw.path === 'string') out.path = raw.path.slice(0, 200);
  if (raw.run !== undefined) out.run = answerIn(raw.run);
  if (raw.via === 'check') {
    out.via = 'check';
    if (raw.holds === true || raw.holds === false) out.holds = raw.holds;
  }
  return out;
}

/**
 * Judge one call's outcome:
 * `{ threw?, crash?, ok?, errors?, normalized?, run?, records?, baseRecords?, ids?, readBack?, value?, notRunnable?, path? }`.
 * Returns `{ status: 'pass' | 'fail' | 'not-runnable', evidence }`.
 *
 * `validate` and `simulate` answer `{ ok, errors }` — a refusal is `ok: false`,
 * never an exception. A throw is a crash and fails the example, whatever was
 * expected; an answer without `ok: true` or `ok: false` is not the contract's
 * answer and fails too. `compute` has no answer shape for a refusal: there, an
 * `Error` it throws is the refusal, a TypeError, ReferenceError or SyntaxError
 * is a crash.
 */
export function judge(call, out) {
  if (!out) return { status: 'not-runnable', evidence: 'no outcome was reported' };
  if (out.notRunnable) return { status: 'not-runnable', evidence: out.notRunnable };
  const e = call.expect ?? {};
  const threw = out.threw !== undefined;
  const errors = out.errors ?? [];
  const said = threw ? `threw: ${out.threw}` : `ok: ${out.ok}; errors: ${JSON.stringify(errors)}`;
  const names = (err) => (e.rule && err.rule && err.rule.toUpperCase() === e.rule.toUpperCase()) || (e.field && sameField(err.field, e.field, out.path));
  const target = e.rule ?? e.field;
  if (out.via === 'check') {
    const want = call.check?.holds;
    if (want !== true && want !== false) return { status: 'not-runnable', evidence: 'the case names no expectation for the check' };
    const of = `the predicate of ${call.check.guard}`;
    if (threw) return { status: 'fail', evidence: `${of} threw (${out.threw})` };
    if (out.ok === false) return { status: 'not-runnable', evidence: `${of} could not be asked: the request is refused (${JSON.stringify(errors)})` };
    if (out.holds !== true && out.holds !== false) return { status: 'fail', evidence: `${of} answered without holds: true or false` };
    return out.holds === want
      ? { status: 'pass', evidence: `${of} ${want ? 'holds' : 'does not hold'}, as the original's condition` }
      : { status: 'fail', evidence: `${of} ${out.holds ? 'holds' : 'does not hold'}; the original's condition ${want ? 'holds' : 'does not hold'} on this input` };
  }
  if (call.op === 'check') return { status: 'not-runnable', evidence: 'no answer of the check was reported' };
  if (call.op === 'compute') {
    if (e.kind === 'refused') {
      if (!threw) return { status: 'fail', evidence: `accepted (${JSON.stringify(out.value ?? null)}), expected refused` };
      return out.crash
        ? { status: 'fail', evidence: `compute crashed (${out.threw}) — a refusal is an Error that says why, not a crash` }
        : { status: 'pass', evidence: `refused (${said})` };
    }
    if (e.kind === 'equals') {
      if (threw) return { status: 'fail', evidence: `compute threw: ${out.threw}` };
      const got = typeof out.value === 'string' ? out.value : JSON.stringify(out.value ?? null);
      return got === e.value ? { status: 'pass', evidence: `exactly ${got}` } : { status: 'fail', evidence: `${got}, expected exactly ${e.value}` };
    }
    return { status: 'not-runnable', evidence: `unknown expectation '${e.kind}' for compute` };
  }
  if (e.kind === 'distinct-runs') {
    if (threw) return { status: 'fail', evidence: `simulate threw: ${out.threw}` };
    const [a, b] = out.ids ?? [];
    if (!a || !b) return { status: 'fail', evidence: `simulate returned no run id (${JSON.stringify(out.ids ?? [])})` };
    if (a === b) return { status: 'fail', evidence: `two runs in the same millisecond got the same id ${a}` };
    // The precondition (QM review 18.10.2026, QM-02): two ids of runs that processed nothing prove no separation.
    const first = out.run;
    if (!first || first.ok !== true) return { status: 'fail', evidence: `the first run of the base request did not succeed (${JSON.stringify(first?.errors ?? [])}) — two ids of runs that processed nothing prove no separation` };
    if (typeof first.records !== 'number' || first.records < 1) return { status: 'fail', evidence: `the first run reported ${typeof first.records === 'number' ? `${first.records} records` : 'no record count'} — two ids of runs that processed no input prove no separation` };
    if (out.readBack !== a) return { status: 'fail', evidence: `getRun(${a}) after the second run returned ${JSON.stringify(out.readBack ?? null)} — the first run was overwritten or lost` };
    return { status: 'pass', evidence: `two ids (${a}, ${b}); the first run is still readable as itself` };
  }
  // validate / simulate: a throw is a crash, and an answer must say ok: true or ok: false.
  if (threw) return { status: 'fail', evidence: `threw instead of answering { ok, errors } (${out.threw})` };
  if (out.ok !== true && out.ok !== false) return { status: 'fail', evidence: `answered without ok: true or ok: false — not the contract's answer (${said})` };
  const refused = out.ok === false;
  switch (e.kind) {
    case 'accepted': {
      if (refused) return { status: 'fail', evidence: `refused, expected accepted (${said})` };
      if (e.normalized === undefined) return { status: 'pass', evidence: 'accepted' };
      if (out.normalized === undefined) return { status: 'fail', evidence: `accepted, but validate returned no normalized value for ${e.field}` };
      const got = typeof out.normalized === 'string' ? out.normalized : JSON.stringify(out.normalized);
      return got === e.normalized
        ? { status: 'pass', evidence: `accepted and held as ${got}` }
        : { status: 'fail', evidence: `accepted and held as ${got}, expected exactly ${e.normalized}` };
    }
    case 'refused': {
      if (!refused) return { status: 'fail', evidence: `accepted, expected refused (${said})` };
      const wrong = errors.filter((err) => err.rule && (e.notRules ?? []).some((r) => r.toUpperCase() === err.rule.toUpperCase()));
      if (wrong.length > 0) return { status: 'fail', evidence: `refused, but also by ${wrong.map((w) => w.rule).join(', ')} — the case breaks only ${target}` };
      if (!e.rule && !e.field) return { status: 'pass', evidence: `refused (${said})` };
      return errors.some(names)
        ? { status: 'pass', evidence: `refused, naming ${[e.rule, e.field].filter(Boolean).join(' / ')}` }
        : { status: 'fail', evidence: `refused, but no error names ${[e.rule, e.field].filter(Boolean).join(' or ')} (${said})` };
    }
    case 'not-refused-by':
      return refused && errors.some(names)
        ? { status: 'fail', evidence: `refused by ${target} although the value is on the passing side (${said})` }
        : { status: 'pass', evidence: refused ? `refused, but not by ${target} (${said})` : 'not refused' };
    case 'not-zero': {
      if (refused) return { status: 'pass', evidence: `refused as missing (${said})` };
      if (isZero(out.normalized)) return { status: 'fail', evidence: `a missing ${e.field} was held as ${JSON.stringify(out.normalized)}` };
      const held = `a missing ${e.field} is held as ${JSON.stringify(out.normalized ?? null)}, not 0`;
      // Held as missing is half of it: a run on that request must not compute it as 0 either.
      const run = out.run;
      if (!run) return { status: 'fail', evidence: `${held}; no run was reported for the same request` };
      if (run.threw !== undefined) return { status: 'fail', evidence: `${held}; simulate on the same request threw (${run.threw})` };
      if (run.ok === false) return { status: 'pass', evidence: `${held}; simulate refuses the request (errors: ${JSON.stringify(run.errors ?? [])})` };
      if (run.ok !== true) return { status: 'fail', evidence: `${held}; simulate answered without ok: true or ok: false` };
      return (run.errors ?? []).some(names)
        ? { status: 'pass', evidence: `${held}; simulate runs and reports ${e.field} as missing` }
        : { status: 'fail', evidence: `${held}, but simulate on the same request answered ok: true without naming ${e.field} — the missing value was computed as something (0?)` };
    }
    case 'zero':
      if (refused) return { status: 'fail', evidence: `0 was refused (${said})` };
      return isZero(out.normalized)
        ? { status: 'pass', evidence: `held as ${JSON.stringify(out.normalized)}` }
        : { status: 'fail', evidence: `0 was held as ${JSON.stringify(out.normalized ?? null)}` };
    case 'not-success':
      return refused ? { status: 'pass', evidence: `not a success (${said})` } : { status: 'fail', evidence: `an empty request was answered ok: true (records: ${out.records ?? 'not reported'})` };
    case 'records-delta': {
      if (refused) return { status: 'fail', evidence: `refused (${said}); expected the record to be ${e.delta === 0 ? 'skipped' : 'processed'}` };
      if (typeof out.records !== 'number' || typeof out.baseRecords !== 'number') return { status: 'fail', evidence: 'simulate reported no record count (records)' };
      const want = out.baseRecords + e.delta;
      return out.records === want
        ? { status: 'pass', evidence: `${out.records} records (base ${out.baseRecords})` }
        : { status: 'fail', evidence: `${out.records} records, expected ${want} (base ${out.baseRecords})` };
    }
    default:
      return { status: 'not-runnable', evidence: `unknown expectation '${e.kind}'` };
  }
}

/**
 * One case's verdict from its examples: Failed when any example failed, Passed
 * only when every example ran and passed, otherwise Not run with the reason —
 * a case that ran in part says how much of it ran.
 */
export function caseVerdict(examples) {
  if (examples.some((x) => x.status === 'fail')) return { status: 'Failed' };
  if (examples.length > 0 && examples.every((x) => x.status === 'pass')) return { status: 'Passed' };
  const reasons = [...new Set(examples.filter((x) => x.status !== 'pass').map((x) => x.evidence).filter(Boolean))];
  const passed = examples.filter((x) => x.status === 'pass').length;
  if (passed > 0) {
    return {
      status: 'Not run',
      reason: `ran in part — ${passed} of ${examples.length} examples passed through the call contract; ${examples.length - passed} could not run: ${reasons.join('; ')}`,
    };
  }
  return { status: 'Not run', reason: reasons.length > 0 ? reasons.join('; ') : 'no example of this case can be expressed through the call contract' };
}

/**
 * The positive control: the base request passes `validate` and `simulate`, each
 * with `ok: true`. Without it a "refused" verdict would prove nothing — the
 * mapping, not the case, would be refused. `{ ok: true, baseRecords }` or
 * `{ ok: false, reason, cause? }`, from the raw control `collectEngineCase`
 * reports. `cause: 'base-threw'` when validate accepted the base request and
 * simulate threw on it — the code behind the contract threw, not the mapping.
 * The verdict stays Not run here (a recorded run keeps the model's verdict for
 * it); the engine-led generation counts it against the written functions.
 */
export function judgeControl(control) {
  if (!isObject(control)) return { ok: false, reason: 'no positive control was reported' };
  if (typeof control.loadFailure === 'string') {
    return { ok: false, reason: `the call contract cannot run in the confined sandbox: ${control.loadFailure.slice(0, 300)}` };
  }
  if (Array.isArray(control.missing) && control.missing.length > 0) {
    return { ok: false, reason: `${NOT_RUN_NO_CONTRACT} (it lacks ${control.missing.map((m) => String(m).slice(0, 40)).join(', ')})` };
  }
  if (control.noBase === true) return { ok: false, reason: 'the contract has no baseRequest' };
  const v = answerIn(control.validate);
  // The scaffold's contract refuses a base request that lacks an obligatory
  // field the original gives no valid value for — the cases are not run, and
  // nothing about the mapping or the code is wrong.
  const missingBase = typeof v?.threw === 'string' ? v.threw.match(/^Not run — (no valid base value known for .+)$/) : null;
  if (missingBase) return { ok: false, reason: missingBase[1] };
  if (!v || v.threw !== undefined || v.ok !== true) {
    return { ok: false, reason: `the contract's baseRequest is not accepted by validate (${v?.threw ?? JSON.stringify(v?.errors ?? [])}) — the mapping does not fit the code` };
  }
  const s = answerIn(control.simulate);
  if (s && s.threw !== undefined) {
    // validate accepted the base request, so the fields fit: the throw came
    // from the code simulate runs behind the contract. Not a mapping problem —
    // `cause` lets a caller that knows whose code that is count it as a failure.
    return { ok: false, cause: 'base-threw', reason: `the code behind the contract threw on the accepted baseRequest in simulate (${s.threw})` };
  }
  if (s && s.ok === false && typeof s.authority === 'string') {
    // Refused by the original's authorization check, not by the mapping (3.0.17 criterion 3): the run did not grant it.
    return {
      ok: false,
      cause: 'authority',
      reason: `the contract's baseRequest is refused by the original's authorization check (${s.authority}) — srv/lib/authority.ts denies every check until it is granted, and this run did not grant it (${AUTHORITY_DEMO_ENV}=grant, test only)`,
    };
  }
  if (!s || s.ok === false) {
    return { ok: false, reason: `the contract's baseRequest is refused by simulate (${JSON.stringify(s?.errors ?? [])}) — the mapping does not fit the code` };
  }
  if (s.ok !== true) return { ok: false, reason: "simulate does not answer the contract's baseRequest with ok: true — the mapping does not fit the code" };
  if (typeof s.records !== 'number') return { ok: false, reason: 'simulate reports no record count (records) for the base request' };
  return { ok: true, baseRecords: s.records };
}

/**
 * Judge one engine case (`{ id, examples: [{ input, expected, call? }] }`) from
 * what the collector reported for it. The expectations come from `kase`, which
 * the judging side holds itself; `collected` is untrusted data. Returns
 * `{ status: 'Passed' | 'Failed' | 'Not run', reason?, examples: [{ input, status, evidence }] }`.
 */
export function judgeEngineCase(kase, collected) {
  const control = judgeControl(isObject(collected) ? collected.control : undefined);
  if (!control.ok) return { status: 'Not run', reason: control.reason, ...(control.cause ? { cause: control.cause } : {}), examples: [] };
  const reported = Array.isArray(collected.examples) ? collected.examples : [];
  const examples = [];
  (kase.examples ?? []).forEach((e, i) => {
    if (!e.call) {
      examples.push({ input: e.input, status: 'not-runnable', evidence: NOT_EXPRESSIBLE });
      return;
    }
    const out = outcomeIn(reported[i]);
    if (out && e.call.expect?.kind === 'records-delta') out.baseRecords = control.baseRecords;
    examples.push({ input: e.input, ...judge(e.call, out) });
  });
  const verdict = caseVerdict(examples);
  return { status: verdict.status, ...(verdict.reason ? { reason: verdict.reason } : {}), examples };
}

/* -------------------------------------------------------------- the collector */

/**
 * Why an error is the sandbox's and not the package's, or null: a module or a
 * global the confinement does not provide (`createConfinement`). Without hooks
 * (code that runs the package unconfined, the specs) nothing is the sandbox's.
 */
function sandboxReason(state, err) {
  const hook = state && state.hooks && state.hooks.notRunnable;
  if (typeof hook !== 'function') return null;
  try {
    const reason = hook(err);
    return typeof reason === 'string' && reason ? reason.slice(0, 300) : null;
  } catch {
    return null;
  }
}

async function attempt(fn, state) {
  try {
    return { answer: await fn() };
  } catch (err) {
    const reason = sandboxReason(state, err);
    if (reason) return { notRunnable: reason };
    return { threw: message(err), crash: crashed(err) };
  }
}

/** A `validate`/`simulate` answer as raw data: `{ notRunnable } | { threw, crash } | { ok, errors, records? }`. */
function answerOf(r) {
  if (r.notRunnable !== undefined) return { notRunnable: r.notRunnable };
  if (r.threw !== undefined) return { threw: r.threw, crash: r.crash };
  const out = { ok: r.answer?.ok === true ? true : r.answer?.ok === false ? false : undefined, errors: errorsOf(r.answer) };
  if (typeof r.answer?.records === 'number') out.records = r.answer.records;
  const authority = out.ok === false ? authorityRefusalOf(r.answer) : undefined;
  if (authority !== undefined) out.authority = authority;
  return out;
}

/**
 * Per-module state: the raw positive control, collected once, and the hooks of
 * the confinement the module runs in (`createConfinement(...).hooks`):
 * `freezeClock(at) → restore` for the package's clock, `notRunnable(err)` for
 * an error the sandbox raised rather than the package. Without hooks the
 * collector freezes `Date.now` itself — only possible where nothing is locked
 * down, i.e. where the package runs unconfined (the specs).
 */
export function createEngineState(hooks = null) {
  return { control: undefined, hooks };
}

/**
 * Runs `fn` with the authorization grant withdrawn (`authority: 'denied'`): through the confinement's hook, or — where
 * the package runs unconfined (the generated test file, the specs) — on this process's environment, restored after.
 */
async function withoutAuthorityGrant(state, fn) {
  const hook = state && state.hooks && state.hooks.denyAuthority;
  let restore;
  if (typeof hook === 'function') restore = hook();
  else if (typeof process !== 'undefined' && process.env) {
    const had = Object.prototype.hasOwnProperty.call(process.env, AUTHORITY_DEMO_ENV);
    const before = process.env[AUTHORITY_DEMO_ENV];
    delete process.env[AUTHORITY_DEMO_ENV];
    restore = () => {
      if (had) process.env[AUTHORITY_DEMO_ENV] = before;
    };
  }
  try {
    return await fn();
  } finally {
    if (typeof restore === 'function') restore();
  }
}

function freezeClock(state, at) {
  const hook = state && state.hooks && state.hooks.freezeClock;
  if (typeof hook === 'function') return hook(at);
  const realNow = Date.now;
  Date.now = () => at;
  return () => {
    Date.now = realNow;
  };
}

async function collectControl(mod, state) {
  if (state.control) return state.control;
  const missing = CONTRACT_EXPORTS.filter((name) => mod[name] === undefined);
  if (missing.length > 0) return (state.control = { missing });
  const contract = mod.CONTRACT;
  if (!isObject(contract) || !isObject(contract.baseRequest)) return (state.control = { noBase: true });
  const v = await attempt(() => mod.validate(structuredClone(contract.baseRequest)), state);
  if (v.notRunnable !== undefined) return (state.control = { loadFailure: v.notRunnable });
  const control = { validate: answerOf(v) };
  if (v.threw === undefined && v.answer?.ok === true) {
    const s = await attempt(() => mod.simulate(structuredClone(contract.baseRequest)), state);
    if (s.notRunnable !== undefined) return (state.control = { loadFailure: s.notRunnable });
    control.simulate = answerOf(s);
  }
  return (state.control = control);
}

/** Execute one call against the contract: the raw outcome `judge` reads. */
async function execute(mod, call, state) {
  const contract = mod.CONTRACT;
  if (call.op === 'compute') {
    const c = call.compute ?? {};
    let acc = c.start;
    try {
      for (const step of c.steps ?? []) acc = await mod.compute(String(c.field), acc, step.op, step.b);
    } catch (err) {
      const reason = sandboxReason(state, err);
      if (reason) return { notRunnable: reason };
      return { threw: message(err), crash: crashed(err) };
    }
    return { value: plain(acc) };
  }
  if (call.op === 'run-identity') {
    const restore = freezeClock(state, Date.now());
    try {
      const a = await attempt(() => mod.simulate(structuredClone(contract.baseRequest)), state);
      if (a.notRunnable !== undefined) return { notRunnable: a.notRunnable };
      if (a.threw !== undefined) return { threw: a.threw, crash: a.crash };
      // A base request that carries no input rows (the freight starter's deliveries are empty) cannot show two runs
      // apart: that is no evidence either way, so the case does not run — it is not a failure of the package.
      if (a.answer?.ok === true && a.answer?.records === 0) {
        return { notRunnable: 'the base request carries no input rows, so two runs of it process nothing and prove no separation' };
      }
      const b = await attempt(() => mod.simulate(structuredClone(contract.baseRequest)), state);
      if (b.notRunnable !== undefined) return { notRunnable: b.notRunnable };
      const idA = a.answer?.runId ?? null;
      const read = idA ? await attempt(() => mod.getRun(idA), state) : { answer: null };
      if (read.notRunnable !== undefined) return { notRunnable: read.notRunnable };
      return {
        ids: [idA, b.answer?.runId ?? null].map((x) => (x === null || x === undefined ? null : String(x))),
        readBack: read.answer && read.answer.runId !== undefined ? String(read.answer.runId) : null,
        // What the first run answered: two ids prove separation only for runs that processed input (QM-02).
        run: answerOf(a),
      };
    } finally {
      restore();
    }
  }
  if (call.op === 'check') return executeCheck(mod, call, state);
  const built = buildRequest(contract, call);
  if (built.notRunnable) {
    // The request cannot carry the value (a system field, a computed or internal value, the record
    // table): ask the check's predicate directly, where the contract offers it.
    if (call.check && typeof mod.check === 'function') return executeCheck(mod, call, state);
    return { notRunnable: built.notRunnable };
  }
  const field = call.expect?.field;
  const mapped = field ? resolveField(contract, field).path : null;
  if (call.op === 'validate') {
    const request = built.request;
    const forRun = call.expect?.kind === 'not-zero' ? structuredClone(request) : null;
    const r = await attempt(() => mod.validate(request), state);
    if (r.notRunnable !== undefined) return { notRunnable: r.notRunnable };
    const out = { ...answerOf(r), path: mapped };
    if (r.threw === undefined && mapped && r.answer && isObject(r.answer.normalized)) {
      const v = readField(r.answer.normalized, mapped);
      if (v !== undefined) out.normalized = plain(v);
    }
    // "Never computed as 0" is a claim about the run as well: the same request through simulate.
    if (forRun && r.threw === undefined) {
      const s = await attempt(() => mod.simulate(forRun), state);
      if (s.notRunnable !== undefined) return { notRunnable: s.notRunnable };
      out.run = answerOf(s);
    }
    return out;
  }
  const run = () => attempt(() => mod.simulate(built.request), state);
  const r = call.authority === 'denied' ? await withoutAuthorityGrant(state, run) : await run();
  if (r.notRunnable !== undefined) return { notRunnable: r.notRunnable };
  // A run that reached a stub says nothing about the authorization check it may not have reached.
  if (call.authority === 'denied' && r.threw === undefined && r.answer?.ok === true && r.answer?.complete === false) {
    return { notRunnable: 'the run reached a function still left as a stub, so the authorization check was not shown to refuse' };
  }
  return { ...answerOf(r), path: mapped };
}

/**
 * Ask the predicate of one check (`call.check.guard`) through the contract's
 * `check` export: the base request with every field of `set` the contract maps,
 * and the rest handed in as `values` by original name (a value the original
 * computes, a system field) — `{ special: 'empty' }` for the record table.
 */
async function executeCheck(mod, call, state) {
  if (!isObject(call.check) || typeof call.check.guard !== 'string') return { notRunnable: 'the case names no check' };
  if (typeof mod.check !== 'function') return { notRunnable: 'the contract exports no check — the predicate cannot be asked directly' };
  const contract = mod.CONTRACT;
  if (!isObject(contract?.baseRequest)) return { notRunnable: 'the contract has no baseRequest' };
  const base = structuredClone(contract.baseRequest);
  // The passing side "as in the base request" holds only where the base gives the checked field a value.
  if ((call.set ?? []).length === 0 && typeof call.check.field === 'string') {
    const r = resolveField(contract, call.check.field);
    const v = r.path ? readField(base, r.path) : undefined;
    if (r.path && (v === undefined || v === null || (typeof v === 'string' && v.trim() === ''))) {
      return { notRunnable: `the base request gives ${String(call.check.field).toUpperCase()} no value, so the passing side of ${call.check.guard} cannot be asked` };
    }
  }
  const mapped = [];
  const values = {};
  for (const s of call.set ?? []) {
    const r = resolveField(contract, s.field);
    if (r.path) {
      mapped.push(s);
      continue;
    }
    // Not part of the request: the check reads the field from the state the base request builds. A table the base
    // request hands in as a list (GT_ORDERS → orders) must have rows there, or the case shows nothing about the check.
    if (isObject(s.to) && s.to.special === 'filled') {
      const list = baseListOf(contract, s.field);
      if (list && list.length === 0) return { notRunnable: `the base request has no rows of ${String(s.field).toUpperCase()}, so it cannot show the check with it filled` };
      continue;
    }
    if (isObject(s.to) && s.to.special === 'empty') {
      values[String(s.field).toUpperCase()] = { special: 'empty' };
      continue;
    }
    const v = valueFor(s.to, contract, base);
    if (v.error) return { notRunnable: v.error };
    if (isObject(v.value)) return { notRunnable: `no value for ${String(s.field).toUpperCase()} can be handed to the check` };
    values[String(s.field).toUpperCase()] = v.value;
  }
  const built = buildRequest(contract, { ...call, mode: call.mode === 'append' ? 'request' : call.mode, set: mapped });
  if (built.notRunnable) return { notRunnable: built.notRunnable };
  const r = await attempt(() => mod.check(call.check.guard, built.request, values), state);
  if (r.notRunnable !== undefined) return { notRunnable: r.notRunnable };
  if (r.threw !== undefined) return { via: 'check', threw: r.threw, crash: r.crash };
  const a = r.answer;
  if (isObject(a) && a.known === false) return { notRunnable: `the contract's check does not know ${call.check.guard}` };
  if (isObject(a) && a.notFilled === true) return { notRunnable: `the predicate of ${call.check.guard} is not written (a stub)` };
  if (isObject(a) && Array.isArray(a.unsupported) && a.unsupported.length > 0) {
    return { notRunnable: `the predicate of ${call.check.guard} reads ${a.unsupported.slice(0, 4).map((m) => String(m).slice(0, 40)).join(', ')}, a computed value in no form the port fixes (only system fields and declared decimals are handed in)` };
  }
  if (isObject(a) && Array.isArray(a.missingValues) && a.missingValues.length > 0) {
    return { notRunnable: `the case gives no value for ${a.missingValues.slice(0, 4).map((m) => String(m).slice(0, 40)).join(', ')}, which the predicate of ${call.check.guard} reads` };
  }
  return { via: 'check', ok: a?.ok === true ? true : a?.ok === false ? false : undefined, errors: errorsOf(a), holds: a?.holds };
}

/**
 * Collect one engine case against a loaded contract module: the raw control and
 * one raw outcome per example (`null` for an example without a machine form).
 * No verdict — `judgeEngineCase` gives it, in a process without the package.
 * The result is plain JSON.
 */
export async function collectEngineCase(mod, kase, state = createEngineState()) {
  const control = await collectControl(mod, state);
  if (!judgeControl(control).ok) return { control, examples: [] };
  const examples = [];
  for (const e of kase.examples ?? []) examples.push(e.call ? await execute(mod, e.call, state) : null);
  return { control, examples };
}

/** Collect and judge in one process — for code that already runs the package in-process (tests). */
export async function runEngineCase(mod, kase, state = createEngineState()) {
  return judgeEngineCase(kase, await collectEngineCase(mod, kase, state));
}

/* ------------------------------------------------------------ the confinement */

/**
 * The options both executing processes pass to SES's `lockdown()` before any
 * code of the package exists in them. `overrideTaming: 'severe'` lets ordinary
 * code assign over a frozen inherited property (`err.name = …`, `obj.toString
 * = …`) on its own objects, which generated code does; it loosens nothing that
 * is frozen.
 */
export const LOCKDOWN_OPTIONS = { overrideTaming: 'severe', consoleTaming: 'unsafe', errorTaming: 'unsafe', stackFiltering: 'concise' };

/**
 * The Node modules the package may import inside the compartment, each a
 * hardened stand-in built here — never the module itself, whose objects lead
 * back to the process (a socket's prototype, a stream, a Buffer):
 *   - crypto: `randomUUID` only — run identities are part of the contract;
 *   - url: `pathToFileURL` / `fileURLToPath` as string conversions — the common
 *     "am I the entry point?" check of a server file;
 *   - http, https, net: a server whose `listen` binds nothing and is reported
 *     (FP-TEST-03), and connections that are refused and reported.
 * Anything else is refused, and the case is Not run with that reason.
 */
export const CONFINED_MODULES = ['crypto', 'url', 'http', 'https', 'net'];

/** Globals of a Node process the compartment does not provide: a use is the sandbox's limit, not the package's crash. */
const HOST_ONLY_GLOBALS = [
  'require', 'module', 'exports', '__dirname', '__filename', 'Buffer', 'URL', 'URLSearchParams', 'TextDecoderStream', 'TextEncoderStream',
  'setImmediate', 'clearImmediate', 'performance', 'AbortController', 'AbortSignal', 'Intl', 'Blob', 'File', 'FormData', 'Headers', 'Request',
  'Response', 'WebSocket', 'EventTarget', 'Event', 'MessageChannel', 'MessagePort', 'BroadcastChannel', 'navigator', 'WebAssembly',
  'SharedArrayBuffer', 'Atomics', 'FinalizationRegistry', 'WeakRef', 'DOMException', 'ReadableStream', 'WritableStream', 'TransformStream',
];

/**
 * After `lockdown()`: a confinement for one package. `host` holds the only
 * capabilities the stand-ins use, all taken by the trusted caller:
 *   `{ now(), random(), randomUUID(), getRandomValues(a), structuredClone(v),
 *      setTimeout, clearTimeout, setInterval, clearInterval,
 *      emit?(event), nodeEnv?, platform?, version?, authorityGrant? }`.
 * `authorityGrant: true` sets CC_AUTHORITY_DEMO=grant in the package's environment — for a test run only, said
 * by its caller — and `hooks.denyAuthority()` withdraws it for one call (`authority: 'denied'`), returning a restore.
 * Returns `{ load(source), setClock(clock), hooks, provides }`:
 *   - `load(source)` evaluates one CommonJS bundle of the package (esbuild's
 *     output; the caller bundles, nothing is resolved from disk in here) in a
 *     fresh compartment: `{ exports } | { failure }`;
 *   - `setClock({ kind: 'frozen', at } | { kind: 'tick', start, step } | null)`
 *     sets the clock the package reads (`Date.now()`, `new Date()`);
 *   - `hooks` go to `createEngineState`.
 * The compartment's global object holds exactly the names passed below plus
 * the frozen JavaScript intrinsics; its `Function`, `eval` and `Compartment`
 * evaluate only inside it, and `Function.prototype.constructor` is inert.
 */
export function createConfinement(host) {
  const { Compartment, harden } = globalThis;
  if (typeof Compartment !== 'function' || typeof harden !== 'function' || !Object.isFrozen(Object.prototype)) {
    throw new Error('createConfinement needs lockdown() first');
  }
  const emit = (event) => {
    try {
      if (typeof host.emit === 'function') host.emit(event);
    } catch {
      // the report channel is gone: nothing left to tell
    }
  };
  // The environment of the package loaded last: `hooks.denyAuthority` withdraws its grant for one call.
  let currentEnv = null;
  const refusals = new WeakSet();
  const refuse = (text) => {
    const err = new Error(text);
    refusals.add(err);
    return err;
  };
  const rethrowPlain = (fn) => {
    try {
      return fn();
    } catch (err) {
      // A host error object (a DOMException, a Node-internal TypeError) carries a host prototype: never hand it in.
      throw new TypeError(message(err));
    }
  };

  // The clock the package reads.
  let clock = null;
  const now = () => (clock ? clock() : host.now());
  const RealDate = Date;
  const ConfinedDate = function Date(...args) {
    if (new.target === undefined) return new RealDate(now()).toString();
    return Reflect.construct(RealDate, args.length === 0 ? [now()] : args, new.target);
  };
  Object.defineProperty(ConfinedDate, 'prototype', { value: RealDate.prototype, writable: false });
  Object.defineProperties(ConfinedDate, {
    now: { value: () => now() },
    parse: { value: (text) => RealDate.parse(text) },
    UTC: { value: (...args) => RealDate.UTC(...args) },
  });
  harden(ConfinedDate);

  const ConfinedMath = {};
  for (const key of Reflect.ownKeys(Math)) {
    if (key !== 'random') Object.defineProperty(ConfinedMath, key, { value: Math[key], enumerable: false });
  }
  Object.defineProperty(ConfinedMath, 'random', { value: () => host.random() });
  harden(ConfinedMath);

  // Timers: numbers in, numbers out — a host Timeout object never enters.
  const timers = new Map();
  let timerSeq = 0;
  const guarded = (fn, args) => () => {
    try {
      if (typeof fn === 'function') fn(...args);
    } catch {
      // the package's own asynchronous failure: not the executor's to crash on
    }
  };
  const later = (set, clear, repeat) => [
    (fn, ms, ...args) => {
      const id = ++timerSeq;
      const run = guarded(fn, args);
      const handle = set(() => {
        if (!repeat) timers.delete(id);
        run();
      }, Number(ms) || 0);
      timers.set(id, { clear, handle });
      return id;
    },
    (id) => {
      const t = timers.get(id);
      if (t) {
        t.clear(t.handle);
        timers.delete(id);
      }
    },
  ];
  const [setTimeoutC, clearTimeoutC] = later(host.setTimeout, host.clearTimeout, false);
  const [setIntervalC, clearIntervalC] = later(host.setInterval, host.clearInterval, true);

  const noop = () => undefined;
  const confinedConsole = harden({ log: noop, info: noop, warn: noop, error: noop, debug: noop, trace: noop, dir: noop, table: noop, group: noop, groupEnd: noop, time: noop, timeEnd: noop, assert: noop });
  const randomUUID = () => String(host.randomUUID());
  const confinedCrypto = harden({ randomUUID, getRandomValues: (array) => rethrowPlain(() => host.getRandomValues(array)) });

  const blocked = (kind) => () => {
    emit({ type: 'network', kind });
    throw refuse(`network access (${kind}) is not available in the confined sandbox`);
  };
  const describeListen = (args) => {
    const first = args[0];
    if (typeof first === 'number' || typeof first === 'string') return String(first);
    if (first && typeof first === 'object' && 'port' in first) return String(first.port);
    return 'unspecified';
  };
  const fakeServer = () => {
    const server = {
      listen(...args) {
        emit({ type: 'listen', port: describeListen(args) });
        return server;
      },
      close(cb) {
        if (typeof cb === 'function') setTimeoutC(cb, 0);
        return server;
      },
      on: () => server,
      once: () => server,
      off: () => server,
      address: () => null,
    };
    return server;
  };
  const httpLike = (name) =>
    harden({
      createServer: () => fakeServer(),
      Server: function Server() {
        return fakeServer();
      },
      request: blocked(`${name}.request`),
      get: blocked(`${name}.get`),
    });
  const toFileUrl = (p) => {
    const text = String(p).replace(/\\/g, '/');
    const href = `file://${text.startsWith('/') ? '' : '/'}${encodeURI(text)}`;
    return harden({ href, protocol: 'file:', pathname: href.slice(7), toString: () => href });
  };
  const fromFileUrl = (u) => {
    const text = typeof u === 'string' ? u : String(u && u.href);
    if (!text.startsWith('file://')) throw new TypeError('The URL must be of scheme file');
    return decodeURI(text.slice(7));
  };
  const modules = {
    crypto: harden({ randomUUID }),
    url: harden({ pathToFileURL: toFileUrl, fileURLToPath: fromFileUrl }),
    http: httpLike('http'),
    https: httpLike('https'),
    net: harden({
      createServer: () => fakeServer(),
      Server: function Server() {
        return fakeServer();
      },
      connect: blocked('net.connect'),
      createConnection: blocked('net.createConnection'),
      Socket: function Socket() {
        return blocked('net.Socket')();
      },
    }),
  };
  const confinedRequire = harden((spec) => {
    const name = String(spec).startsWith('node:') ? String(spec).slice(5) : String(spec);
    if (Object.prototype.hasOwnProperty.call(modules, name)) return modules[name];
    throw refuse(`the code imports '${String(spec).slice(0, 80)}', which the confined sandbox does not provide (it provides ${CONFINED_MODULES.join(', ')})`);
  });

  const hostGlobals = new Set(HOST_ONLY_GLOBALS);
  const missingGlobal = (name) => `the code uses the global '${name}', which the confined sandbox does not provide`;
  /**
   * The sandbox's reason for an error, or null when it is the package's own.
   * Inside a compartment an unknown global reads as undefined rather than
   * throwing, so each host-only global is installed as a getter that throws a
   * refusal; a ReferenceError is still recognised by its name
   * and message, never by `instanceof` across compartments.
   */
  const notRunnable = (err) => {
    try {
      if (err && (typeof err === 'object' || typeof err === 'function') && refusals.has(err)) return String(err.message);
      if (err && typeof err === 'object' && String(err.name) === 'ReferenceError') {
        const m = /^([A-Za-z_$][\w$]*) is not defined$/.exec(String(err.message));
        if (m && hostGlobals.has(m[1])) return missingGlobal(m[1]);
      }
    } catch {
      // an error object that cannot even be read is the package's own failure
    }
    return null;
  };

  return {
    provides: CONFINED_MODULES,
    hooks: harden({
      notRunnable,
      denyAuthority: () => {
        const env = currentEnv;
        if (!env || !Object.prototype.hasOwnProperty.call(env, AUTHORITY_DEMO_ENV)) return () => {};
        const before = env[AUTHORITY_DEMO_ENV];
        delete env[AUTHORITY_DEMO_ENV];
        return () => {
          env[AUTHORITY_DEMO_ENV] = before;
        };
      },
      freezeClock: (at) => {
        const previous = clock;
        clock = () => at;
        return () => {
          clock = previous;
        };
      },
    }),
    setClock(spec) {
      if (spec && spec.kind === 'frozen' && Number.isFinite(spec.at)) {
        const at = spec.at;
        clock = () => at;
      } else if (spec && spec.kind === 'tick' && Number.isFinite(spec.start) && Number.isFinite(spec.step)) {
        let t = spec.start;
        const step = spec.step;
        clock = () => (t += step);
      } else {
        clock = null;
      }
    },
    load(source) {
      // Per load: a process stand-in the package may write to without reaching anything.
      const env = {};
      if (typeof host.nodeEnv === 'string') env.NODE_ENV = host.nodeEnv;
      if (host.authorityGrant === true) env[AUTHORITY_DEMO_ENV] = 'grant';
      currentEnv = env;
      const sink = { write: () => true, isTTY: false, on: () => sink, once: () => sink, end: noop };
      const proc = {
        env,
        argv: [],
        execArgv: [],
        platform: String(host.platform ?? 'linux'),
        version: String(host.version ?? ''),
        versions: {},
        pid: 1,
        exitCode: undefined,
        stdout: sink,
        stderr: sink,
        cwd: () => '/',
        exit: (code) => {
          throw refuse(`the code called process.exit(${String(code ?? '')})`);
        },
        nextTick: (fn, ...args) => {
          Promise.resolve().then(guarded(fn, args));
        },
        on: () => proc,
        once: () => proc,
        off: () => proc,
        removeListener: () => proc,
        emit: () => false,
        emitWarning: noop,
        hrtime: Object.assign(() => [0, 0], { bigint: () => 0n }),
        memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }),
      };
      const compartment = new Compartment({
        globals: {
          console: confinedConsole,
          process: proc,
          Date: ConfinedDate,
          Math: ConfinedMath,
          crypto: confinedCrypto,
          setTimeout: setTimeoutC,
          clearTimeout: clearTimeoutC,
          setInterval: setIntervalC,
          clearInterval: clearIntervalC,
          queueMicrotask: (fn) => {
            Promise.resolve().then(guarded(fn, []));
          },
          structuredClone: (value) => rethrowPlain(() => host.structuredClone(value)),
          fetch: async () => blocked('fetch')(),
        },
        __options__: true,
      });
      // `global` is the compartment's own global object, as `globalThis` is.
      compartment.globalThis.global = compartment.globalThis;
      // A host-only global is not silently undefined: reading it is the sandbox's refusal, and the case is Not run.
      for (const name of HOST_ONLY_GLOBALS) {
        if (['require', 'module', 'exports', '__dirname', '__filename'].includes(name)) continue;
        Object.defineProperty(compartment.globalThis, name, {
          get() {
            throw refuse(missingGlobal(name));
          },
          configurable: false,
          enumerable: false,
        });
      }
      const module = { exports: {} };
      let factory;
      try {
        factory = compartment.evaluate(`(function (module, exports, require, __filename, __dirname) {\n${source}\n})`);
      } catch (err) {
        return { failure: `the code cannot be evaluated in the confined sandbox: ${message(err)}` };
      }
      try {
        factory(module, module.exports, confinedRequire, '/package/bundle.cjs', '/package');
      } catch (err) {
        return { failure: notRunnable(err) ?? `the code throws while it is loaded: ${message(err)}` };
      }
      return { exports: module.exports };
    },
  };
}

/* ------------------------------------------------------ the probe executor */

/**
 * The executing half of the failure-pattern probes (`../lib/probes.mjs`):
 * answers the probes' requests — `call`, `call-many`, `clock` — against the
 * modules a confinement loaded, the way the harness's executor (`executor.mjs`)
 * always answered them, and the probe pass of the isolated test runner
 * (`lib/test-sandbox/probe-suite.ts`) now answers them too (roadmap 3.0.12).
 *
 * Runs outside the compartment, after `lockdown()`, in the process that holds
 * the confinement. Every answer is plain JSON data (`plainData`) — never an
 * object of the package — and an error the confinement raised (a module or a
 * global it does not provide) is the sandbox's (`{ sandbox }`), not the
 * package's throw. The clock is the confinement's (`setClock`), a host
 * capability: the global `Date` is never touched. Instances are cached per
 * executor, so `create` and `get` of one store share it.
 *
 * `use(name, namespace)` registers a module under its adapter name;
 * `request(kind, payload)` answers one request.
 */
export function createProbeExecutor(confinement) {
  const modules = new Map();
  const instances = new Map();
  const say = (err) => String(err && err.message ? err.message : err).split('\n')[0].slice(0, 300);

  /**
   * A value as plain JSON data: functions and symbols dropped, a typed array read
   * as UTF-8 text, a BigInt as its digits, a cycle cut. Non-finite numbers become
   * null, as `JSON.stringify` writes them.
   */
  const plainData = (value, depth = 0, seen = new Set()) => {
    if (value === null || value === undefined) return value;
    const t = typeof value;
    if (t === 'string' || t === 'boolean') return value;
    if (t === 'number') return Number.isFinite(value) ? value : null;
    if (t === 'bigint') return String(value);
    if (t === 'function' || t === 'symbol') return undefined;
    if (depth > 40 || seen.has(value)) return '[cut]';
    seen.add(value);
    try {
      if (value instanceof Uint8Array) return new TextDecoder().decode(value);
      if (Array.isArray(value)) return value.map((v) => plainData(v, depth + 1, seen) ?? null);
      if (value instanceof Date) return value.toISOString();
      const outObj = {};
      for (const key of Object.keys(value)) {
        const v = plainData(value[key], depth + 1, seen);
        if (v !== undefined) outObj[key] = v;
      }
      return outObj;
    } catch (err) {
      return `[unreadable: ${say(err)}]`;
    } finally {
      seen.delete(value);
    }
  };

  const adapter = (text) => ({ adapter: text });

  /** The sandbox's refusal (a module or global it does not provide), or the package's own throw. */
  const thrown = (err) => {
    const reason = confinement.hooks.notRunnable(err);
    if (reason) return { sandbox: reason };
    let crash = false;
    try {
      crash = Boolean(err) && typeof err === 'object' && CRASHES.has(String(err.name));
    } catch {
      crash = true;
    }
    return { threw: true, error: say(err), crash };
  };

  /** Resolve and call a callable spec: `{ module, export, method?, construct?: [...], factory?: [...] }`. */
  const invoke = async (spec, args) => {
    if (!spec || !spec.module || !spec.export) return adapter('callable needs module and export');
    const mod = modules.get(spec.module);
    if (!mod) return adapter(`adapter names no module '${spec.module}'`);
    try {
      const exported = mod[spec.export] ?? (mod.default && mod.default[spec.export]);
      if (exported === undefined) return adapter(`module '${spec.module}' exports no '${spec.export}'`);
      let target = exported;
      let self;
      if (spec.construct || spec.factory) {
        const key = `${spec.module}|${spec.export}|${spec.construct ? 'new' : 'call'}|${JSON.stringify(spec.construct ?? spec.factory)}`;
        if (!instances.has(key)) {
          const ctorArgs = Array.isArray(spec.construct ?? spec.factory) ? spec.construct ?? spec.factory : [];
          instances.set(key, spec.construct ? new exported(...ctorArgs) : await exported(...ctorArgs));
        }
        self = instances.get(key);
        target = self;
      }
      if (spec.method) {
        const owner = self ?? exported;
        if (typeof owner[spec.method] !== 'function') return adapter(`'${spec.export}' has no method '${spec.method}'`);
        return { threw: false, value: plainData(await owner[spec.method](...(Array.isArray(args) ? args : []))) };
      }
      if (typeof target !== 'function') return adapter(`'${spec.export}' is not callable`);
      return { threw: false, value: plainData(await target(...(Array.isArray(args) ? args : []))) };
    } catch (err) {
      return thrown(err);
    }
  };

  return {
    use(name, namespace) {
      modules.set(String(name), namespace);
    },
    async request(kind, payload) {
      const p = payload && typeof payload === 'object' ? payload : {};
      switch (kind) {
        case 'call':
          return invoke(p.spec, p.args);
        case 'call-many': {
          const results = [];
          for (const args of Array.isArray(p.argsList) ? p.argsList : []) {
            const r = await invoke(p.spec, args);
            results.push(r);
            if (r.adapter || r.sandbox) break;
          }
          return { results };
        }
        case 'clock':
          confinement.setClock(p.clock ?? null);
          return {};
        default:
          return { transportError: `unknown request '${String(kind)}'` };
      }
    },
  };
}
