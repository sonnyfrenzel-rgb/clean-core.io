import { createPublicKey } from 'node:crypto';
import { DEV_URL, PROD_URL, SIGNING_KEY_PATH, SMOKE_HEADERS, SMOKE_ROUTES } from './config.mjs';

/**
 * The checks of a freshly deployed revision, shared by both smoke checks:
 *
 * - dev: the QA agent's smoke after every push to `dev` (qa-review.yml, job `smoke`);
 * - production: after every deploy from `main` (deploy.yml, job `smoke-production`;
 *   codex architecture-04 / code-ci-03).
 *
 * Every check is an unauthenticated GET against an endpoint that is public anyway.
 * Nothing here signs in, writes, sends a mail or calls a model. The one request
 * with a cost is `/api/health?deep=1`: a single Firestore read of `_health/ping`,
 * bounded by the route's own cooldown.
 *
 * What a fetch cannot check is recorded as skipped with its reason, so a result
 * never claims more than it looked at.
 */

export const SMOKE_TARGETS = {
  dev: { name: 'dev', url: DEV_URL, service: 'clean-core-dev', file: 'qa-smoke.enc.json', artifact: 'qa-smoke', waitForPipeline: true },
  production: { name: 'production', url: PROD_URL, service: 'clean-core', file: 'prod-smoke.enc.json', artifact: 'prod-smoke', waitForPipeline: false },
};

/** What the smoke check does not do, and why. Recorded in every result. */
export const SKIPPED_CHECKS = [
  {
    name: 'runner self-test',
    reason: 'POST /api/admin/runner-selftest needs an administrator with a fresh step-up; the smoke check holds no credential. Run it from the admin page after a release that touched the runners.',
  },
  {
    name: 'sign-in dialog',
    reason: 'The dialog renders in the browser; a fetch sees the page shell and its scripts (both checked), not the rendered form.',
  },
];

/** `--target production`, `--target=production`, or dev when absent. */
export function targetFrom(argv) {
  const i = argv.findIndex((a) => a === '--target' || a.startsWith('--target='));
  if (i < 0) return SMOKE_TARGETS.dev;
  const name = argv[i].includes('=') ? argv[i].slice(argv[i].indexOf('=') + 1) : argv[i + 1];
  const target = Object.hasOwn(SMOKE_TARGETS, name || '') ? SMOKE_TARGETS[name] : null;
  if (!target) throw new Error(`Unknown smoke target "${name}". Use one of: ${Object.keys(SMOKE_TARGETS).join(', ')}.`);
  return target;
}

/** The documented rollback: route all traffic back to the revision before. Never run automatically. */
export function rollbackCommands(service) {
  const where = '--region=europe-west1 --project=cleancore-491216';
  return [
    `gcloud run revisions list --service=${service} ${where} --limit=5`,
    `gcloud run services update-traffic ${service} --to-revisions=<previous>=100 ${where}`,
  ];
}

const errorName = (err) => (err?.name === 'AbortError' ? 'timeout' : 'network error');

export async function fetchWithTimeout(url, ms = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'clean-core-qa-smoke' } });
    return { res, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/** /api/health reports the short commit the revision was built from (COMMIT_SHA, set by deploy.yml). */
export const sameCommit = (sha, commit) => typeof commit === 'string' && /^[0-9a-f]{7,40}$/.test(commit) && String(sha).startsWith(commit);

/**
 * Waits until /api/health reports this commit, so the checks run against the new revision and not the one
 * before it. `superseded()` is asked whenever another commit is serving: when it says yes, a newer deploy
 * replaced this one and waiting is pointless.
 */
export async function waitForRevision(base, sha, { timeoutMs = 10 * 60_000, intervalMs = 20_000, superseded = () => false, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const { res } = await fetchWithTimeout(`${base}/api/health`);
      const body = await res.json();
      // Only the four public fields of the probe are kept.
      last = { status: body?.status ?? null, version: body?.version ?? null, commit: body?.commit ?? null };
      if (sameCommit(sha, last.commit)) return { serving: true, health: last };
      if (last.commit && superseded()) return { serving: false, superseded: true, health: last };
    } catch {
      /* the revision may be switching over */
    }
    await sleep(intervalMs);
  }
  return { serving: false, health: last };
}

/** The deep probe once: Firestore reachable, every required key usable, and still this commit. */
export async function checkDeepHealth(base, sha) {
  const name = 'deep health';
  try {
    const { res, ms } = await fetchWithTimeout(`${base}/api/health?deep=1`);
    const body = await res.json().catch(() => null);
    const ok = res.status === 200 && body?.status === 'ok' && sameCommit(sha, body?.commit);
    return { name, ok, status: res.status, ms, health: body?.status ?? null, commit: body?.commit ?? null };
  } catch (err) {
    return { name, ok: false, error: errorName(err) };
  }
}

