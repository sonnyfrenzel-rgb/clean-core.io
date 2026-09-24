import { verifyCapability, type CapabilityClaims } from './s4-proxy-capability';
import type { Admission } from './s4-proxy-capability-store';
import { bearerToken, type ExpectedIdentity, type IdTokenVerdict } from './google-id-token';
import type { S4ConfigResolved } from './s4-credentials';

/**
 * The credential proxy of live test runs (roadmap 8.9) — the only place a
 * decrypted tenant credential meets a request that generated code caused.
 *
 * The live runner executes generated code with no credential of any kind. When
 * that code calls the tenant, the runner's relay forwards the call here,
 * carrying two things: an ID token of the runner's service account (who is
 * calling) and the run's capability (what for). This handler then:
 *
 *   1. refuses unless the proxy is configured — no audience or runner account
 *      configured means no proxy (fail closed);
 *   2. verifies the runner's identity: a Google-signed ID token for the app's
 *      audience, issued to exactly `RUNNER_SERVICE_ACCOUNT`;
 *   3. verifies the capability's signature and expiry, then admits the request
 *      against its server-side state — the run must still be running, and
 *      within its request budget;
 *   4. re-checks the account's tenant access (revocation, suspension, enrolled
 *      second factor) — the state may have changed since the run started;
 *   5. loads the stored connection and refuses unless it still points at the
 *      host the capability names; forwards only to that host, only GET/HEAD,
 *      only below `/sap/`, with an allowlist of request headers, never
 *      following a redirect, under a deadline and a size limit;
 *   6. puts the credentials on the outgoing request itself, and answers with
 *      an allowlist of response headers and a body from which the credential
 *      values are scrubbed. Nothing credential-shaped is logged.
 *
 * Everything that touches Firestore, the network or the clock comes in as a
 * dependency, so `tests/s4-proxy.spec.ts` drives the whole decision with a
 * mocked `fetch` and no server.
 */

export const PROXY_TIMEOUT_MS = 15_000;
export const PROXY_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_PATH_CHARS = 2_000;
const MAX_QUERY_CHARS = 4_096;

/** Request headers the tenant may see. Everything else — Authorization above all — is dropped. */
export const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'dataserviceversion',
  'maxdataserviceversion',
  'odata-version',
  'odata-maxversion',
  'if-none-match',
] as const;

/** Response headers the runner may see. No cookies, no challenges, no locations. */
export const RETURNED_RESPONSE_HEADERS = ['content-type', 'etag', 'dataserviceversion', 'odata-version'] as const;

export interface S4ProxyConfig {
  /** The app's own URL as the runner addresses it — the token audience. */
  audience: string;
  /** The runner's service account, the only caller admitted. */
  runnerEmail: string;
}

/** Reads the proxy's configuration; `null` = not configured = every request refused. */
export function readS4ProxyConfig(env: Record<string, string | undefined> = process.env): S4ProxyConfig | null {
  const base = (env.S4_PROXY_BASE_URL || '').trim();
  const runnerEmail = (env.RUNNER_SERVICE_ACCOUNT || '').trim();
  if (!base || !runnerEmail) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:') return null;
    return { audience: url.origin, runnerEmail };
  } catch {
    return null;
  }
}

export interface ForwardInit {
  method: 'GET' | 'HEAD';
  headers: Record<string, string>;
  signal: AbortSignal;
}

export interface S4ProxyDeps {
  config: S4ProxyConfig | null;
  verifyIdToken(token: string, expected: ExpectedIdentity): Promise<IdTokenVerdict>;
  capabilityKey(): Buffer;
  admit(claims: CapabilityClaims): Promise<Admission>;
  /** Throws (with `status`) when the account may not reach its tenant any more. */
  assertTenantAccess(uid: string): Promise<void>;
  loadConnection(uid: string): Promise<S4ConfigResolved | null>;
  /** Performs the outgoing request. Must not follow redirects. */
  forward(url: string, init: ForwardInit): Promise<Response>;
  now(): number;
  log(message: string, fields: Record<string, unknown>): void;
}

