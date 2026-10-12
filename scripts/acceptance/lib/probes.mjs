/**
 * The generic probes. Each one knows a failure pattern and its trap inputs; the
 * per-package adapter only says how to call the package and where to read the
 * answer. Expectations never come from the package: they come from the pattern
 * (exact decimal arithmetic, distinct ids, a refused malformed value).
 *
 * Every probe returns a list of outcomes `{ pattern, status, evidence }` with
 * status `pass` or `fail`. A probe that cannot judge — its positive control does
 * not hold, so the adapter is probably wrong — throws an adapter error and the
 * result becomes `not-runnable`, never a silent pass.
 *
 * The probes run in the harness process, which never imports the package. They
 * reach it through `ctx` — `call`, `callMany` and `setClock`, each a request to
 * the sandboxed executor (`../child/executor.mjs`, `startExecutor` in
 * `./sandbox.mjs`). A request the executor could not answer rejects with a
 * transport error, which is never read as the package refusing something.
 */

// ---------------------------------------------------------------- utilities

export function getPath(value, p) {
  if (p === undefined || p === null || p === '') return value;
  let cur = value;
  for (const key of String(p).split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = key === 'length' && (Array.isArray(cur) || typeof cur === 'string') ? cur.length : cur[key];
  }
  return cur;
}

export function fill(template, vars) {
  if (typeof template === 'string' && template.startsWith('$') && Object.prototype.hasOwnProperty.call(vars, template.slice(1))) {
    return vars[template.slice(1)];
  }
  if (Array.isArray(template)) return template.map((t) => fill(t, vars));
  if (template && typeof template === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(template)) out[k] = fill(v, vars);
    return out;
  }
  return template;
}

/** `{ path, equals | in | notIn | truthy | falsy | gt | lt | exists }` against a value. */
export function matches(value, matcher) {
  if (!matcher) return false;
  const v = getPath(value, matcher.path);
  if ('equals' in matcher) return v === matcher.equals;
  if ('in' in matcher) return matcher.in.includes(v);
  if ('notIn' in matcher) return !matcher.notIn.includes(v);
  if ('truthy' in matcher) return Boolean(v) === Boolean(matcher.truthy);
  if ('falsy' in matcher) return !v === Boolean(matcher.falsy);
  if ('gt' in matcher) return typeof v === 'number' && v > matcher.gt;
  if ('lt' in matcher) return typeof v === 'number' && v < matcher.lt;
  if ('exists' in matcher) return (v !== undefined && v !== null) === Boolean(matcher.exists);
  return false;
}

function adapterError(message) {
  return Object.assign(new Error(message), { adapter: true });
}

