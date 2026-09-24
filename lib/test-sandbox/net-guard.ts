/**
 * The network guard preloaded into every sandbox child (`__netguard.mjs`).
 *
 * What it is: a code-level refusal of the JavaScript paths to the network —
 * TCP (`net.Socket.prototype.connect`, `net.connect`, `net.createConnection`,
 * which every http/https/tls/http2/fetch connection funnels through), UDP (the
 * `dgram` factory, constructor and prototype), DNS (every `dns` entry point,
 * which reaches the native resolver past `net.Socket`), `fetch` and
 * `process.binding`. It is loaded on every run and never removed.
 *
 * What it is not: an isolation boundary. Node's permission model says itself
 * that it is no guarantee against malicious code, and a monkey-patch is not a
 * kernel or network policy. Since roadmap 8.9 the boundary is the runner's own
 * Cloud Run service — no roles on its service account, no secrets, ingress
 * internal, egress through a VPC without NAT — and this guard is the layer in
 * front of it that makes the ordinary mistake fail loudly.
 *
 * Two shapes:
 *
 *   - closed (`allow === null`) — every path above throws. Mock runs.
 *   - loopback (`allow = { host: '127.0.0.1', port }`) — TCP to exactly that
 *     address and port is let through, and `fetch` stays so the suite can use
 *     it; everything else still throws. Live runs: the port is the runner's
 *     own relay, which holds the proxy capability and the identity token, so
 *     the child never talks to the app or the tenant itself and never holds a
 *     credential of any kind. DNS stays closed on this path too — an IP literal
 *     needs no resolver, which is why the old allowlisted guard's weaker half
 *     (DNS reopened for the tenant host) is gone.
 *
 * Pure: `./core.ts` writes what this returns; `tests/runner-egress-guard.spec.ts`
 * runs the very same text in a child Node.
 */

export interface LoopbackAllowance {
  host: '127.0.0.1';
  port: number;
}

export function netGuardSource(allow: LoopbackAllowance | null): string {
  if (allow && (allow.host !== '127.0.0.1' || !Number.isInteger(allow.port) || allow.port < 1 || allow.port > 65535)) {
    throw new Error('The sandbox network guard only ever opens one loopback port.');
  }
  return `import net from 'node:net';
import dgram from 'node:dgram';
import dns from 'node:dns';
const BLOCK = () => { throw new Error('Network access is disabled in the Clean-Core.io test sandbox.'); };
const ALLOW = ${JSON.stringify(allow)};
const realConnect = net.Socket.prototype.connect;
const realNetConnect = net.connect;
const realCreateConnection = net.createConnection;
// Reads the destination out of either connect() shape: connect(options) and
// connect(port, host). A destination we cannot read is not one we allow.
function target(args) {
  const first = args[0];
  if (Array.isArray(first)) return target(first);
  if (first && typeof first === 'object') {
    if (first.path) return { host: '', port: NaN };
    return { host: String(first.host || first.hostname || ''), port: Number(first.port) };
  }
  return { host: typeof args[1] === 'string' ? args[1] : '', port: Number(first) };
}
// Exactly one address and one port, both literal. No suffixes, no names.
function allowed(t) {
  return !!ALLOW && t.host === ALLOW.host && t.port === ALLOW.port;
}
function gate(real) {
  return function (...args) {
    if (!allowed(target(args))) BLOCK();
    return real.apply(this, args);
  };
}
if (ALLOW) {
  try { net.Socket.prototype.connect = gate(realConnect); } catch {}
  try { net.connect = gate(realNetConnect); net.createConnection = gate(realCreateConnection); } catch {}
} else {
  try { net.Socket.prototype.connect = BLOCK; } catch {}
  try { net.connect = BLOCK; net.createConnection = BLOCK; } catch {}
  // Nothing could legitimately be reached, so fetch is closed here as well
  // rather than relying on the socket gate as the single choke point.
  try { globalThis.fetch = BLOCK; } catch {}
}
try { dgram.createSocket = BLOCK; } catch {}
// The factory is not the only UDP path — the exported Socket constructor and its
// prototype methods can build and send datagrams directly, so neutralise them too.
try {
  if (dgram.Socket && dgram.Socket.prototype) {
    dgram.Socket.prototype.send = BLOCK;
    dgram.Socket.prototype.bind = BLOCK;
    dgram.Socket.prototype.connect = BLOCK;
  }
} catch {}
try { dgram.Socket = BLOCK; } catch {}
try { process.binding = BLOCK; } catch {}
// DNS uses the native c-ares/getaddrinfo resolver, which bypasses net.Socket —
// every JS entry point is closed, on both shapes: the loopback shape connects to
// an IP literal and needs no resolver.
for (const o of [dns, dns.promises, dns.Resolver && dns.Resolver.prototype]) {
  if (!o) continue;
  for (const k of Object.getOwnPropertyNames(o)) {
    try { if (typeof o[k] === 'function') o[k] = BLOCK; } catch {}
  }
}
`;
}
