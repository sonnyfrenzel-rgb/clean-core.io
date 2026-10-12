/**
 * The engine-case runtime: runs engine cases against a package's call contract
 * and judges the answers — no model-written assertion anywhere.
 *
 * Two halves, and they never run in the same process:
 *   - the COLLECTOR (`collectEngineCase`) runs beside the package's code and
 *     only records what the contract answered — raw outcomes, no verdict;
 *   - the JUDGE (`judgeEngineCase`) runs in a trusted process that never
 *     imports the package, and turns those answers into verdicts against the
 *     expectations it holds itself.
 * Code in the package's process can tamper with anything in that process — the
 * collector, the output, the channel. What it sends back can therefore only
 * ever be answers the package chose to give, which it could have given by
 * behaving that way; a verdict is never something the package can write.
 *
 * ONE source, used in three places:
 *   - the isolated test runner (roadmap 8.9): the app sends this file as
 *     `__cc_engine/runtime.mjs` beside the generated code, and the engine suite
 *     (`lib/test-sandbox/engine-suite.ts`) collects with it and prints one
 *     outcome line per case — hash-bound like every file of a run. The app
 *     carries it as `ENGINE_RUNTIME_JS` (`lib/test-sandbox/engine-runtime.ts`),
 *     generated from this file by `node scripts/acceptance/sync-engine-runtime.mjs`;
 *     `tests/engine-call-contract.spec.ts` fails when the two differ.
 *   - the app judges those lines (`lib/engine-case-run.ts`, `engineVerdicts`).
 *   - the acceptance harness: the sandboxed executor (`executor.mjs`) collects,
 *     the harness process (`../engine-cases.mjs`) judges.
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

/** Starts the line the engine suite prints per case: the marker, then `{ id, collected }` as JSON. */
export const ENGINE_OUTCOME_MARKER = '@@CC-ENGINE-OUTCOME ';

const NOT_EXPRESSIBLE = "not expressible through the call contract — asserted by the model's test only";

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
 * `{ ok: false, reason }`, from the raw control `collectEngineCase` reports.
 */
export function judgeControl(control) {
  if (!isObject(control)) return { ok: false, reason: 'no positive control was reported' };
  if (Array.isArray(control.missing) && control.missing.length > 0) {
    return { ok: false, reason: `${NOT_RUN_NO_CONTRACT} (it lacks ${control.missing.map((m) => String(m).slice(0, 40)).join(', ')})` };
  }
  if (control.noBase === true) return { ok: false, reason: 'the contract has no baseRequest' };
  const v = answerIn(control.validate);
  if (!v || v.threw !== undefined || v.ok !== true) {
    return { ok: false, reason: `the contract's baseRequest is not accepted by validate (${v?.threw ?? JSON.stringify(v?.errors ?? [])}) — the mapping does not fit the code` };
  }
  const s = answerIn(control.simulate);
  if (!s || s.threw !== undefined || s.ok === false) {
    return { ok: false, reason: `the contract's baseRequest is refused by simulate (${s?.threw ?? JSON.stringify(s?.errors ?? [])}) — the mapping does not fit the code` };
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
  if (!control.ok) return { status: 'Not run', reason: control.reason, examples: [] };
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

async function attempt(fn) {
  try {
    return { answer: await fn() };
  } catch (err) {
    return { threw: message(err), crash: crashed(err) };
  }
}

/** A `validate`/`simulate` answer as raw data: `{ threw, crash } | { ok, errors, records? }`. */
function answerOf(r) {
  if (r.threw !== undefined) return { threw: r.threw, crash: r.crash };
  const out = { ok: r.answer?.ok === true ? true : r.answer?.ok === false ? false : undefined, errors: errorsOf(r.answer) };
  if (typeof r.answer?.records === 'number') out.records = r.answer.records;
  return out;
}

/** Per-module state: the raw positive control, collected once. */
export function createEngineState() {
  return { control: undefined };
}

async function collectControl(mod, state) {
  if (state.control) return state.control;
  const missing = CONTRACT_EXPORTS.filter((name) => mod[name] === undefined);
  if (missing.length > 0) return (state.control = { missing });
  const contract = mod.CONTRACT;
  if (!isObject(contract) || !isObject(contract.baseRequest)) return (state.control = { noBase: true });
  const v = await attempt(() => mod.validate(structuredClone(contract.baseRequest)));
  const control = { validate: answerOf(v) };
  if (v.threw === undefined && v.answer?.ok === true) {
    control.simulate = answerOf(await attempt(() => mod.simulate(structuredClone(contract.baseRequest))));
  }
  return (state.control = control);
}

/** Execute one call against the contract: the raw outcome `judge` reads. */
async function execute(mod, call) {
  const contract = mod.CONTRACT;
  if (call.op === 'compute') {
    const c = call.compute ?? {};
    let acc = c.start;
    try {
      for (const step of c.steps ?? []) acc = await mod.compute(String(c.field), acc, step.op, step.b);
    } catch (err) {
      return { threw: message(err), crash: crashed(err) };
    }
    return { value: plain(acc) };
  }
  if (call.op === 'run-identity') {
    const realNow = Date.now;
    const fixed = realNow();
    Date.now = () => fixed;
    try {
      const a = await attempt(() => mod.simulate(structuredClone(contract.baseRequest)));
      if (a.threw !== undefined) return { threw: a.threw, crash: a.crash };
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
    const request = built.request;
    const forRun = call.expect?.kind === 'not-zero' ? structuredClone(request) : null;
    const r = await attempt(() => mod.validate(request));
    const out = { ...answerOf(r), path: mapped };
    if (r.threw === undefined && mapped && r.answer && isObject(r.answer.normalized)) {
      const v = readField(r.answer.normalized, mapped);
      if (v !== undefined) out.normalized = plain(v);
    }
    // "Never computed as 0" is a claim about the run as well: the same request through simulate.
    if (forRun && r.threw === undefined) out.run = answerOf(await attempt(() => mod.simulate(forRun)));
    return out;
  }
  const r = await attempt(() => mod.simulate(built.request));
  return { ...answerOf(r), path: mapped };
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
  for (const e of kase.examples ?? []) examples.push(e.call ? await execute(mod, e.call) : null);
  return { control, examples };
}

/** Collect and judge in one process — for code that already runs the package in-process (tests). */
export async function runEngineCase(mod, kase, state = createEngineState()) {
  return judgeEngineCase(kase, await collectEngineCase(mod, kase, state));
}
