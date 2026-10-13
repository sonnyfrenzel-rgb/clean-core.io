import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  ATTEMPT_LIMIT_CODE,
  ATTEMPT_LIMIT_MAX_KEYS,
  GEMINI_ATTEMPT_ALLOWANCES,
  attemptLimitMessage,
  createAttemptLimiter,
  geminiAttemptLimiter,
} from '../lib/attempt-limit';

/**
 * The request-attempt limit of `/api/gemini` (owner decision 13.10.2026,
 * `docs/design/gemini-attempt-limit.md` §4 items 1, 4 and 5). Server-free: the
 * limiter is a pure module with an injected clock, and the route's wiring is
 * held in its source. The route-level loop is `tests/gemini-attempt-limit-route.spec.ts`
 * (emulators and the test server); the proof that a spent allowance costs no
 * Firestore operation is `scripts/measure-gemini-refusals.ts`.
 */

const ROOT = path.join(__dirname, '..');
// Line endings normalised: a checkout may carry CRLF.
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, set: (v: number) => { t = v; }, advance: (ms: number) => { t += ms; } };
}

test.describe('the limiter', () => {
  test('the allowances are 60 a minute and 300 an hour, in one place', () => {
    expect(GEMINI_ATTEMPT_ALLOWANCES).toEqual([
      { max: 60, windowMs: MINUTE },
      { max: 300, windowMs: HOUR },
    ]);
    expect(Object.isFrozen(GEMINI_ATTEMPT_ALLOWANCES)).toBe(true);
    expect(ATTEMPT_LIMIT_CODE).toBe('attempt-limit');
    // The numbers are written nowhere else in the route.
    expect(read('app/api/gemini/route.ts')).not.toMatch(/\b(60|300), ?(60 \* 1000|60_000|3_600_000|60 \* 60 \* 1000)\b/);
  });

  test('attempt 60 within a minute passes and attempt 61 is refused, with the wait until the first leaves', () => {
    const c = clock();
    const limiter = createAttemptLimiter({ now: c.now });
    for (let i = 0; i < 60; i++) {
      expect(limiter.attempt('a'), `attempt ${i + 1}`).toEqual({ ok: true });
      c.advance(500); // 60 attempts over 30 s
    }
    const refused = limiter.attempt('a');
    expect(refused.ok).toBe(false);
    // The first attempt was 30 s ago; it leaves the minute in 30 s.
    expect(refused).toEqual({ ok: false, retryAfterSeconds: 30 });
  });

  test('the minute window slides: once the oldest attempt leaves it, one more passes', () => {
    const c = clock();
    const limiter = createAttemptLimiter({ now: c.now });
    for (let i = 0; i < 60; i++) { limiter.attempt('a'); c.advance(SECOND); }
    // t = start + 60 s: the first attempt (at start) is exactly a minute old and out.
    expect(limiter.attempt('a')).toEqual({ ok: true });
    expect(limiter.attempt('a').ok).toBe(false);
    c.advance(SECOND);
    expect(limiter.attempt('a')).toEqual({ ok: true });
  });

  test('attempt 300 within an hour passes and attempt 301 is refused, though no minute holds 60', () => {
    const c = clock();
    const limiter = createAttemptLimiter({ now: c.now });
    for (let i = 0; i < 300; i++) {
      expect(limiter.attempt('a'), `attempt ${i + 1}`).toEqual({ ok: true });
      c.advance(10 * SECOND); // 6 a minute, 300 in 50 minutes
    }
    const refused = limiter.attempt('a');
    expect(refused.ok).toBe(false);
    // The first attempt was 50 minutes ago; it leaves the hour in 10 minutes.
    expect(refused).toEqual({ ok: false, retryAfterSeconds: 10 * 60 });
    c.advance(10 * MINUTE);
    expect(limiter.attempt('a')).toEqual({ ok: true });
  });

  test('a refused attempt is not recorded: a client that waits as told is admitted', () => {
    const c = clock();
    const limiter = createAttemptLimiter({ now: c.now });
    for (let i = 0; i < 60; i++) limiter.attempt('a');
    // A flood of refused attempts in the same minute moves nothing.
    let last = limiter.attempt('a');
    for (let i = 0; i < 1000; i++) { c.advance(10); last = limiter.attempt('a'); }
    expect(last.ok).toBe(false);
    const wait = (last as { retryAfterSeconds: number }).retryAfterSeconds;
    expect(wait).toBeGreaterThanOrEqual(1);
    expect(wait).toBeLessThanOrEqual(60);
    c.advance(wait * SECOND);
    expect(limiter.attempt('a')).toEqual({ ok: true });
  });

  test('two keys do not interfere', () => {
    const c = clock();
    const limiter = createAttemptLimiter({ now: c.now });
    for (let i = 0; i < 60; i++) limiter.attempt('a');
    expect(limiter.attempt('a').ok).toBe(false);
    for (let i = 0; i < 60; i++) expect(limiter.attempt('b'), `b ${i + 1}`).toEqual({ ok: true });
    expect(limiter.attempt('b').ok).toBe(false);
  });

  test('a key idle for longer than the hour is dropped', () => {
    const c = clock();
    const limiter = createAttemptLimiter({ now: c.now });
    limiter.attempt('a');
    c.advance(30 * MINUTE);
    limiter.attempt('b');
    expect(limiter.size()).toBe(2);
    c.advance(30 * MINUTE + 1);
    limiter.attempt('c'); // anything that happens sweeps what is idle
    expect(limiter.size()).toBe(2); // 'a' gone, 'b' (30 min) and 'c' held
    c.advance(HOUR);
    limiter.attempt('d');
    expect(limiter.size()).toBe(1);
  });

  test('the key cap drops the least recently counted key, and memory stays bounded under a flood of keys', () => {
    const c = clock();
    const limiter = createAttemptLimiter({ now: c.now, maxKeys: 3 });
    limiter.attempt('a'); c.advance(1);
    limiter.attempt('b'); c.advance(1);
    limiter.attempt('c'); c.advance(1);
    limiter.attempt('a'); c.advance(1); // 'a' is now the most recent; 'b' the oldest
    limiter.attempt('d');
    expect(limiter.size()).toBe(3);
    // 'b' was dropped and starts afresh; 'a' kept its two attempts.
    for (let i = 0; i < 58; i++) expect(limiter.attempt('a').ok).toBe(true);
    expect(limiter.attempt('a').ok).toBe(false);

    // The production cap, against a flood of distinct keys.
    const flood = createAttemptLimiter({ now: c.now });
    for (let i = 0; i < ATTEMPT_LIMIT_MAX_KEYS * 3; i++) flood.attempt(`uid-${i}`);
    expect(flood.size()).toBe(ATTEMPT_LIMIT_MAX_KEYS);
  });

  test('a key never holds more timestamps than the largest allowance', () => {
    const c = clock();
    const limiter = createAttemptLimiter({ now: c.now, allowances: [{ max: 5, windowMs: MINUTE }] });
    for (let i = 0; i < 1000; i++) { limiter.attempt('a'); c.advance(SECOND); }
    // 1000 s of one a second: the minute always holds 60, so 5 pass, then the
    // window slides one at a time — never more than 5 in it.
    let admitted = 0;
    for (let i = 0; i < 120; i++) { if (limiter.attempt('a').ok) admitted++; c.advance(SECOND); }
    expect(admitted).toBe(10); // 5 per minute, over two minutes
  });

  test('a bad configuration is refused, not silently unlimited', () => {
    expect(() => createAttemptLimiter({ allowances: [] })).toThrow();
    expect(() => createAttemptLimiter({ allowances: [{ max: 0, windowMs: MINUTE }] })).toThrow();
    expect(() => createAttemptLimiter({ maxKeys: 0 })).toThrow();
  });

  test('the refusal says what happened and when to try again', () => {
    expect(attemptLimitMessage(42)).toBe(
      'Too many requests from this account (attempt-limit). Nothing was sent to the model. Please try again in 42 seconds.',
    );
    expect(typeof geminiAttemptLimiter.attempt).toBe('function');
  });
});