const refuse = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/**
 * Percent-encodes a path segment but keeps the RFC 3986 sub-delimiters OData
 * uses literally — `$metadata`, `A_Entity('1')`, `key=value,other` — because a
 * gateway need not treat `%24metadata` as `$metadata`.
 */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%(24|27|28|29|2C|3B|3D|3A|40|21|2A|2B)/gi, (m) => decodeURIComponent(m));
}

/**
 * The tenant URL for a proxied path, or a reason why there is none. The
 * origin comes from the stored connection and nowhere else; the path must
 * stay under `/sap/`, segment by segment.
 */
export function tenantTarget(storedUrl: string, host: string, path: string[], search: string): { url: string } | { error: string } {
  let origin: URL;
  try {
    origin = new URL(storedUrl);
  } catch {
    return { error: 'The stored tenant connection has no valid URL.' };
  }
  if (origin.protocol !== 'https:' || origin.hostname.toLowerCase() !== host) {
    return { error: 'The stored tenant connection no longer points at the host this run was started for.' };
  }
  if (!Array.isArray(path) || path.length < 2 || path[0] !== 'sap') return { error: 'Only paths below /sap/ are proxied.' };
  for (const seg of path) {
    if (!seg || seg === '.' || seg === '..' || /[/\\\u0000-\u001f]/.test(seg) || seg.length > 200) {
      return { error: 'The path is not a plain tenant path.' };
    }
  }
  const pathname = '/' + path.map(encodeSegment).join('/');
  if (pathname.length > MAX_PATH_CHARS) return { error: 'The path is too long.' };
  if (search.length > MAX_QUERY_CHARS || search.includes('#')) return { error: 'The query is too long.' };
  const url = new URL(`${origin.origin}${pathname}${search}`);
  if (url.hostname.toLowerCase() !== host || url.protocol !== 'https:' || url.username || url.password) {
    return { error: 'The target left the tenant host.' };
  }
  return { url: url.toString() };
}

/** The credential headers for a stored connection, or `null` for a scheme the proxy does not carry. */
export function credentialHeaders(cfg: S4ConfigResolved): { headers: Record<string, string>; secrets: string[] } | null {
  if (cfg.authType === 'basic') {
    if (!cfg.username || !cfg.password) return null;
    const basic = Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
    // The username too: it is half of the credential, and the runner has no use for it.
    return { headers: { authorization: `Basic ${basic}` }, secrets: [cfg.password, cfg.username, basic] };
  }
  if (cfg.authType === 'sap_hub') {
    if (!cfg.password) return null;
    return { headers: { apikey: cfg.password }, secrets: [cfg.password] };
  }
  if (cfg.authType === 'none') return { headers: {}, secrets: [] };
  // oauth2 and btp_destination fetch tokens from, or are routed through, a
  // second host. The proxy serves one host per run and does not carry them.
  return null;
}

/**
 * The shortest credential value the proxy can scrub from an answer. A shorter
 * one would match ordinary text all over the answer and shred it, and skipping
 * it would let it through — so the proxy refuses to forward for a connection
 * holding one (`hasUnscrubbableSecret`) instead of choosing either.
 */
export const MIN_SCRUBBABLE_SECRET_CHARS = 4;

export function hasUnscrubbableSecret(secrets: string[]): boolean {
  return secrets.some((s) => s.length > 0 && s.length < MIN_SCRUBBABLE_SECRET_CHARS);
}

/**
 * Replaces every non-empty credential value in a text with a marker, longest
 * first (so a value contained in another is not left half-replaced). No value
 * is skipped for being short; the handler never gets here with one.
 */
export function scrubSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const s of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
    out = out.split(s).join('[redacted]');
  }
  return out;
}

async function readBounded(res: Response, maxBytes: number, deadline: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('too large');
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  const timer = setTimeout(() => reader.cancel().catch(() => {}), Math.max(1, deadline - Date.now()));
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('too large');
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
  }
  if (Date.now() > deadline) throw new Error('too slow');
  return Buffer.concat(chunks);
}

