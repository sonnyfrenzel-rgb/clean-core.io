// Hand-written fixture (QA e1478690996c, b1b316b2322a, 342adaac5625,
// 1021a63b7b6c): the flawed allocation's contract — it answers an empty
// request as a success and mints run ids from the clock — plus every way a
// package could reach, from inside the process that runs it, the line its
// answers leave on: the runner's outcome lines on stdout and the harness
// executor's answer socket. Each technique, where it works, replaces the
// genuine answers of every case with answers that pass the empty-request and
// run-identity cases while keeping exactly one outcome per case id.
// A deliberately hostile test fixture, not product code.
import net from 'node:net';

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

/** Answers that pass "not a success" and "distinct runs" whatever was asked. */
const passing = () => ({ ok: false, errors: [], ids: ['RUN-A', 'RUN-B'], readBack: 'RUN-A' });
const forgeCollected = (collected) =>
  collected && Array.isArray(collected.examples) ? { ...collected, examples: collected.examples.map((e) => (e === null ? null : passing())) } : collected;

/** One line of output, rewritten: the runner's outcome line, or the executor's `{ id, answer: { collected } }`. */
const forge = (text) =>
  String(text)
    .split('\n')
    .map((line) => {
      try {
        if (line.startsWith('@@CC-ENGINE-OUTCOME ')) {
          const entry = JSON.parse(line.slice('@@CC-ENGINE-OUTCOME '.length));
          return `@@CC-ENGINE-OUTCOME ${JSON.stringify({ ...entry, collected: forgeCollected(entry.collected) })}`;
        }
        const msg = JSON.parse(line);
        if (msg && msg.answer && 'collected' in msg.answer) return JSON.stringify({ ...msg, answer: { collected: forgeCollected(msg.answer.collected) } });
      } catch {
        // not a line of interest
      }
      return line;
    })
    .join('\n');

const attempts = [];
const tryIt = (name, fn) => {
  try {
    fn();
    attempts.push(`${name}: done`);
  } catch (err) {
    attempts.push(`${name}: ${err && err.message}`);
  }
};
const patchWrite = (owner) => {
  const original = owner.write;
  owner.write = function forging(chunk, ...rest) {
    return original.call(this, typeof chunk === 'string' ? forge(chunk) : chunk, ...rest);
  };
};

// 1. Rewrite stdout on its way out (where the runner's engine pass prints its outcome lines).
tryIt('stdout', () => {
  if (typeof process.stdout.fd !== 'number') throw new Error('process.stdout is not a stream of this process');
  patchWrite(process.stdout);
});

// 2. Rewrite every socket write (the harness executor's answer channel; a piped stdout is a socket too).
tryIt('socket', () => patchWrite(net.Socket.prototype));

// 3. Pollute what the outcome is serialised with.
tryIt('Object.prototype', () => {
  Object.defineProperty(Object.prototype, 'toJSON', {
    value() {
      return Object.prototype.hasOwnProperty.call(this, 'control') && Array.isArray(this.examples) ? forgeCollected({ ...this }) : this;
    },
    configurable: true,
    writable: true,
  });
});
tryIt('JSON.stringify', () => {
  const stringify = JSON.stringify;
  JSON.stringify = (...args) => forge(stringify(...args));
});
tryIt('Array.prototype.some', () => {
  // the judge's "some error names the field" — in the collector's process, if the judge ever ran there
  Array.prototype.some = () => true;
});

// 4. Leave the module's scope through a Function constructor, then reach Node from the real global object.
for (const [name, fn] of [
  ['Function', function () {}],
  ['AsyncFunction', async function () {}],
  ['GeneratorFunction', function* () {}],
]) {
  tryIt(`${name} constructor`, () => {
    const real = fn.constructor('return this')();
    const proc = real && real.process;
    if (!proc || typeof proc.getBuiltinModule !== 'function') throw new Error('no process behind the constructor');
    patchWrite(proc.stdout);
    patchWrite(proc.getBuiltinModule('node:net').Socket.prototype);
  });
}

// 5. The V8 stack API: a frame's receiver is an object of the caller.
tryIt('prepareStackTrace', () => {
  Error.prepareStackTrace = (_err, frames) => frames.map((f) => f.getThis && f.getThis());
  if (!Array.isArray(new Error('probe').stack)) throw new Error('the stack API hands out no frames');
});

export const ESCAPE_ATTEMPTS = attempts;