/**
 * §4 item 5 — a legitimate heavy session is never refused. The ceiling of what
 * the existing limits let succeed in an hour: 20 hourly-counted calls and three
 * generation leases of 48 calls each, 4 in flight. A fill call takes 10–15 s
 * with the product model (docs/design/engine-led-transformation.md, measured);
 * the simulation takes the fast end, runs the three generations back to back
 * and puts all 20 hourly calls in a burst of one a second at the start, inside
 * the first generation's minute.
 */
test('a heavy session — 20 hourly calls and 3 × 48 leased calls, 4 in flight — is never refused', () => {
  const FILL_CALL_MS = 10 * SECOND;
  const start = 5_000_000;
  const at: number[] = [];
  for (let i = 0; i < 20; i++) at.push(start + i * SECOND);
  let t = start + 5 * SECOND; // the first generation starts while the hourly burst runs
  for (let g = 0; g < 3; g++) {
    for (let batch = 0; batch < 48 / 4; batch++) {
      for (let k = 0; k < 4; k++) at.push(t);
      t += FILL_CALL_MS;
    }
  }
  at.sort((a, b) => a - b);
  expect(at).toHaveLength(164);

  const c = clock(start);
  const limiter = createAttemptLimiter({ now: c.now });
  const refused: number[] = [];
  for (const when of at) {
    c.set(when);
    if (!limiter.attempt('heavy-user').ok) refused.push(when - start);
  }
  expect(refused, 'the attempt limiter refused a session the product makes').toEqual([]);

  // And the busiest minute of it, for the record: far below 60.
  let busiest = 0;
  for (const s of at) busiest = Math.max(busiest, at.filter((x) => x >= s && x < s + MINUTE).length);
  expect(busiest).toBeLessThan(60);
});

