/**
 * The process that runs engine cases against a package's call contract. One
 * package per process.
 *
 * Started by `../engine-cases.mjs` through `runChild` of `../lib/sandbox.mjs` —
 * the same sandbox as every harness probe: the permission model on, read access
 * to the package's temporary copy and this directory only, no write access, the
 * network guard preloaded, a minimal environment and a hard timeout. It receives
 * its job as JSON in `CC_ACC_JOB`, prints exactly one result line and exits.
 * It reports what the package answered; the parent judges (`engine-cases-core.mjs`).
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { buildRequest, errorsOf, readField, resolveField, CONTRACT_EXPORTS } from './engine-cases-core.mjs';

const RESULT = '@@CC-ACC-RESULT ';
// Taken before any package code runs (see probe-child.mjs).
const write = process.stdout.write.bind(process.stdout);
const exit = process.exit.bind(process);
const stringify = JSON.stringify;
const realNow = Date.now;
let nonce = '';

function finish(payload) {
  write(`\n${RESULT}${nonce} ${stringify(payload)}\n`, () => exit(0));
}

const message = (err) => String(err && err.message ? err.message : err).split('\n')[0].slice(0, 200);

function loadFailure(err, rel) {
  const code = err && typeof err === 'object' ? err.code : undefined;
  const m = message(err);
  if (code === 'ERR_MODULE_NOT_FOUND' && /Cannot find package '([^']+)'/.test(m)) {
    return `not runnable without its dependencies: '${rel}' imports '${m.match(/Cannot find package '([^']+)'/)[1]}', which is not installed (the harness never installs dependencies)`;
  }
  if (code === 'ERR_ACCESS_DENIED') return `'${rel}' needs a capability the sandbox denies: ${m}`;
  return `'${rel}' cannot be loaded: ${code ? `${code}: ` : ''}${m}`;
}

async function attempt(fn) {
  try {
    return { answer: await fn() };
  } catch (err) {
    return { threw: message(err) };
  }
}

async function main() {
  let job;
  try {
    job = JSON.parse(process.env.CC_ACC_JOB ?? '');
  } catch {
    finish({ error: 'no job' });
    return;
  }
  delete process.env.CC_ACC_JOB;
  nonce = String(job.nonce ?? '');

  let mod;
  try {
    mod = await import(pathToFileURL(path.join(job.root, job.module)).href);
  } catch (err) {
    finish({ notRunnable: loadFailure(err, job.module) });
    return;
  }
  const missing = CONTRACT_EXPORTS.filter((name) => mod[name] === undefined);
  if (missing.length > 0) {
    finish({ noContract: `'${job.module}' does not export ${missing.join(', ')}` });
    return;
  }
  const contract = mod.CONTRACT;

  // The base request's record count, once: what an appended record is measured against.
  let baseRecords;
  const base = async () => {
    if (baseRecords !== undefined) return baseRecords;
    const r = await attempt(() => mod.simulate(structuredClone(contract.baseRequest)));
    baseRecords = r.threw !== undefined || r.answer?.ok === false ? { refused: r.threw ?? stringify(errorsOf(r.answer)) } : r.answer?.records;
    return baseRecords;
  };

  // Positive control: the base request passes the validator and every check. Without it a
  // "refused" verdict would prove nothing — the mapping, not the case, would be refused.
  const control = await attempt(() => mod.validate(structuredClone(contract.baseRequest)));
  if (control.threw !== undefined || control.answer?.ok !== true) {
    finish({ notRunnable: `the contract's baseRequest is not accepted by validate (${control.threw ?? stringify(errorsOf(control.answer))}) — the mapping does not fit the code` });
    return;
  }
  const baseRun = await base();
  if (typeof baseRun !== 'number') {
    finish({ notRunnable: typeof baseRun === 'object' && baseRun ? `the contract's baseRequest is refused by simulate (${baseRun.refused}) — the mapping does not fit the code` : 'simulate reports no record count (records) for the base request' });
    return;
  }

  const cases = [];
  for (const c of job.cases ?? []) {
    const examples = [];
    for (const call of c.calls) {
      if (!call) {
        examples.push(null);
        continue;
      }
      if (call.op === 'run-identity') {
        const fixed = realNow();
        Date.now = () => fixed;
        let out;
        try {
          const a = await attempt(() => mod.simulate(structuredClone(contract.baseRequest)));
          const b = await attempt(() => mod.simulate(structuredClone(contract.baseRequest)));
          const idA = a.answer?.runId ?? null;
          const read = idA ? await attempt(() => mod.getRun(idA)) : { answer: null };
          out = { ids: [idA, b.answer?.runId ?? null].map((x) => (x === null ? null : String(x))), readBack: read.answer && read.answer.runId !== undefined ? String(read.answer.runId) : null };
          if (a.threw) out = { threw: a.threw };
        } finally {
          Date.now = realNow;
        }
        examples.push(out);
        continue;
      }
      const built = buildRequest(contract, call);
      if (built.notRunnable) {
        examples.push({ notRunnable: built.notRunnable });
        continue;
      }
      const field = call.expect?.field;
      const mapped = field ? resolveField(contract, field).path : null;
      if (call.op === 'validate') {
        const r = await attempt(() => mod.validate(built.request));
        if (r.threw !== undefined) {
          examples.push({ threw: r.threw, path: mapped });
          continue;
        }
        const out = { ok: r.answer?.ok === true ? true : r.answer?.ok === false ? false : undefined, errors: errorsOf(r.answer), path: mapped };
        if (mapped && r.answer && typeof r.answer.normalized === 'object' && r.answer.normalized !== null) {
          const v = readField(r.answer.normalized, mapped);
          if (v !== undefined) out.normalized = typeof v === 'number' && !Number.isFinite(v) ? String(v) : v;
        }
        examples.push(out);
        continue;
      }
      // simulate
      const needsBase = call.expect?.kind === 'records-delta';
      const b = needsBase ? await base() : undefined;
      if (needsBase && typeof b !== 'number') {
        examples.push({ notRunnable: typeof b === 'object' && b ? `the contract's baseRequest is itself refused (${b.refused}) — the mapping does not fit` : 'simulate reports no record count for the base request' });
        continue;
      }
      const r = await attempt(() => mod.simulate(built.request));
      if (r.threw !== undefined) {
        examples.push({ threw: r.threw, path: mapped });
        continue;
      }
      const out = { ok: r.answer?.ok === true ? true : r.answer?.ok === false ? false : undefined, errors: errorsOf(r.answer), path: mapped };
      if (typeof r.answer?.records === 'number') out.records = r.answer.records;
      if (needsBase) out.baseRecords = b;
      examples.push(out);
    }
    cases.push({ id: c.id, examples });
  }
  finish({ cases });
}

main().catch((err) => finish({ notRunnable: `the run could not complete: ${message(err)}` }));
