/**
 * Engine cases through the call contract — building the requests and judging
 * the answers. Pure: no I/O, no package code. Used by the sandboxed child
 * (`engine-cases-child.mjs`, which builds and calls) and by the parent
 * (`../engine-cases.mjs`, which judges what the child reported).
 *
 * The contract a generated package exports (`lib/engine-call-contract.ts`):
 *
 *   CONTRACT = { version: 1, baseRequest, fields: { ORIGINAL_NAME: 'request.path' | 'list[].key' | null } }
 *   validate(request) → { ok, errors: [{ field, rule, message }], normalized }
 *   simulate(request) → { ok, runId, records, errors }
 *   getRun(runId)     → the stored run ({ runId, … }) or null
 *
 * A call (`EngineCaseCall` in `lib/engine-call-contract.ts`):
 *   { op: 'validate' | 'simulate' | 'run-identity', mode?: 'request' | 'append' | 'empty',
 *     set: [{ field, to: { value } | { special } | { sameAs } | { differentFrom } }], expect: { kind, … } }
 */

/** Where the contract module may stand — the same list as `CALL_CONTRACT_PATHS` in lib/engine-call-contract.ts. */
export const CALL_CONTRACT_PATHS = [
  'srv/engine-contract.ts',
  'srv/engine-contract.mjs',
  'srv/engine-contract.js',
  'engine-contract.ts',
  'engine-contract.mjs',
  'engine-contract.js',
];

export const CONTRACT_EXPORTS = ['CONTRACT', 'validate', 'simulate', 'getRun'];

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

/** `a.b` → ['a', 'b']; `list[].key` → { list: ['list'], key: ['key'] }. */
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
    // Nothing to change on the copy (a passing value "as in the base"): append the first record of the first list field.
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

/**
 * Judge one call's outcome as the child reported it:
 * `{ threw?, ok?, errors?, normalized?, records?, baseRecords?, ids?, readBack?, notRunnable?, path? }`.
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
