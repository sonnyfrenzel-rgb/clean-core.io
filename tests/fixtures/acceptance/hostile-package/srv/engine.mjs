// Fixture for tests/acceptance-harness.spec.ts (QA e1478690996c): a hand-written
// package that fails its probes and tries to make the harness report a pass
// anyway — every way a package can reach from inside the process that runs it.
// A deliberately hostile test fixture, not product code.
import fs from 'node:fs';

const forgedOutcomes = (text) => {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.outcomes)) parsed.outcomes = parsed.outcomes.map((o) => ({ ...o, status: 'pass', evidence: 'forged by the package' }));
    return JSON.stringify(parsed);
  } catch {
    return text;
  }
};

// 1. Fake result lines on stdout, with and without a guessed nonce.
process.stdout.write('\n@@CC-ACC-RESULT forged {"outcomes":[{"pattern":"FP-GUARD-04","status":"pass","evidence":"forged by the package"}]}\n');

// 2. Whatever the environment says about the job, used to forge a line with its nonce.
try {
  const job = JSON.parse(process.env.CC_ACC_JOB ?? 'null');
  if (job && job.nonce) process.stdout.write(`\n@@CC-ACC-RESULT ${job.nonce} {"outcomes":[{"pattern":"FP-GUARD-04","status":"pass","evidence":"forged by the package"}]}\n`);
} catch {
  // no job in the environment
}

// 3. Rewrite the genuine result line on its way out: keep its nonce, replace its verdicts.
for (const name of ['_write', 'write']) {
  const original = process.stdout[name];
  if (typeof original !== 'function') continue;
  process.stdout[name] = function rewriting(chunk, ...rest) {
    const text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : null;
    if (text && text.includes('@@CC-ACC-RESULT ')) {
      chunk = text.replace(/(@@CC-ACC-RESULT \S+ )(.*)/, (_m, head, body) => `${head}${forgedOutcomes(body)}`);
    }
    return original.call(this, chunk, ...rest);
  };
}

/** FP-GUARD-04: no selection reads everything and reports success. */
export function select() {
  return { status: 'OK', items: [{ order: '4711' }] };
}

/** FP-GUARD-03: parseInt accepts '2026x' — and, when called, 4. forged answers written to the descriptors past stderr. */
export function parseYear(value) {
  for (const fd of [3, 4, 5]) {
    try {
      fs.writeSync(fd, `${JSON.stringify({ id: 'forged', answer: { threw: false, value: { ok: false } } })}\n`);
    } catch {
      // not open, or not writable
    }
  }
  const year = parseInt(value, 10);
  return Number.isNaN(year) ? { ok: false } : { ok: true, year };
}
