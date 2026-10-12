/**
 * The engine-case runtime: runs engine cases against a package's call contract
 * and judges the answers — no model-written assertion anywhere.
 *
 * ONE source, two places that execute it, both sandboxed:
 *   - the isolated test runner (roadmap 8.9): the app sends this file as
 *     `__cc_engine/runtime.mjs` beside the generated code, and the engine suite
 *     (`lib/test-sandbox/engine-suite.ts`) imports it — hash-bound like every
 *     file of a run. The app carries it as `ENGINE_RUNTIME_JS`
 *     (`lib/test-sandbox/engine-runtime.ts`), generated from this file by
 *     `node scripts/acceptance/sync-engine-runtime.mjs`;
 *     `tests/engine-call-contract.spec.ts` fails when the two differ.
 *   - the acceptance harness (`../engine-cases.mjs` → `engine-cases-child.mjs`).
 *
 * The contract a generated package exports (`lib/engine-call-contract.ts`, code-draft rule 24):
 *   CONTRACT = { version: 1, baseRequest, fields: { ORIGINAL_NAME: 'request.path' | 'list[].key' | null } }
 *   validate(request)        → { ok, errors: [{ field, rule, message }], normalized }
 *   simulate(request)        → { ok, runId, records, errors }
 *   getRun(runId)            → the stored run ({ runId, … }) or null
 *   compute(field, a, op, b) → the exact result as a decimal string at the field's places (op: + - * /)
 *
 * Pure apart from calling the module it is handed. No imports.
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

const NOT_EXPRESSIBLE = "not expressible through the call contract — asserted by the model's test only";

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

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
    field: isObject(e) && e.field !== undefined ? String(e.field).slice(0, 120) : null,
    rule: isObject(e) && e.rule !== undefined ? String(e.rule).slice(0, 40) : null,
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

/**
 * Judge one call's outcome:
 * `{ threw?, ok?, errors?, normalized?, records?, baseRecords?, ids?, readBack?, value?, notRunnable?, path? }`.
 * Returns `{ status: 'pass' | 'fail' | 'not-runnable', evidence }`.
 */
export function judge(call, out) {
  if (!out) return { status: 'not-runnable', evidence: 'no outcome was reported' };
  if (out.notRunnable) return { status: 'not-runnable', evidence: out.notRunnable };
  const e = call.expect ?? {};
  const refused = out.threw !== undefined || out.ok === false;
  const errors = out.errors ?? [];
  const said = out.threw !== undefined ? `threw: ${out.threw}` : `ok: ${out.ok}; errors: ${JSON.stringify(errors)}`;
  const names = (err) => (e.rule && err.rule && err.rule.toUpperCase() === e.rule.toUpperCase()) || (e.field && sameField(err.field, e.field, out.path));
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
      if (wrong.length > 0) return { status: 'fail', evidence: `refused, but also by ${wrong.map((w) => w.rule).join(', ')} — the case breaks only ${e.rule ?? e.field}` };
      if (out.threw !== undefined) return { status: 'pass', evidence: `refused (${said})` };
      if (!e.rule && !e.field) return { status: 'pass', evidence: `refused (${said})` };
      return errors.some(names)
        ? { status: 'pass', evidence: `refused, naming ${[e.rule, e.field].filter(Boolean).join(' / ')}` }
        : { status: 'fail', evidence: `refused, but no error names ${[e.rule, e.field].filter(Boolean).join(' or ')} (${said})` };
    }
    case 'not-refused-by':
      return refused && (out.threw !== undefined || errors.some(names))
        ? { status: 'fail', evidence: `refused by ${e.rule ?? e.field} although the value is on the passing side (${said})` }
        : { status: 'pass', evidence: refused ? `refused, but not by ${e.rule ?? e.field} (${said})` : 'not refused' };
    case 'not-zero':
      if (refused) return { status: 'pass', evidence: `refused as missing (${said})` };
      return isZero(out.normalized)
        ? { status: 'fail', evidence: `a missing ${e.field} was held as ${JSON.stringify(out.normalized)}` }
        : { status: 'pass', evidence: `a missing ${e.field} is held as ${JSON.stringify(out.normalized ?? null)}, not 0` };
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
    case 'distinct-runs': {
      const [a, b] = out.ids ?? [];
      if (!a || !b) return { status: 'fail', evidence: `simulate returned no run id (${JSON.stringify(out.ids ?? [])})` };
      if (a === b) return { status: 'fail', evidence: `two runs in the same millisecond got the same id ${a}` };
      if (out.readBack !== a) return { status: 'fail', evidence: `getRun(${a}) after the second run returned ${JSON.stringify(out.readBack ?? null)} — the first run was overwritten or lost` };
      return { status: 'pass', evidence: `two ids (${a}, ${b}); the first run is still readable as itself` };
    }
    case 'equals': {
      if (out.threw !== undefined) return { status: 'fail', evidence: `compute threw: ${out.threw}` };
      const got = typeof out.value === 'string' ? out.value : JSON.stringify(out.value);
      return got === e.value ? { status: 'pass', evidence: `exactly ${got}` } : { status: 'fail', evidence: `${got}, expected exactly ${e.value}` };
    }
    default:
      return { status: 'not-runnable', evidence: `unknown expectation '${e.kind}'` };
  }
}

/**
 * One case's verdict from its examples: Failed when any example failed, Passed
 * when at least one ran and none failed, otherwise Not run with the reason.
 */
export function caseVerdict(examples) {
  if (examples.some((x) => x.status === 'fail')) return { status: 'Failed' };
  if (examples.some((x) => x.status === 'pass')) return { status: 'Passed' };
  const reasons = [...new Set(examples.map((x) => x.evidence).filter(Boolean))];
  return { status: 'Not run', reason: reasons.length > 0 ? reasons.join('; ') : 'no example of this case can be expressed through the call contract' };
}