/* ------------------------------------------------------- the route's wiring */

test.describe('the route', () => {
  const src = read('app/api/gemini/route.ts');
  const post = src.slice(src.indexOf('export async function POST'));
  const at = (s: string, from = post) => {
    const i = from.indexOf(s);
    expect(i, `${s} is missing from the route`).toBeGreaterThan(-1);
    return i;
  };

  test('counts the attempt after authentication and before the body, the lease or any Firestore access (§4 item 4)', () => {
    const auth = at('verifyRequestAuth(request)');
    const unauthenticated = at("{ status: 401 }");
    const counted = at('geminiAttemptLimiter.attempt(decodedToken.uid)');
    expect(post.match(/geminiAttemptLimiter\.attempt\(/g), 'the attempt is counted in one place').toHaveLength(1);
    expect(counted).toBeGreaterThan(auth);
    expect(counted).toBeGreaterThan(unauthenticated);
    for (const later of [
      'readBoundedJson(new Response(request.body',
      'leaseReferenceOf(body, isFirestoreId)',
      'getAdminDb()',
      'peekLease(',
      'assertRateLimit(',
      'assertMfaSatisfied(',
      'assertAccountActive(',
      'loadGeminiApiKey(',
    ]) {
      expect(counted, `${later} runs before the attempt is counted`).toBeLessThan(at(later));
    }
    // Before the first Firestore access anywhere in the handler, not only the first named one.
    expect(counted).toBeLessThan(post.search(/\bdb\b\s*[.=]|\.collection\(/));
  });

  test('refuses past the allowance with a 429 of its own code and a Retry-After, and is never skipped', () => {
    const counted = at('geminiAttemptLimiter.attempt(decodedToken.uid)');
    const block = post.slice(counted, post.indexOf('\n    }\n', counted) + 6);
    expect(block).toMatch(/if \(!attempt\.ok\) \{\s*return NextResponse\.json\(/);
    expect(block).toContain('code: ATTEMPT_LIMIT_CODE');
    expect(block).toContain('status: 429');
    expect(block).toContain("'Retry-After': String(attempt.retryAfterSeconds)");
    // No exemption: not for the emulator, not for admins, not for a lease.
    expect(block).not.toMatch(/NEXT_PUBLIC_USE_FIREBASE_EMULATOR|decodedToken\.admin|\blease\b(?!d)/);
    const limiter = read('lib/attempt-limit.ts');
    expect(limiter, 'the limiter reads the environment').not.toMatch(/process\.env/);
    expect(limiter, 'the limiter imports something').not.toMatch(/^import /m);
  });

  test('the hourly limit, the byte bound and the early lease refusal are still there', () => {
    expect(src.match(/assertRateLimit\(/g)).toHaveLength(1);
    expect(src).toContain('maxBytes: MAX_PROMPT_LENGTH * 6 + 64 * 1024');
    expect(src).toMatch(/if \(leased\.stage !== 'transformation'\) \{\s*return NextResponse\.json\(/);
  });

  test('reads users/{uid} once and hands it to the MFA gate, the account gate and the stage switch', () => {
    expect(post.match(/collection\('users'\)/g), 'the profile is read more than once').toHaveLength(1);
    const readAt = at("collection('users').doc(decodedToken.uid).get()");
    const mfa = at('assertMfaSatisfied(request, decodedToken, { profile })');
    expect(readAt).toBeLessThan(mfa);
    // Read inside the MFA gate's try, so a failed read is answered as before.
    const mfaTry = post.slice(post.lastIndexOf('try {', readAt), mfa);
    expect(mfaTry).not.toContain('} catch');
    const account = post.slice(at('assertAccountActive('), at('const {', post.slice(at('assertAccountActive('))) + at('assertAccountActive('));
    expect(account).toMatch(/\n\s*profile,\n/);
    expect(post).toContain('modelStageEnabled(profile.exists');
    // Both gates take the snapshot and read only when none is given.
    const admin = read('lib/firebase-admin.ts');
    for (const fn of ['export async function assertMfaSatisfied', 'export async function assertAccountActive']) {
      const body = admin.slice(admin.indexOf(fn), admin.indexOf('\n}\n', admin.indexOf(fn)));
      expect(body, fn).toMatch(/profile\?: DocumentSnapshot;/);
      expect(body, fn).toMatch(/= opts\??\.profile \?\? await \(await getAdminDb\(\)\)\.db\.collection\('users'\)\.doc\(uid\)\.get\(\);/);
    }
  });
});

/* ------------------------------------------------------------- log noise */

test('a rejected token is summarised in the log, not written one line each; anything else still is', () => {
  const admin = read('lib/firebase-admin.ts');
  const verify = admin.slice(admin.indexOf('export async function verifyRequestAuth'), admin.indexOf('\n}\n', admin.indexOf('export async function verifyRequestAuth')));
  expect(verify).not.toContain('console.error');
  expect(verify).toContain('logRejectedToken(err)');
  const helper = admin.slice(admin.indexOf('function logRejectedToken'), admin.indexOf('\n}\n', admin.indexOf('function logRejectedToken')));
  // An error that is not a token the caller sent goes to the log in full.
  expect(helper).toMatch(/if \(typeof code !== 'string' \|\| !REJECTED_TOKEN_CODES\.has\(code\)\) \{\s*console\.error\('verifyRequestAuth error:', err\);\s*return;/);
  // At most one summary a minute.
  expect(admin).toContain('const REJECTED_TOKEN_LOG_INTERVAL_MS = 60_000;');
  expect(helper).toMatch(/if \(now - rejectedTokens\.lastLoggedAt < REJECTED_TOKEN_LOG_INTERVAL_MS\) return;/);
  // Only the caller's refusals are summarised: our own failures are not on the list.
  const codes = admin.slice(admin.indexOf('const REJECTED_TOKEN_CODES'), admin.indexOf(']);', admin.indexOf('const REJECTED_TOKEN_CODES')));
  for (const ours of ['internal-error', 'invalid-credential', 'project-not-found']) expect(codes).not.toContain(ours);
  for (const theirs of ['auth/argument-error', 'auth/id-token-expired', 'auth/id-token-revoked']) expect(codes).toContain(theirs);
});