function short(value) {
  let s;
  try {
    s = JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (s === undefined) s = String(value);
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
}

/** One executor answer to a call: `{ threw, value } | { threw: true, error } | { adapter }`, checked. */
function callAnswer(answer) {
  if (!answer || typeof answer !== 'object') throw Object.assign(new Error('the executor sent no answer'), { transport: true });
  if (typeof answer.transportError === 'string') throw Object.assign(new Error(answer.transportError), { transport: true });
  if (typeof answer.adapter === 'string') throw adapterError(answer.adapter);
  if (answer.threw === true) return { threw: true, error: String(answer.error ?? '').slice(0, 300) };
  if (answer.threw === false) return { threw: false, value: answer.value };
  throw Object.assign(new Error('the executor sent an answer of an unknown shape'), { transport: true });
}

/**
 * Call a callable spec in the executor: `{ module, export, method?, construct?: [...], factory?: [...] }`.
 * Resolves to what it returned; rejects with what it threw (as `{ packageThrew }`),
 * an adapter error, or a transport error.
 */
function makeCaller(ctx) {
  return async function call(spec, args) {
    const r = callAnswer(await ctx.request('call', { spec, args }));
    if (r.threw) throw Object.assign(new Error(r.error), { packageThrew: true });
    return r.value;
  };
}

/** Many calls of one spec in one request: `[{ threw, value, error }]`, in order. */
async function callMany(ctx, spec, argsList) {
  const answer = await ctx.request('call-many', { spec, argsList });
  if (!answer || !Array.isArray(answer.results)) throw Object.assign(new Error('the executor sent no results'), { transport: true });
  const results = answer.results.map(callAnswer);
  if (results.length !== argsList.length) throw Object.assign(new Error(`the executor answered ${results.length} of ${argsList.length} calls`), { transport: true });
  return results;
}

/** Call and report `{ threw, value, error }` instead of throwing — only for what the package threw. */
async function attempt(call, spec, args) {
  try {
    return { threw: false, value: await call(spec, args) };
  } catch (err) {
    if (!err || !err.packageThrew) throw err;
    return { threw: true, error: err.message };
  }
}

function refused(res, matcher) {
  return res.threw || matches(res.value, matcher);
}

// ------------------------------------------------- exact decimal reference

/** "12.5" -> { units: 125n, scale: 1 } */
function decimal(text) {
  const s = String(text).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw adapterError(`'${text}' is not a decimal literal`);
  const [int, frac = ''] = s.replace('-', '').split('.');
  const units = BigInt(int + frac) * (s.startsWith('-') ? -1n : 1n);
  return { units, scale: frac.length };
}

/** Round num/den half away from zero to an integer (BigInt). */
function roundHalfAway(num, den) {
  const neg = (num < 0n) !== (den < 0n);
  const a = num < 0n ? -num : num;
  const b = den < 0n ? -den : den;
  const q = (2n * a + b) / (2n * b);
  return neg ? -q : q;
}

// ------------------------------------------------------------------ probes

/**
 * FP-PREC-02. amount x rate% rounded at `places`, half away from zero, for
 * every amount in cents from 0.01 to `maxAmount` (and the negatives if signed).
 */
async function roundingCommercial(cfg, ctx) {
  const places = Number.isInteger(cfg.places) ? cfg.places : 2;
  const rate = decimal(cfg.ratePercent ?? '5');
  const maxCents = Number(decimal(cfg.maxAmount ?? '1000.00').units) * 10 ** (2 - decimal(cfg.maxAmount ?? '1000.00').scale);
  const pow = 10n ** BigInt(places);
  const den = 10n ** BigInt(4 + rate.scale);
  const diffs = [];
  let checked = 0;
  const signs = cfg.signed ? [1, -1] : [1];
  for (const sign of signs) {
    const cents = Array.from({ length: maxCents }, (_, i) => sign * (i + 1));
    // One request per sign: the executor calls the package for every amount in turn.
    const results = await callMany(ctx, cfg.call, cents.map((c) => fill(cfg.args, { amount: c / 100, rate: Number(cfg.ratePercent ?? '5') })));
    cents.forEach((c, i) => {
      const amount = c / 100;
      const expected = Number(roundHalfAway(BigInt(c) * rate.units * pow, den)) / Number(pow);
      if (results[i].threw) throw new Error(results[i].error);
      const value = getPath(results[i].value, cfg.result);
      checked++;
      if (typeof value !== 'number' || Math.abs(value - expected) > 1e-9) {
        diffs.push([amount, value, expected]);
      }
    });
  }
  if (checked > 0 && diffs.length === checked) {
    throw adapterError(`every one of ${checked} results differs (first: ${short(diffs[0])}); the result path or argument mapping is probably wrong`);
  }
  return [{
    pattern: 'FP-PREC-02',
    status: diffs.length === 0 ? 'pass' : 'fail',
    evidence: diffs.length === 0
      ? `${checked} amounts x ${cfg.ratePercent ?? '5'}% match exact rounding half away from zero at ${places} places`
      : `${diffs.length} of ${checked} amounts differ from exact rounding at ${places} places; first [amount, got, expected]: ${short(diffs.slice(0, 5))}`,
  }];
}

/** FP-PREC-01. Quantities that are exact in decimal and inexact in binary. */
async function decimalQuantity(cfg, ctx) {
  const call = makeCaller(ctx);
  const cases = [
    { name: 'control', required: 0.3, withdrawn: 0, available: 0.3 },
    { name: 'trap-1', required: 0.4, withdrawn: 0.1, available: 0.3 },
    { name: 'trap-2', required: 0.8, withdrawn: 0.1, available: 0.7 },
  ];
  const seen = [];
  for (const c of cases) {
    const res = await attempt(call, cfg.call, fill(cfg.args, c));
    const covered = !res.threw && matches(getPath(res.value, cfg.result), cfg.covered);
    seen.push({ ...c, covered, got: res.threw ? `threw: ${res.error}` : getPath(getPath(res.value, cfg.result), cfg.covered?.path) });
  }
  if (!seen[0].covered) {
    throw adapterError(`positive control (0.3 required, 0.3 available) is not reported as covered (got ${short(seen[0].got)})`);
  }
  const failed = seen.slice(1).filter((s) => !s.covered);
  return [{
    pattern: 'FP-PREC-01',
    status: failed.length === 0 ? 'pass' : 'fail',
    evidence: failed.length === 0
      ? 'requirement 0.4 - 0.1 against 0.3 and 0.8 - 0.1 against 0.7 are fully covered'
      : failed.map((f) => `required ${f.required} - withdrawn ${f.withdrawn} against ${f.available} is not covered (got ${short(f.got)})`).join('; '),
  }];
}

/** FP-RUN-02 and FP-RUN-01. Frozen clock, a tight loop, and A -> B -> get A. */
async function runIdCollision(cfg, ctx) {
  const call = makeCaller(ctx);
  // The package's clock, in the executor: frozen, ticking, or the real one again.
  const setClock = async (clock) => {
    const answer = await ctx.request('clock', { clock });
    if (!answer || typeof answer !== 'object' || answer.transportError) throw Object.assign(new Error('the executor did not set the clock'), { transport: true });
  };
  const outcomes = [];
  const idOf = (value) => getPath(value, cfg.id);
  const frozen = 1767225600000;
  let a;
  let b;
  try {
    await setClock({ kind: 'frozen', at: frozen });
    a = await call(cfg.create, fill(cfg.argsA, {}));
    b = await call(cfg.create, fill(cfg.argsB, {}));
  } finally {
    await setClock(null);
  }
  const idA = idOf(a);
  const idB = idOf(b);
  if (idA === undefined || idA === null || idA === '') throw adapterError(`no run id at '${cfg.id}' in ${short(a)}`);
  const ids = new Set();
  const loop = Number.isInteger(cfg.loop) ? cfg.loop : 200;
  for (let i = 0; i < loop; i++) ids.add(idOf(await call(cfg.create, fill(i % 2 ? cfg.argsB : cfg.argsA, {}))));
  const collisions = loop - ids.size;
  outcomes.push({
    pattern: 'FP-RUN-02',
    status: idA !== idB && collisions === 0 ? 'pass' : 'fail',
    evidence: `same millisecond: ${short(idA)} vs ${short(idB)}${idA === idB ? ' (collision)' : ''}; ${loop} runs in a tight loop gave ${ids.size} distinct ids`,
  });

  if (!cfg.get) {
    outcomes.push({ pattern: 'FP-RUN-01', status: 'not-applicable', evidence: 'adapter maps no retrieval by run id' });
    return outcomes;
  }
  // A clean A -> B -> get(A) with distinct clock values, so this half judges
  // "latest result" semantics on its own and not the collision again.
  let a2;
  try {
    await setClock({ kind: 'tick', start: frozen + 10_000, step: 1000 });
    a2 = await call(cfg.create, fill(cfg.argsA, {}));
    await call(cfg.create, fill(cfg.argsB, {}));
  } finally {
    await setClock(null);
  }
  // `compare` is one path for both shapes, or `{ create, get }` when the
  // retrieval returns a different envelope than the creation.
  const cmpCreate = typeof cfg.compare === 'object' && cfg.compare ? cfg.compare.create ?? '' : cfg.compare ?? '';
  const cmpGet = typeof cfg.compare === 'object' && cfg.compare ? cfg.compare.get ?? '' : cfg.compare ?? '';
  const comparePath = cmpGet;
  const got = await attempt(call, cfg.get, fill(cfg.get.args ?? ['$id'], { id: idOf(a2) }));
  const gotFrozen = await attempt(call, cfg.get, fill(cfg.get.args ?? ['$id'], { id: idA }));
  const same = (fromGet, fromCreate) => short(getPath(fromGet, cmpGet)) === short(getPath(fromCreate, cmpCreate));
  const latestOk = !got.threw && same(got.value, a2);
  const collisionOk = idA !== idB ? (!gotFrozen.threw && same(gotFrozen.value, a)) : false;
  outcomes.push({
    pattern: 'FP-RUN-01',
    status: latestOk && collisionOk ? 'pass' : 'fail',
    evidence: [
      latestOk ? 'A -> B -> get(A) returns A' : `A -> B -> get(A) returned ${got.threw ? `an error: ${got.error}` : short(getPath(got.value, comparePath))} instead of A`,
      collisionOk ? 'a run started in the same millisecond is still retrievable' : 'the first of two same-millisecond runs is no longer retrievable as itself',
    ].join('; '),
  });
  return outcomes;
}

/** FP-GUARD-04. Nothing selected is not a successful run. */
async function emptySelection(cfg, ctx) {
  const call = makeCaller(ctx);
  const res = await attempt(call, cfg.call, fill(cfg.args, {}));
  const ok = refused(res, cfg.refused);
  return [{
    pattern: 'FP-GUARD-04',
    status: ok ? 'pass' : 'fail',
    evidence: ok
      ? (res.threw ? `refused: ${res.error}` : `answered with a non-success state: ${short(getPath(res.value, cfg.refused?.path))}`)
      : `an empty selection was answered as a success: ${short(res.value)}`,
  }];
}

/** FP-GUARD-03. Malformed numbers are refused, never coerced. */
async function lenientNumeric(cfg, ctx) {
  const call = makeCaller(ctx);
  const control = await attempt(call, cfg.call, fill(cfg.args, { value: cfg.valid }));
  if (refused(control, cfg.refused)) {
    throw adapterError(`the valid control value ${short(cfg.valid)} is refused (${control.threw ? control.error : short(control.value)})`);
  }
  const invalid = Array.isArray(cfg.invalid) ? cfg.invalid : ['2026x', 'abc', '1.9', 'NaN', 'Infinity', '', null];
  const accepted = [];
  for (const value of invalid) {
    const res = await attempt(call, cfg.call, fill(cfg.args, { value }));
    if (!refused(res, cfg.refused)) accepted.push(value);
  }
  return [{
    pattern: 'FP-GUARD-03',
    status: accepted.length === 0 ? 'pass' : 'fail',
    evidence: accepted.length === 0
      ? `valid ${short(cfg.valid)} accepted; ${invalid.length} malformed values refused`
      : `accepted malformed input ${short(accepted)} for a numeric field`,
  }];
}

/** RFC 4180 parse with a configurable delimiter; returns records of fields. */
export function parseCsv(text, delimiter = ',') {
  const records = [];
  let field = '';
  let record = [];
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      record.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r' && text[i + 1] === '\n') i++;
    if (ch === '\n' || ch === '\r') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== '' || record.length) {
    record.push(field);
    records.push(record);
  }
  return records.filter((r) => !(r.length === 1 && r[0] === ''));
}