/** Each route answers 200; the root carries every security header. Returns the landing HTML for the asset check. */
export async function checkRoutes(base) {
  const routes = [];
  let landingHtml = '';
  for (const path of SMOKE_ROUTES) {
    try {
      const { res, ms } = await fetchWithTimeout(`${base}${path}`);
      const route = { path, status: res.status, ms, ok: res.status === 200 };
      if (path === '/') {
        route.missingHeaders = SMOKE_HEADERS.filter((h) => !res.headers.get(h));
        route.ok = route.ok && route.missingHeaders.length === 0;
        if (res.status === 200) landingHtml = await res.text();
      }
      routes.push(route);
    } catch (err) {
      routes.push({ path, status: 0, ms: null, ok: false, error: errorName(err) });
    }
  }
  return { routes, landingHtml };
}

/** The build's own scripts and stylesheets the landing page references — the half of the sign-in page a fetch can see. */
export function staticAssetPaths(html, limit = 40) {
  const out = new Set();
  for (const m of String(html).matchAll(/(?:src|href)="(\/_next\/static\/[^"?#\s]+\.(?:js|css))(?:\?[^"]*)?"/g)) {
    out.add(m[1]);
    if (out.size >= limit) break;
  }
  return [...out];
}

/**
 * A new revision whose HTML names chunks it does not serve renders a blank page, sign-in included, while every
 * route above still answers 200. So each referenced asset must answer 200 too, and a page naming none fails.
 */
export async function checkStaticAssets(base, html) {
  const name = 'static assets';
  const paths = staticAssetPaths(html);
  if (paths.length === 0) return { name, ok: false, count: 0, failed: [], reason: 'the landing page names no build assets' };
  const failed = [];
  for (const path of paths) {
    try {
      const { res } = await fetchWithTimeout(`${base}${path}`);
      if (res.status !== 200) failed.push({ path, status: res.status });
      await res.body?.cancel();
    } catch (err) {
      failed.push({ path, status: 0, error: errorName(err) });
    }
  }
  return { name, ok: failed.length === 0, count: paths.length, failed };
}

/**
 * The published key set must hold exactly one active Ed25519 key that parses as one (codex usp-09): without it,
 * packs from this revision carry the HMAC signature only and "anyone can verify" is not true of them.
 */
export function evaluateSigningKeyring(status, body) {
  const name = 'signing key';
  if (status !== 200) return { name, ok: false, status, reason: 'the key set is not served' };
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  const active = keys.filter((k) => k?.status === 'active');
  if (active.length !== 1) return { name, ok: false, status, keys: keys.length, reason: `${active.length} active keys, expected exactly one` };
  const key = active[0];
  if (key.algorithm !== 'Ed25519') return { name, ok: false, status, reason: 'the active key is not Ed25519' };
  if (typeof key.keyId !== 'string' || !key.keyId) return { name, ok: false, status, reason: 'the active key has no keyId' };
  try {
    if (createPublicKey(String(key.publicKeyPem)).asymmetricKeyType !== 'ed25519') throw new Error('not ed25519');
  } catch {
    return { name, ok: false, status, keyId: key.keyId, reason: 'the active key does not parse as an Ed25519 public key' };
  }
  return { name, ok: true, status, keyId: key.keyId, keys: keys.length };
}

export async function checkSigningKey(base) {
  try {
    const { res } = await fetchWithTimeout(`${base}${SIGNING_KEY_PATH}`);
    const body = await res.json().catch(() => null);
    return evaluateSigningKeyring(res.status, body);
  } catch (err) {
    return { name: 'signing key', ok: false, error: errorName(err) };
  }
}

/** Every check after the revision is serving. */
export async function runChecks(base, sha) {
  const { routes, landingHtml } = await checkRoutes(base);
  const checks = [await checkDeepHealth(base, sha), await checkStaticAssets(base, landingHtml), await checkSigningKey(base)];
  return { routes, checks };
}

/** Readable form of an opened result — for a maintainer's terminal, never for a public log. */
export function renderSmoke(s) {
  if (!s) return 'Smoke: no result.';
  const pipeline = s.pipeline ? `pipeline ${s.pipeline.conclusion}; ` : '';
  const lines = [`Smoke ${s.target ? `(${s.target}) ` : ''}${s.ok ? 'OK' : 'NOT OK'} — ${pipeline}new revision serving: ${s.revision?.serving ? 'yes' : s.revision?.superseded ? 'no, superseded' : 'no'}`];
  for (const j of (s.pipeline?.jobs || []).filter((j) => j.conclusion !== 'success')) lines.push(`  job ${j.name}: ${j.conclusion}`);
  for (const r of (s.routes || []).filter((r) => !r.ok)) lines.push(`  ${r.path}: ${r.status || r.error}${r.missingHeaders?.length ? ` · missing headers ${r.missingHeaders.join(', ')}` : ''}`);
  for (const c of (s.checks || []).filter((c) => !c.ok)) {
    const failed = c.failed?.length ? ` · ${c.failed.map((f) => `${f.path} ${f.status || f.error}`).join(', ')}` : '';
    lines.push(`  ${c.name}: ${c.reason || c.error || `HTTP ${c.status}`}${failed}`);
  }
  for (const k of s.skipped || []) lines.push(`  not checked — ${k.name}: ${k.reason}`);
  return lines.join('\n');
}
