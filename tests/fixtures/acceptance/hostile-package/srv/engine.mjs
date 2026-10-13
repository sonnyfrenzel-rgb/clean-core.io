// Fixture for tests/acceptance-harness.spec.ts (QA e1478690996c, 1021a63b7b6c):
// a hand-written package that fails its probes and tries to make the harness
// report a pass anyway — every way a package could reach, from inside the
// process that runs it, the channel its answers travel on. Each technique,
// where it works, rewrites the executor's answers so that both probes pass.
// A deliberately hostile test fixture, not product code.
import net from 'node:net';

/** An answer line of the executor, rewritten to read as two refusals. */
const forge = (text) =>
  String(text)
    .replace(/"status":"OK"/g, '"status":"forged"')
    .replace(/"ok":true,"year":(?!2026\b)\d+/g, '"ok":false');

const attempts = [];
const tryIt = (name, fn) => {
  try {
    fn();
    attempts.push(`${name}: done`);
  } catch (err) {
    attempts.push(`${name}: ${err && err.message}`);
  }
};

/** Patch every write of a Socket class (the executor's answer channel is one; so is a piped stdout). */
const patchSocket = (Socket) => {
  const original = Socket.prototype.write;
  Socket.prototype.write = function forging(chunk, ...rest) {
    return original.call(this, typeof chunk === 'string' ? forge(chunk) : chunk, ...rest);
  };
};

// 1. Rewrite stdout and stderr on their way out.
tryIt('stdout', () => {
  if (typeof process.stdout.fd !== 'number') throw new Error('process.stdout is not a stream of this process');
  for (const stream of [process.stdout, process.stderr]) {
    const original = stream.write;
    stream.write = function forging(chunk, ...rest) {
      return original.call(this, typeof chunk === 'string' ? forge(chunk) : chunk, ...rest);
    };
  }
});

// 2. Rewrite the executor's answer socket through the class every socket shares.
tryIt('socket', () => patchSocket(net.Socket));

// 3. Pollute what the executor reads answers with: Object.keys decides which fields of an answer survive.
tryIt('Object.keys', () => {
  const keys = Object.keys;
  Object.keys = (o) => keys(o).filter((k) => k !== 'status');
});
tryIt('Object.prototype', () => {
  // Every object the executor serialises asks Object.prototype how to read itself.
  Object.defineProperty(Object.prototype, 'toJSON', {
    value() {
      return Object.prototype.hasOwnProperty.call(this, 'status') && this.status === 'OK' ? { ...this, status: 'forged' } : this;
    },
    configurable: true,
    writable: true,
  });
});
tryIt('JSON.stringify', () => {
  const stringify = JSON.stringify;
  JSON.stringify = (...args) => forge(stringify(...args));
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
    patchSocket(proc.getBuiltinModule('node:net').Socket);
  });
}

// 5. The V8 stack API: a frame's receiver is an object of the caller.
tryIt('prepareStackTrace', () => {
  Error.prepareStackTrace = (_err, frames) => frames.map((f) => f.getThis && f.getThis());
  if (!Array.isArray(new Error('probe').stack)) throw new Error('the stack API hands out no frames');
});

export const ESCAPE_ATTEMPTS = attempts;

/** FP-GUARD-04: no selection reads everything and reports success. */
export function select() {
  return { status: 'OK', items: [{ order: '4711' }] };
}

/** FP-GUARD-03: parseInt accepts '2026x'. */
export function parseYear(value) {
  const year = parseInt(value, 10);
  return Number.isNaN(year) ? { ok: false } : { ok: true, year };
}
