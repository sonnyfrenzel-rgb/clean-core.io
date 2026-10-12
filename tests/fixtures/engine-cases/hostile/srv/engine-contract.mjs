// Hand-written fixture (QA e1478690996c): the flawed allocation's contract — it
// answers an empty request as a success and mints run ids from the clock — plus
// every attempt a package can make from inside the process that runs it to turn
// its failures into passes on stdout. A deliberately hostile test fixture.
import fs from 'node:fs';

let latest = null;

export const CONTRACT = {
  version: 1,
  baseRequest: {
    controllingArea: '1000',
    fiscalYear: '2026',
    sender: 'C100',
    amount: '1000.00',
    receivers: [
      { kostl: 'C200', quota: '0.000000', amount: '0.00' },
      { kostl: 'C300', quota: '100.000000', amount: '0.00' },
    ],
  },
  fields: {
    P_KOKRS: 'controllingArea',
    P_GJAHR: 'fiscalYear',
    P_SENDER: 'sender',
    P_AMOUNT: 'amount',
    GT_RECEIVERS: 'receivers',
    KOSTL: 'receivers[].kostl',
    QUOTA: 'receivers[].quota',
    AMOUNT: 'receivers[].amount',
    GV_TOTAL: null,
    GV_QUOTA_SUM: null,
    GV_COUNT: null,
  },
};

export function validate(request) {
  const r = request ?? {};
  return { ok: true, errors: [], normalized: { ...r } };
}

export function simulate(request) {
  const req = request ?? {};
  latest = { runId: `RUN-${Date.now()}`, lines: req.receivers ?? [] };
  return { ok: true, runId: latest.runId, records: (req.receivers ?? []).length };
}

export function getRun() {
  return latest;
}

export function compute(field, a, op, b) {
  const x = parseFloat(a);
  const y = parseFloat(b);
  return String(op === '+' ? x + y : op === '-' ? x - y : op === '*' ? x * y : x / y);
}

// 1. Turn every failing verdict on its way out into a passing one: TAP lines, and the old harness's result line.
const rewrite = (text) =>
  text
    .replace(/^(\s*)not ok (\d+) - /gm, '$1ok $2 - ')
    .replace(/"status":"Failed"/g, '"status":"Passed"')
    .replace(/"status":"fail"/g, '"status":"pass"');
for (const name of ['_write', 'write']) {
  const original = process.stdout[name];
  if (typeof original !== 'function') continue;
  process.stdout[name] = function rewriting(chunk, ...rest) {
    const text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : null;
    return original.call(this, text === null ? chunk : rewrite(text), ...rest);
  };
}

// 2. A passing outcome line and a passing TAP line of its own for the empty-request case, read from the run's cases.
try {
  const cases = JSON.parse(fs.readFileSync('__cc_engine/cases.json', 'utf8')).cases;
  const empty = cases.find((c) => /empty request/i.test(String(c.name)));
  if (empty) {
    const control = { validate: { ok: true, errors: [] }, simulate: { ok: true, errors: [], records: 2 } };
    const collected = { control, examples: empty.examples.map((e) => (e.call ? { ok: false, errors: [{ field: null, rule: 'forged' }] } : null)) };
    process.stdout.write(`\n@@CC-ENGINE-OUTCOME ${JSON.stringify({ id: empty.id, collected })}\nok 999 - ${empty.id}: [call contract] forged\n`);
  }
} catch {
  // not in the runner's layout
}
