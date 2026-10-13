/**
 * What a refused `/api/gemini` request costs the server — measured, per path.
 *
 * Calls the route handler in-process (no Next server) against the local
 * Firebase emulators, and counts for every refused path:
 *   - Firestore RPCs, by method, and the documents they read and write (the
 *     billable unit), by patching the two funnels every Firestore call goes
 *     through (`Firestore.prototype.request` / `requestStream`);
 *   - CPU time per request (`process.cpuUsage`, user + system, this process);
 *   - wall time per request (median; against the emulator, so only the
 *     relative order means anything — production Firestore is a network hop).
 *
 * The rate limiter is live here: `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` is left
 * unset (the limiter skips itself under it), and the Admin SDK is pointed at
 * the emulators with the plain `*_EMULATOR_HOST` variables instead.
 *
 * Token verification against the Auth emulator skips the RS256 signature
 * check production does; that check is measured on its own at the end
 * (`crypto.verify` on a token-sized RS256 JWT).
 *
 * The attempt limiter (`lib/attempt-limit.ts`, since 13.10.2026) sits in
 * front of every authenticated path below, so the first table is measured
 * with it emptied before each request — it shows what each path costs once it
 * is reached. The second table (`onceSpent`) is the limiter's own refusal: the
 * same paths once the account's allowance is spent. There every path must
 * answer 429 `attempt-limit` with no Firestore RPC, and the paths with small
 * bodies under 1 ms of CPU (see the comment at the check for why not the
 * 0.5 ms first proposed); the script exits 1 when one does not
 * (docs/design/gemini-attempt-limit.md §4 item 3).
 *
 * Run (emulators up: firebase emulators:start --only auth,firestore --project=cleancore-491216):
 *   npx tsx scripts/measure-gemini-refusals.ts [iterations=200]
 *
 * Roadmap: "Request-attempt limit for /api/gemini — analyse before building";
 * findings in docs/design/gemini-attempt-limit.md.
 */
import crypto from 'crypto';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT ||= 'cleancore-491216';
process.env.RATE_LIMIT_PEPPER ||= `measure-${crypto.randomBytes(8).toString('hex')}`;
delete process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
delete process.env.GEMINI_API_KEY; // the "all gates passed" baseline ends in 503 no-key, never a provider call
process.env.AUDIT_SIGNING_KEY ||= 'measure-only';

const ITER = Number(process.argv[2] || 200);
const PROJECT_ID = 'cleancore-491216';

// ---- Firestore RPC counter -------------------------------------------------
type Tally = { rpcs: Record<string, number>; docReads: number; docWrites: number };
const tally: Tally = { rpcs: {}, docReads: 0, docWrites: 0 };
function resetTally() { tally.rpcs = {}; tally.docReads = 0; tally.docWrites = 0; }

async function patchFirestore() {
  const mod: any = await import('@google-cloud/firestore');
  const F = mod.Firestore ?? mod.default?.Firestore;
  const origRequest = F.prototype.request;
  const origStream = F.prototype.requestStream;
  F.prototype.request = function (methodName: string, req: any, ...rest: any[]) {
    tally.rpcs[methodName] = (tally.rpcs[methodName] || 0) + 1;
    if (methodName === 'commit') tally.docWrites += (req?.writes?.length || 0);
    return origRequest.call(this, methodName, req, ...rest);
  };
  F.prototype.requestStream = function (methodName: string, bidi: boolean, req: any, ...rest: any[]) {
    tally.rpcs[methodName] = (tally.rpcs[methodName] || 0) + 1;
    if (methodName === 'batchGetDocuments') tally.docReads += (req?.documents?.length || 0);
    if (methodName === 'runQuery') tally.docReads += 1; // minimum one read per query
    return origStream.call(this, methodName, bidi, req, ...rest);
  };
}

// ---- Emulator account -------------------------------------------------------
async function emulatorAccount(): Promise<{ uid: string; idToken: string }> {
  const res = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `measure-${Date.now()}-${crypto.randomInt(1e9)}@cleancore-test.io`, password: `x-${crypto.randomUUID()}`, returnSecureToken: true }),
    },
  );
  const data = await res.json();
  if (!data.idToken) throw new Error(`emulator sign-up failed: ${JSON.stringify(data)}`);
  return { uid: data.localId, idToken: data.idToken };
}