function asText(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.toString === 'function' && value.constructor && value.constructor.name === 'Buffer') return value.toString('utf8');
  if (Array.isArray(value)) return value.join('\n');
  return undefined;
}

/** FP-GUARD-07. Quotes, separators, line breaks and a formula in text fields. */
async function csvEscaping(cfg, ctx) {
  const call = makeCaller(ctx);
  const d = cfg.delimiter ?? ',';
  const quoteText = `MAT"${d}EXTRA`;
  const newlineText = 'line one\nline two';
  const formulaText = '=1+1';
  const control = fill(cfg.rowTemplate, { quoteText: 'PLAIN1', newlineText: 'PLAIN2', formulaText: 'PLAIN3' });
  const trap = fill(cfg.rowTemplate, { quoteText, newlineText, formulaText });
  const out = asText(getPath(await call(cfg.call, fill(cfg.args, { rows: [control, trap] })), cfg.result));
  if (out === undefined) throw adapterError('the serializer returned no text');
  if (!out.includes('PLAIN1')) throw adapterError('the control row does not appear in the output');
  const records = parseCsv(out, d);
  const width = records[0]?.length ?? 0;
  const problems = [];
  const uneven = records.filter((r) => r.length !== width);
  if (uneven.length) problems.push(`${uneven.length} record(s) with ${uneven.map((r) => r.length).join('/')} fields instead of ${width}`);
  const fields = records.flat();
  if (!fields.includes(quoteText)) problems.push(`the text ${short(quoteText)} does not survive as one field`);
  if (!fields.some((f) => f.replace(/\r\n/g, '\n') === newlineText)) problems.push('a text with a line break does not survive as one field');
  if (fields.includes(formulaText)) problems.push(`the cell ${short(formulaText)} reaches the file un-neutralised`);
  else if (!fields.some((f) => f.endsWith(formulaText))) problems.push('the formula text is missing from the output entirely');
  return [{
    pattern: 'FP-GUARD-07',
    status: problems.length === 0 ? 'pass' : 'fail',
    evidence: problems.length === 0
      ? `${records.length} records keep ${width} fields; quote, separator and line break round-trip; the formula cell is neutralised`
      : problems.join('; '),
  }];
}