export async function handleS4ProxyRequest(
  req: Request,
  params: { capability: string; path: string[] },
  deps: S4ProxyDeps,
): Promise<Response> {
  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return refuse(405, 'The proxy is read-only.');

  // 1. Configured, or closed.
  if (!deps.config) return refuse(503, 'The credential proxy is not configured on this deployment.');

  // 2. Who is calling: the runner's service account, for this app.
  const token = bearerToken(req.headers.get('authorization'));
  if (!token) return refuse(401, 'Runner identity required.');
  const identity = await deps.verifyIdToken(token, { audience: deps.config.audience, email: deps.config.runnerEmail });
  if (!identity.ok) return refuse(401, 'Runner identity rejected.');

  // 3. What for: a capability of a run that is still running.
  let key: Buffer;
  try {
    key = deps.capabilityKey();
  } catch {
    return refuse(503, 'The credential proxy is not configured on this deployment.');
  }
  const cap = verifyCapability(params.capability, key, deps.now());
  if (!cap.ok) return refuse(403, cap.reason);
  const claims = cap.claims;
  const admission = await deps.admit(claims);
  if (!admission.ok) return refuse(403, admission.reason);

  // 4. The account may still reach its tenant.
  try {
    await deps.assertTenantAccess(claims.uid);
  } catch (e) {
    const status = (e as { status?: number })?.status;
    return refuse(status === 404 ? 403 : status || 403, 'S/4HANA live access is no longer permitted for this account.');
  }

  // 5. The stored connection, still pointing where the run was started for.
  let cfg: S4ConfigResolved | null;
  try {
    cfg = await deps.loadConnection(claims.uid);
  } catch {
    return refuse(500, 'The stored tenant connection could not be read.');
  }
  if (!cfg) return refuse(403, 'No tenant connection is stored for this account.');
  const creds = credentialHeaders(cfg);
  if (!creds) return refuse(501, 'This authentication type is not available to test runs.');
  if (hasUnscrubbableSecret(creds.secrets)) {
    return refuse(
      422,
      `The stored tenant credentials contain a value shorter than ${MIN_SCRUBBABLE_SECRET_CHARS} characters, which cannot be kept out of the tenant's answer; the proxy does not forward with it.`,
    );
  }

  const reqUrl = new URL(req.url);
  const target = tenantTarget(cfg.url, claims.host, params.path, reqUrl.search);
  if ('error' in target) return refuse(403, target.error);

  const headers: Record<string, string> = { 'user-agent': 'CleanCore-TestRunner-Proxy/1.0' };
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const v = req.headers.get(name);
    if (v && v.length <= 1024) headers[name] = v;
  }
  // Last, so nothing the runner sent can stand in for them.
  Object.assign(headers, creds.headers);

  // 6. Forward, bounded; never follow a redirect.
  const deadline = Date.now() + PROXY_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await deps.forward(target.url, { method, headers, signal: controller.signal });
  } catch {
    clearTimeout(timer);
    deps.log('s4-proxy: tenant request failed', { projectId: claims.pid });
    return refuse(502, 'The tenant could not be reached through the proxy.');
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    clearTimeout(timer);
    upstream.body?.cancel().catch(() => {});
    return refuse(502, 'The tenant answered with a redirect; the proxy does not follow redirects.');
  }

  let body: Uint8Array = new Uint8Array(0);
  try {
    if (method === 'GET') body = await readBounded(upstream, PROXY_MAX_RESPONSE_BYTES, deadline);
  } catch {
    clearTimeout(timer);
    return refuse(502, 'The tenant answer exceeded the proxy limits.');
  }
  clearTimeout(timer);

  const out = new Headers({ 'cache-control': 'no-store' });
  for (const name of RETURNED_RESPONSE_HEADERS) {
    const v = upstream.headers.get(name);
    if (v) out.set(name, v);
  }
  const text = scrubSecrets(Buffer.from(body).toString('utf8'), creds.secrets);
  deps.log('s4-proxy: forwarded', { projectId: claims.pid, status: upstream.status });
  const noBody = method === 'HEAD' || upstream.status === 204 || upstream.status === 205;
  return new Response(noBody ? null : text, { status: upstream.status, headers: out });
}
