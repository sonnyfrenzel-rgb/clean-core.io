/**
 * Preloaded (`--import`) into every probe child before the package's code runs.
 *
 * Two jobs. First, it is a second wall behind the permission model: Node's
 * permission model denies file writes, child processes, workers, addons and
 * `process.binding`, but before Node 25 it has no network permission at all. So
 * every outbound path a package can reach from JavaScript (socket connect, UDP,
 * DNS, fetch, WebSocket) throws here. This is a best-effort guard, which is why
 * `run.mjs` executes a package only when the platform itself blocks network or
 * when the operator vouches for the package (`--trusted-fixture`).
 *
 * Second, it is the instrument for FP-TEST-03: `listen` never binds a port, it
 * reports the attempt on stderr as an event line and returns the server, so a
 * package that starts a server on import is reported as a finding instead of
 * holding a port or hanging the harness.
 */
import net from 'node:net';
import dgram from 'node:dgram';
import dns from 'node:dns';

const EVENT = '@@CC-ACC-EVENT ';

function emit(event) {
  try {
    process.stderr.write(`${EVENT}${JSON.stringify(event)}\n`);
  } catch {
    // stderr gone: nothing left to report to.
  }
}

function blocked(kind) {
  return function blockedNetworkCall() {
    emit({ type: 'network', kind });
    throw new Error(`network access (${kind}) is disabled by the acceptance harness`);
  };
}

function describeListen(args) {
  const first = args[0];
  if (typeof first === 'number' || typeof first === 'string') return String(first);
  if (first && typeof first === 'object' && 'port' in first) return String(first.port);
  return 'unspecified';
}

net.Server.prototype.listen = function guardedListen(...args) {
  emit({ type: 'listen', port: describeListen(args), stack: new Error().stack?.split('\n').slice(2, 6).join(' | ') });
  return this;
};

net.Socket.prototype.connect = blocked('socket.connect');
net.connect = blocked('net.connect');
net.createConnection = blocked('net.createConnection');
dgram.Socket.prototype.bind = blocked('dgram.bind');
dgram.Socket.prototype.send = blocked('dgram.send');
dgram.Socket.prototype.connect = blocked('dgram.connect');
for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'reverse']) {
  dns[name] = blocked(`dns.${name}`);
  if (dns.promises) dns.promises[name] = blocked(`dns.promises.${name}`);
}
globalThis.fetch = async function blockedFetch() {
  emit({ type: 'network', kind: 'fetch' });
  throw new Error('network access (fetch) is disabled by the acceptance harness');
};
if ('WebSocket' in globalThis) {
  globalThis.WebSocket = function BlockedWebSocket() {
    emit({ type: 'network', kind: 'WebSocket' });
    throw new Error('network access (WebSocket) is disabled by the acceptance harness');
  };
}