async function attempt(fn) {
  try {
    return { answer: await fn() };
  } catch (err) {
    return { threw: message(err) };
  }
}

/** Per-module state: the positive control and the base record count, computed once. */
export function createEngineState() {
  return { control: undefined };
}

/**
 * The positive control: the base request passes `validate` and `simulate`.
 * Without it a "refused" verdict would prove nothing — the mapping, not the
 * case, would be refused. `{ ok: true, baseRecords }` or `{ ok: false, reason }`.
 */
async function controlOf(mod, state) {
  if (state.control) return state.control;
  const missing = CONTRACT_EXPORTS.filter((name) => mod[name] === undefined);
  if (missing.length > 0) return (state.control = { ok: false, reason: `${NOT_RUN_NO_CONTRACT} (it lacks ${missing.join(', ')})` });
  const contract = mod.CONTRACT;
  if (!isObject(contract) || !isObject(contract.baseRequest)) return (state.control = { ok: false, reason: 'the contract has no baseRequest' });
  const v = await attempt(() => mod.validate(structuredClone(contract.baseRequest)));
  if (v.threw !== undefined || v.answer?.ok !== true) {
    return (state.control = { ok: false, reason: `the contract's baseRequest is not accepted by validate (${v.threw ?? JSON.stringify(errorsOf(v.answer))}) — the mapping does not fit the code` });
  }
  const s = await attempt(() => mod.simulate(structuredClone(contract.baseRequest)));
  if (s.threw !== undefined || s.answer?.ok === false) {
    return (state.control = { ok: false, reason: `the contract's baseRequest is refused by simulate (${s.threw ?? JSON.stringify(errorsOf(s.answer))}) — the mapping does not fit the code` });
  }
  if (typeof s.answer?.records !== 'number') return (state.control = { ok: false, reason: 'simulate reports no record count (records) for the base request' });
  return (state.control = { ok: true, baseRecords: s.answer.records });
}

/** Execute one call against the contract; the outcome `judge` reads. */
async function execute(mod, call, baseRecords) {
  const contract = mod.CONTRACT;
  if (call.op === 'compute') {
    const c = call.compute ?? {};
    let acc = c.start;
    try {
      for (const step of c.steps ?? []) acc = await mod.compute(String(c.field), acc, step.op, step.b);
    } catch (err) {
      return { threw: message(err) };
    }
    return { value: typeof acc === 'number' && !Number.isFinite(acc) ? String(acc) : acc };
  }
  if (call.op === 'run-identity') {
    const realNow = Date.now;
    const fixed = realNow();
    Date.now = () => fixed;
    try {
      const a = await attempt(() => mod.simulate(structuredClone(contract.baseRequest)));
      if (a.threw !== undefined) return { threw: a.threw };
      const b = await attempt(() => mod.simulate(structuredClone(contract.baseRequest)));
      const idA = a.answer?.runId ?? null;
      const read = idA ? await attempt(() => mod.getRun(idA)) : { answer: null };
      return {
        ids: [idA, b.answer?.runId ?? null].map((x) => (x === null || x === undefined ? null : String(x))),
        readBack: read.answer && read.answer.runId !== undefined ? String(read.answer.runId) : null,
      };
    } finally {
      Date.now = realNow;
    }
  }
  const built = buildRequest(contract, call);
  if (built.notRunnable) return { notRunnable: built.notRunnable };
  const field = call.expect?.field;
  const mapped = field ? resolveField(contract, field).path : null;
  if (call.op === 'validate') {
    const r = await attempt(() => mod.validate(built.request));
    if (r.threw !== undefined) return { threw: r.threw, path: mapped };
    const out = { ok: r.answer?.ok === true ? true : r.answer?.ok === false ? false : undefined, errors: errorsOf(r.answer), path: mapped };
    if (mapped && r.answer && isObject(r.answer.normalized)) {
      const v = readField(r.answer.normalized, mapped);
      if (v !== undefined) out.normalized = typeof v === 'number' && !Number.isFinite(v) ? String(v) : v;
    }
    return out;
  }
  const r = await attempt(() => mod.simulate(built.request));
  if (r.threw !== undefined) return { threw: r.threw, path: mapped };
  const out = { ok: r.answer?.ok === true ? true : r.answer?.ok === false ? false : undefined, errors: errorsOf(r.answer), path: mapped };
  if (typeof r.answer?.records === 'number') out.records = r.answer.records;
  if (call.expect?.kind === 'records-delta') out.baseRecords = baseRecords;
  return out;
}

/**
 * Run one engine case (`{ id, examples: [{ input, expected, call? }] }`)
 * against a loaded contract module. Returns
 * `{ status: 'Passed' | 'Failed' | 'Not run', reason?, examples: [{ input, status, evidence }] }`.
 */
export async function runEngineCase(mod, kase, state = createEngineState()) {
  const control = await controlOf(mod, state);
  if (!control.ok) return { status: 'Not run', reason: control.reason, examples: [] };
  const examples = [];
  for (const e of kase.examples ?? []) {
    if (!e.call) {
      examples.push({ input: e.input, status: 'not-runnable', evidence: NOT_EXPRESSIBLE });
      continue;
    }
    const out = await execute(mod, e.call, control.baseRecords);
    examples.push({ input: e.input, ...judge(e.call, out) });
  }
  const verdict = caseVerdict(examples);
  return { status: verdict.status, ...(verdict.reason ? { reason: verdict.reason } : {}), examples };
}