/** FP-SCOPE-01. A display filter is honoured everywhere or refused. */
async function displayFilter(cfg, ctx) {
  const call = makeCaller(ctx);
  const all = await call(cfg.call, fill(cfg.argsAll, {}));
  const filtered = await attempt(call, cfg.call, fill(cfg.argsFiltered, {}));
  if (refused(filtered, cfg.refused)) {
    return [{ pattern: 'FP-SCOPE-01', status: 'pass', evidence: `the filter is refused explicitly${filtered.threw ? `: ${filtered.error}` : ''}` }];
  }
  const itemsAll = getPath(all, cfg.items);
  const itemsF = getPath(filtered.value, cfg.items);
  if (!Array.isArray(itemsAll) || !Array.isArray(itemsF)) throw adapterError(`no item list at '${cfg.items}'`);
  const isMatch = (item) => getPath(item, cfg.match.field) === cfg.match.value;
  const expected = itemsAll.filter(isMatch).length;
  if (expected === 0 || expected === itemsAll.length) {
    throw adapterError(`the unfiltered result must contain matching and non-matching items (has ${expected} of ${itemsAll.length})`);
  }
  const problems = [];
  const foreign = itemsF.filter((i) => !isMatch(i)).length;
  if (foreign) problems.push(`the filtered list still shows ${foreign} non-matching of ${itemsF.length} items`);
  else if (itemsF.length !== expected) problems.push(`the filtered list shows ${itemsF.length} items, ${expected} match`);
  if (cfg.totals) {
    const total = getPath(filtered.value, cfg.totals.path);
    const sum = itemsAll.filter(isMatch).reduce((s, i) => s + Number(getPath(i, cfg.totals.field) ?? 0), 0);
    if (typeof total !== 'number' || Math.abs(total - sum) > 1e-6) problems.push(`totals for the selection are ${short(total)}, the selected items sum to ${sum}`);
  }
  if (cfg.export) {
    const csv = asText(getPath(await call(cfg.export.call, fill(cfg.export.args, {})), cfg.export.result));
    if (csv === undefined) throw adapterError('the export returned no text');
    const rows = parseCsv(csv, cfg.export.delimiter ?? ',').length - (cfg.export.header === false ? 0 : 1);
    if (rows !== expected) problems.push(`the export for the selection has ${rows} data rows, ${expected} items match`);
  }
  return [{
    pattern: 'FP-SCOPE-01',
    status: problems.length === 0 ? 'pass' : 'fail',
    evidence: problems.length === 0 ? `list${cfg.totals ? ', totals' : ''}${cfg.export ? ' and export' : ''} cover the same ${expected} matching items` : problems.join('; '),
  }];
}