function median(xs: number[]) { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

async function main() {
  await patchFirestore();
  const { POST } = await import('../app/api/gemini/route');
  const { NextRequest } = await import('next/server');
  const { getAdminDb } = await import('../lib/firebase-admin');
  const { TERMS_VERSION } = await import('../lib/constants');
  const { LEASE_COLLECTION } = await import('../lib/transformation/lease');
  const { geminiAttemptLimiter, GEMINI_ATTEMPT_ALLOWANCES, ATTEMPT_LIMIT_CODE } = await import('../lib/attempt-limit');
  const { db } = await getAdminDb();

  // Two accounts: one approved and over its hourly limit, one approved and fresh.
  const over = await emulatorAccount();
  const fresh = await emulatorAccount();
  const profile = {
    status: 'approved', tier: 'pilot', termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
    createdAt: new Date(),
  };
  await db.collection('users').doc(over.uid).set(profile);
  await db.collection('users').doc(fresh.uid).set(profile);

  // The over-quota account's window: 20 calls in the last hour.
  const docId = crypto.createHmac('sha256', process.env.RATE_LIMIT_PEPPER!).update(`gemini:${over.uid}`).digest('hex');
  const now = Date.now();
  await db.collection('rate_limits').doc(docId).set({
    timestamps: Array.from({ length: 20 }, (_, i) => now - 60_000 + i), expiresAt: new Date(now + 3_600_000),
  });

  // Leases: an expired one and an open one, both the fresh account's.
  const projectId = `measureProj${crypto.randomInt(1e9)}`;
  const leaseBase = { v: 1, projectId, uid: fresh.uid, generationToken: 't', plannedCalls: 10, budget: 48, used: 0, inFlight: 0, status: 'open' };
  await db.collection('projects').doc(projectId).collection(LEASE_COLLECTION).doc('expiredLease01').set({
    ...leaseBase, leaseId: 'expiredLease01', createdAt: now - 3_600_000, expiresAt: now - 1_000,
  });
  await db.collection('projects').doc(projectId).collection(LEASE_COLLECTION).doc('openLease00001').set({
    ...leaseBase, leaseId: 'openLease00001', createdAt: now, expiresAt: now + 3_600_000,
  });

  const URL_ = 'http://localhost/api/gemini';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const prompt = 'x'.repeat(2_000);
  const bigBody = JSON.stringify({ prompt: 'y'.repeat(1_700_000) }); // over the 1,565,536-byte bound
  const leased = (leaseId: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ prompt, stage: 'transformation', lease: { projectId, leaseId }, ...extra });

  type Path = { name: string; make: () => Request; expect: number };
  const paths: Path[] = [
    { name: 'missing auth (no Authorization header)', expect: 401,
      make: () => new NextRequest(URL_, { method: 'POST', body: JSON.stringify({ prompt }) }) },
    { name: 'invalid token (garbage Bearer)', expect: 401,
      make: () => new NextRequest(URL_, { method: 'POST', headers: auth('not.a.jwt'), body: JSON.stringify({ prompt }) }) },
    { name: 'bad body (not JSON)', expect: 400,
      make: () => new NextRequest(URL_, { method: 'POST', headers: auth(over.idToken), body: '{nope' }) },
    { name: '413, declared Content-Length', expect: 413,
      make: () => new NextRequest(URL_, { method: 'POST', headers: { ...auth(over.idToken), 'Content-Length': String(bigBody.length) }, body: bigBody }) },
    { name: '413, streamed (no Content-Length, 1.7 MB)', expect: 413,
      make: () => new NextRequest(URL_, {
        method: 'POST', headers: auth(over.idToken), duplex: 'half',
        body: new ReadableStream({ start(c) { const b = Buffer.from(bigBody); for (let i = 0; i < b.length; i += 65536) c.enqueue(b.subarray(i, i + 65536)); c.close(); } }),
      } as any) },
    { name: 'over the hourly quota (21st call)', expect: 429,
      make: () => new NextRequest(URL_, { method: 'POST', headers: auth(over.idToken), body: JSON.stringify({ prompt, stage: 'design' }) }) },
    { name: 'lease named in a bad shape', expect: 400,
      make: () => new NextRequest(URL_, { method: 'POST', headers: auth(fresh.idToken), body: JSON.stringify({ prompt, stage: 'transformation', lease: { projectId: '../x', leaseId: 1 } }) }) },
    { name: 'lease, wrong stage', expect: 400,
      make: () => new NextRequest(URL_, { method: 'POST', headers: auth(fresh.idToken), body: JSON.stringify({ prompt, stage: 'design', lease: { projectId, leaseId: 'openLease00001' } }) }) },
    { name: 'lease, unknown lease id', expect: 403,
      make: () => new NextRequest(URL_, { method: 'POST', headers: auth(fresh.idToken), body: leased('noSuchLease001') }) },
    { name: 'lease, expired', expect: 403,
      make: () => new NextRequest(URL_, { method: 'POST', headers: auth(fresh.idToken), body: leased('expiredLease01') }) },
    { name: 'lease valid, later gate refuses (unknown answer shape)', expect: 400,
      make: () => new NextRequest(URL_, { method: 'POST', headers: auth(fresh.idToken), body: leased('openLease00001', { responseShape: 'nope' }) }) },
    { name: 'lease valid, every gate passed, no model key (503)', expect: 503,
      make: () => new NextRequest(URL_, { method: 'POST', headers: auth(fresh.idToken), body: leased('openLease00001') }) },
  ];

  // Silence the route's per-request console.error (invalid token) during timing.
  // A rejected token is summarised at most once a minute (lib/firebase-admin.ts,
  // logRejectedToken), so both streams are counted.
  const origErr = console.error; let errLines = 0;
  console.error = () => { errLines++; };
  const origWarn = console.warn; let warnLines = 0;
  console.warn = () => { warnLines++; };

  const results: any[] = [];
  for (const p of paths) {
    // Warm-up (module init, gRPC channel, cert cache). The attempt limiter is
    // emptied before every request: this table is what each path costs once
    // reached, and one account sends far more than its allowance here.
    for (let i = 0; i < 5; i++) { geminiAttemptLimiter.clear(); const r = await POST(p.make() as any); await r.text(); }
    resetTally(); errLines = 0; warnLines = 0;
    const walls: number[] = [];
    let status = 0;
    const cpu0 = process.cpuUsage();
    for (let i = 0; i < ITER; i++) {
      geminiAttemptLimiter.clear();
      const req = p.make();
      const t0 = performance.now();
      const res = await POST(req as any);
      await res.text();
      walls.push(performance.now() - t0);
      status = res.status;
    }
    const cpu = process.cpuUsage(cpu0);
    const per = (n: number) => +(n / ITER).toFixed(2);
    results.push({
      path: p.name,
      status,
      expected: p.expect,
      rpcsPerReq: Object.fromEntries(Object.entries(tally.rpcs).map(([k, v]) => [k, per(v)])),
      docReadsPerReq: per(tally.docReads),
      docWritesPerReq: per(tally.docWrites),
      cpuMsPerReq: +(((cpu.user + cpu.system) / 1000) / ITER).toFixed(3),
      wallMsMedian: +median(walls).toFixed(2),
      errorLogLinesPerReq: per(errLines),
      warnLogLinesTotal: warnLines,
    });
  }
  console.error = origErr;
  console.warn = origWarn;

  // The attempt limiter's own refusal: every authenticated path again, once the
  // account has spent its allowance. Building a request (1.7 ms for the 413
  // bodies, and the garbage collection it causes later, on whatever thread)
  // is not the route's cost: the same number of requests is built and thrown
  // away without the handler, and that CPU is subtracted.
  const spent: Record<string, unknown>[] = [];
  const spentFailures: string[] = [];
  const perMinute = GEMINI_ATTEMPT_ALLOWANCES[0].max;
  const SPENT_CPU_BOUND_MS = 1;
  for (const p of paths) {
    const bearer = p.make().headers.get('Authorization');
    const uid = bearer === `Bearer ${over.idToken}` ? over.uid : bearer === `Bearer ${fresh.idToken}` ? fresh.uid : null;
    if (!uid) continue; // refused before the limiter: no account to count
    geminiAttemptLimiter.clear();
    for (let i = 0; i < perMinute; i++) geminiAttemptLimiter.attempt(uid);
    resetTally();
    const walls: number[] = [];
    const statuses = new Set<number>();
    const codes = new Set<unknown>();
    // The harness alone: build and drop the same requests.
    const h0 = process.cpuUsage();
    for (let i = 0; i < ITER; i++) { const req = p.make(); await Promise.resolve(req); }
    const harness = process.cpuUsage(h0);
    const c0 = process.cpuUsage();
    for (let i = 0; i < ITER; i++) {
      const req = p.make();
      const t0 = performance.now();
      const res = await POST(req as any);
      const text = await res.text();
      walls.push(performance.now() - t0);
      statuses.add(res.status);
      try { codes.add(JSON.parse(text).code); } catch { codes.add(undefined); }
    }
    const c = process.cpuUsage(c0);
    const rpcs = Object.values(tally.rpcs).reduce((a, b) => a + b, 0);
    const cpuMicros = Math.max(0, c.user + c.system - (harness.user + harness.system));
    const cpuMsPerReq = +((cpuMicros / 1000) / ITER).toFixed(3);
    spent.push({
      path: p.name,
      statuses: [...statuses],
      codes: [...codes],
      rpcsTotal: rpcs,
      docReadsTotal: tally.docReads,
      cpuMsPerReq,
      harnessCpuMsPerReq: +(((harness.user + harness.system) / 1000) / ITER).toFixed(3),
      wallMsMedian: +median(walls).toFixed(3),
    });
    if (statuses.size !== 1 || !statuses.has(429) || codes.size !== 1 || !codes.has(ATTEMPT_LIMIT_CODE)) spentFailures.push(`${p.name}: not refused by the attempt limit`);
    if (rpcs !== 0) spentFailures.push(`${p.name}: ${rpcs} Firestore RPCs once the allowance was spent`);
    // The CPU check is a guard against real work (a body parse is about 1 ms, a
    // Firestore read 3 ms and more), not a benchmark: process CPU includes GC
    // and gRPC threads, and on Windows the same refusal measures 0.2–0.8 ms
    // from run to run. Requests whose building alone costs more than the bound
    // (the 1.7 MB bodies) leave GC behind that no subtraction removes, so they
    // are held to the RPC count and the answer only.
    const harnessMs = (harness.user + harness.system) / 1000 / ITER;
    if (harnessMs < 0.1 && cpuMsPerReq >= SPENT_CPU_BOUND_MS) spentFailures.push(`${p.name}: ${cpuMsPerReq} ms of CPU per refused attempt`);
  }
  geminiAttemptLimiter.clear();

  // What a Firestore attempt counter would add to every request: one admitted
  // `assertRateLimit` transaction (read + commit), on a key with a short window.
  {
    const { assertRateLimit } = await import('../lib/rate-limit');
    resetTally();
    const walls: number[] = [];
    const cpu0 = process.cpuUsage();
    for (let i = 0; i < ITER; i++) {
      const t0 = performance.now();
      await assertRateLimit(`attempt:${crypto.randomUUID()}`, 1000, 60_000);
      walls.push(performance.now() - t0);
    }
    const cpu = process.cpuUsage(cpu0);
    const per = (n: number) => +(n / ITER).toFixed(2);
    results.push({
      path: '(reference) one admitted Firestore limiter transaction — what an attempt counter adds',
      rpcsPerReq: Object.fromEntries(Object.entries(tally.rpcs).map(([k, v]) => [k, per(v)])),
      docReadsPerReq: per(tally.docReads),
      docWritesPerReq: per(tally.docWrites),
      cpuMsPerReq: +(((cpu.user + cpu.system) / 1000) / ITER).toFixed(3),
      wallMsMedian: +median(walls).toFixed(2),
    });
  }

  // The signature check the emulator skips: RS256 verify of a Firebase-sized token.
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const signingInput = `${b64({ alg: 'RS256', kid: 'k', typ: 'JWT' })}.${b64({ iss: `https://securetoken.google.com/${PROJECT_ID}`, aud: PROJECT_ID, sub: 'u'.repeat(28), auth_time: 1, iat: 1, exp: 2, firebase: { sign_in_provider: 'password', identities: { email: ['a@b.c'] } } })}`;
  const sig = crypto.sign('sha256', Buffer.from(signingInput), privateKey);
  const N = 5_000;
  const c0 = process.cpuUsage();
  for (let i = 0; i < N; i++) crypto.verify('sha256', Buffer.from(signingInput), publicKey, sig);
  const c1 = process.cpuUsage(c0);

  console.log(JSON.stringify({
    iterations: ITER,
    node: process.version,
    results,
    onceSpent: spent,
    onceSpentFailures: spentFailures,
    rs256VerifyCpuMs: +(((c1.user + c1.system) / 1000) / N).toFixed(4),
  }, null, 2));
  process.exit(spentFailures.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