/** FP-MEAN-05. A recalculation builds on the existing value. */
async function recalcAdditive(cfg, ctx) {
  const call = makeCaller(ctx);
  const existing = typeof cfg.existing === 'number' ? cfg.existing : 125;
  const increment = typeof cfg.increment === 'number' ? cfg.increment : 10;
  const rows = [fill(cfg.rowTemplate, { existing })];
  const res = await call(cfg.call, fill(cfg.args, { rows, existing }));
  const value = getPath(res, cfg.value);
  if (typeof value !== 'number') throw adapterError(`no number at '${cfg.value}' (got ${short(value)})`);
  const expected = existing + increment;
  return [{
    pattern: 'FP-MEAN-05',
    status: Math.abs(value - expected) < 1e-9 ? 'pass' : 'fail',
    evidence: Math.abs(value - expected) < 1e-9
      ? `existing ${existing} + ${increment} = ${value}`
      : `existing ${existing} + ${increment} should give ${expected}; the recalculation gave ${value}`,
  }];
}

/** FP-GUARD-05. A write of a negative amount is refused. */
async function negativeWrite(cfg, ctx) {
  const call = makeCaller(ctx);
  if (cfg.validValue !== undefined) {
    const control = await attempt(call, cfg.call, fill(cfg.args, { value: cfg.validValue }));
    if (refused(control, cfg.refused)) throw adapterError(`the valid control write ${short(cfg.validValue)} is refused`);
  }
  const value = typeof cfg.value === 'number' ? cfg.value : -99999;
  const res = await attempt(call, cfg.call, fill(cfg.args, { value }));
  const ok = refused(res, cfg.refused);
  return [{
    pattern: 'FP-GUARD-05',
    status: ok ? 'pass' : 'fail',
    evidence: ok ? `a write of ${value} is refused${res.threw ? `: ${res.error}` : ''}` : `a write of ${value} was accepted: ${short(res.value)}`,
  }];
}

export const PROBES = {
  'rounding-commercial': roundingCommercial,
  'decimal-quantity': decimalQuantity,
  'run-id-collision': runIdCollision,
  'empty-selection': emptySelection,
  'lenient-numeric': lenientNumeric,
  'csv-escaping': csvEscaping,
  'display-filter': displayFilter,
  'recalc-additive': recalcAdditive,
  'negative-write': negativeWrite,
};
