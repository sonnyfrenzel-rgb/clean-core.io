import { test, expect } from '@playwright/test';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { isFirestoreId } from '../lib/firestore-id';
import {
  LEASE_CODES,
  LEASE_COLLECTION,
  LEASE_MAX_CALLS,
  LEASE_MAX_IN_FLIGHT,
  LEASE_MAX_TTL_MS,
  LEASE_TTL_MS,
  LEASE_WINDOW_COLLECTION,
  LEASE_WINDOW_MS,
  LEASES_PER_WINDOW,
  LEASE_SLOT_STALE_MS,
  decideLeaseCall,
  decideLeaseClose,
  decideLeaseIssue,
  inFlightAt,
  isRunId,
  leaseWindowStatus,
  leaseBudget,
  leaseTtlMs,
  leaseReferenceOf,
  leaseView,
  newLeaseRecord,
  type LeaseRecord,
} from '../lib/transformation/lease';
import { acquireLeaseCall, closeLease, issueLease, peekLease, readLease, readLeaseWindow, releaseLeaseCall } from '../lib/transformation/lease-store';
import { MODEL_CALL_DEADLINE_MS } from '../lib/model-deadline';
import { FILL_PROMPT_MAX_CHARS, LEASED_PROMPT_MAX_CHARS } from '../lib/transformation/fill-prompt';

/**
 * The generation lease (design §11; owner decision 12.10.2026: one generation
 * = one unit of the hourly model limit, ≤ 48 calls, ≤ 3 generations an hour).
 *
 * Three halves: the decisions (pure), the two routes in their source (the
 * lease branch of /api/gemini and the lease route), and the transactions
 * against the Firestore emulator — no server. The emulator half skips itself
 * when nothing answers on 127.0.0.1:8080.
 */

const ROOT = path.resolve(__dirname, '..');
function code(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const T0 = 1_760_000_000_000;
const lease = (over: Partial<LeaseRecord> = {}): LeaseRecord => ({
  ...newLeaseRecord({ leaseId: 'L1', projectId: 'P1', uid: 'owner', generationToken: 'tok-1', plannedCalls: 9, budget: leaseBudget(9), now: T0 }),
  ...over,
});
const ctx = (over: Partial<{ uid: string; projectId: string; now: number }> = {}) => ({ uid: 'owner', projectId: 'P1', now: T0 + 1000, ...over });

/* ------------------------------------------------------------ decisions */

test.describe('the decisions', () => {
  test('a lease buys room for retries and two repair rounds, never more than 48 calls', () => {
    expect(leaseBudget(1)).toBe(10);
    expect(leaseBudget(9)).toBe(26);
    expect(leaseBudget(20)).toBe(LEASE_MAX_CALLS);
    expect(leaseBudget(10_000)).toBe(LEASE_MAX_CALLS);
    expect(leaseBudget(0)).toBe(10);
    expect(lease().expiresAt - lease().createdAt).toBe(leaseTtlMs(leaseBudget(9)));
  });

  test('a lease lasts long enough for its budget: every call, four at a time, each the route\'s full deadline', () => {
    // 13.10.2026, production: a 1,848-line program planned 29 fill calls (budget
    // 48); its calls took 9–292 s, the flat 15-minute lease expired after 25 of
    // them and the next call was refused 403 lease-expired.
    // 13.10.2026: the deadline is 870 s (900 s request limit), so one wave
    // already nearly fills the 15-minute floor; the cap is 180 minutes.
    expect(leaseTtlMs(4)).toBe(Math.max(LEASE_TTL_MS, MODEL_CALL_DEADLINE_MS));
    expect(leaseTtlMs(10)).toBe(Math.max(LEASE_TTL_MS, 3 * MODEL_CALL_DEADLINE_MS));
    expect(leaseTtlMs(26)).toBe(7 * MODEL_CALL_DEADLINE_MS);
    expect(LEASE_MAX_TTL_MS).toBe(180 * 60 * 1000);
    expect(leaseTtlMs(LEASE_MAX_CALLS)).toBe(12 * MODEL_CALL_DEADLINE_MS);
    for (let budget = 1; budget <= LEASE_MAX_CALLS; budget++) {
      const ttl = leaseTtlMs(budget);
      expect(ttl, `budget ${budget}`).toBeGreaterThanOrEqual(Math.ceil(budget / LEASE_MAX_IN_FLIGHT) * MODEL_CALL_DEADLINE_MS);
      expect(ttl).toBeGreaterThanOrEqual(LEASE_TTL_MS);
      expect(ttl).toBeLessThanOrEqual(LEASE_MAX_TTL_MS);
    }
    for (const odd of [0, -1, 1.5, Number.NaN, 10_000]) expect(leaseTtlMs(odd)).toBeLessThanOrEqual(LEASE_MAX_TTL_MS);
    const big = newLeaseRecord({ leaseId: 'L9', projectId: 'P1', uid: 'owner', generationToken: 'tok-9', plannedCalls: 29, budget: leaseBudget(29), now: T0 });
    // The production run's last call was refused 15 min 46 s after the lease.
    expect(decideLeaseCall(big, ctx({ now: T0 + (15 * 60 + 46) * 1000 })).ok).toBe(true);
  });

  test('another account\'s lease, a lease of another project and no lease get the same answer', () => {
    const answers = [
      decideLeaseCall(lease(), ctx({ uid: 'stranger' })),
      decideLeaseCall(lease(), ctx({ projectId: 'P2' })),
      decideLeaseCall(null, ctx()),
      decideLeaseCall({ ...lease(), budget: 'lots' }, ctx()),
    ];
    for (const a of answers) expect(a).toMatchObject({ ok: false, status: 403, code: 'lease-invalid' });
    expect(new Set(answers.map((a) => (a.ok ? '' : a.error))).size).toBe(1);
  });

  test('reuse after expiry is refused; a superseded lease is closed', () => {
    expect(decideLeaseCall(lease(), ctx({ now: lease().expiresAt }))).toMatchObject({ ok: false, status: 403, code: 'lease-expired' });
    expect(decideLeaseCall(lease({ status: 'superseded' }), ctx())).toMatchObject({ ok: false, status: 403, code: 'lease-closed' });
  });

  test('the 49th call is refused, and the 5th in flight waits', () => {
    let l = lease({ budget: LEASE_MAX_CALLS });
    for (let i = 0; i < LEASE_MAX_CALLS; i++) {
      const d = decideLeaseCall(l, ctx());
      expect(d.ok, `call ${i + 1}`).toBe(true);
      l = { ...l, used: l.used + 1 };
    }
    expect(decideLeaseCall(l, ctx())).toMatchObject({ ok: false, status: 429, code: 'lease-exhausted' });
    // The slots carry their times (13.10.2026); four live slots are a full lease.
    const held = (k: number) => Array.from({ length: k }, () => T0 + 500);
    expect(decideLeaseCall(lease({ inFlight: LEASE_MAX_IN_FLIGHT, slots: held(LEASE_MAX_IN_FLIGHT) }), ctx())).toMatchObject({ ok: false, status: 429, code: 'lease-busy' });
    expect(decideLeaseCall(lease({ inFlight: LEASE_MAX_IN_FLIGHT - 1, slots: held(LEASE_MAX_IN_FLIGHT - 1) }), ctx()).ok).toBe(true);
    // A lease stored before the slot times is judged by its count, as before.
    const legacy = { ...lease({ inFlight: LEASE_MAX_IN_FLIGHT }) } as LeaseRecord;
    delete legacy.slots;
    expect(decideLeaseCall(legacy, ctx())).toMatchObject({ ok: false, status: 429, code: 'lease-busy' });
  });

  test('the same generation gets its open lease back for nothing; a 4th new lease in an hour is refused', () => {
    const open = [lease()];
    expect(decideLeaseIssue({ uid: 'owner', generationToken: 'tok-1', plannedCalls: 9, now: T0 + 5, open, windowIssued: [T0] })).toEqual({ kind: 'reuse', lease: open[0] });

    const fresh = decideLeaseIssue({ uid: 'owner', generationToken: 'tok-2', plannedCalls: 9, now: T0 + 5, open, windowIssued: [T0] });
    expect(fresh).toMatchObject({ kind: 'issue', budget: 26, supersede: ['L1'], window: [T0, T0 + 5] });

    const window = [T0, T0 + 10, T0 + 20];
    const fourth = decideLeaseIssue({ uid: 'owner', generationToken: 'tok-3', plannedCalls: 9, now: T0 + 30, open: [], windowIssued: window });
    expect(fourth).toMatchObject({ kind: 'refuse', status: 429, code: 'lease-hourly-limit' });
    expect(fourth.kind === 'refuse' && fourth.retryAfterSeconds).toBe(Math.ceil((LEASE_WINDOW_MS - 30) / 1000));
    expect(LEASES_PER_WINDOW).toBe(3);

    // An hour later the first leaves the window.
    const later = decideLeaseIssue({ uid: 'owner', generationToken: 'tok-3', plannedCalls: 9, now: T0 + LEASE_WINDOW_MS + 1, open: [], windowIssued: window });
    expect(later).toMatchObject({ kind: 'issue', window: [T0 + 10, T0 + 20, T0 + LEASE_WINDOW_MS + 1] });

    // An expired or used-up lease of the same token is not handed back.
    expect(decideLeaseIssue({ uid: 'owner', generationToken: 'tok-1', plannedCalls: 9, now: lease().expiresAt, open, windowIssued: [] }).kind).toBe('issue');
    expect(decideLeaseIssue({ uid: 'owner', generationToken: 'tok-1', plannedCalls: 9, now: T0 + 5, open: [lease({ used: 26 })], windowIssued: [] }).kind).toBe('issue');
  });

  test('every click is its own run: a restart never reuses the cancelled run\'s lease or its slots (13.10.2026)', () => {
    // Production, project 7LqEjpKuPDSnA2HeSkQ4: the restart asked at the same
    // generation token, got the cancelled run's open lease back with four slots
    // still held by that run's server-side calls, and every call was lease-busy.
    const cancelled = lease({ runId: 'run-aaaaaaaa', inFlight: LEASE_MAX_IN_FLIGHT, slots: [T0, T0, T0, T0], used: 4 });
    const restart = decideLeaseIssue({ uid: 'owner', generationToken: 'tok-1', runId: 'run-bbbbbbbb', plannedCalls: 9, now: T0 + 5, open: [cancelled], windowIssued: [T0] });
    expect(restart).toMatchObject({ kind: 'issue', budget: 26, supersede: ['L1'] });
    // The run's own retry of the lease request is still idempotent, for nothing.
    expect(decideLeaseIssue({ uid: 'owner', generationToken: 'tok-1', runId: 'run-aaaaaaaa', plannedCalls: 9, now: T0 + 5, open: [cancelled], windowIssued: [T0] })).toEqual({
      kind: 'reuse',
      lease: cancelled,
    });
    // A request that names a run never takes over a lease of none, and the other way round.
    expect(decideLeaseIssue({ uid: 'owner', generationToken: 'tok-1', runId: 'run-bbbbbbbb', plannedCalls: 9, now: T0 + 5, open: [lease()], windowIssued: [] }).kind).toBe('issue');
    expect(decideLeaseIssue({ uid: 'owner', generationToken: 'tok-1', plannedCalls: 9, now: T0 + 5, open: [cancelled], windowIssued: [] }).kind).toBe('issue');
    // The new lease starts with nothing in flight.
    const fresh = newLeaseRecord({ leaseId: 'L2', projectId: 'P1', uid: 'owner', generationToken: 'tok-1', runId: 'run-bbbbbbbb', plannedCalls: 9, budget: 26, now: T0 + 5 });
    expect(fresh).toMatchObject({ runId: 'run-bbbbbbbb', inFlight: 0, slots: [], used: 0 });
    expect(decideLeaseCall(fresh, ctx({ now: T0 + 6 })).ok).toBe(true);
    // The superseded lease's late calls are refused.
    expect(decideLeaseCall({ ...cancelled, status: 'superseded' }, ctx())).toMatchObject({ ok: false, code: 'lease-closed' });
    expect(isRunId('run-bbbbbbbb')).toBe(true);
    for (const bad of ['short', 'has space here', 'x'.repeat(65), 42, null]) expect(isRunId(bad)).toBe(false);
  });

  test('Cancel closes only the owner\'s own open lease', () => {
    expect(decideLeaseClose(lease(), { uid: 'owner', projectId: 'P1' })).toBe('close');
    expect(decideLeaseClose(lease(), { uid: 'stranger', projectId: 'P1' })).toBe('nothing');
    expect(decideLeaseClose(lease(), { uid: 'owner', projectId: 'P2' })).toBe('nothing');
    expect(decideLeaseClose(lease({ status: 'superseded' }), { uid: 'owner', projectId: 'P1' })).toBe('nothing');
    expect(decideLeaseClose(null, { uid: 'owner', projectId: 'P1' })).toBe('nothing');
  });

  test('a slot older than the deadline + 30 s is free again: a dead instance does not block a run', () => {
    expect(LEASE_SLOT_STALE_MS).toBe(MODEL_CALL_DEADLINE_MS + 30_000);
    const stuck = lease({ inFlight: LEASE_MAX_IN_FLIGHT, slots: [T0, T0, T0, T0 + 1000] });
    expect(decideLeaseCall(stuck, ctx({ now: T0 + LEASE_SLOT_STALE_MS - 1 }))).toMatchObject({ ok: false, code: 'lease-busy' });
    expect(inFlightAt(stuck, T0 + LEASE_SLOT_STALE_MS)).toBe(1);
    expect(decideLeaseCall(stuck, ctx({ now: T0 + LEASE_SLOT_STALE_MS })).ok).toBe(true);
  });

  test('the hour\'s generations as the start screen reads them', () => {
    expect(leaseWindowStatus([], T0)).toEqual({ used: 0, limit: LEASES_PER_WINDOW, nextFreeInSeconds: null });
    expect(leaseWindowStatus([T0 - LEASE_WINDOW_MS - 1, T0 - 10], T0)).toEqual({ used: 1, limit: 3, nextFreeInSeconds: null });
    expect(leaseWindowStatus([T0 - 600_000, T0 - 10, T0 - 5, 'x'], T0)).toEqual({ used: 3, limit: 3, nextFreeInSeconds: Math.ceil((LEASE_WINDOW_MS - 600_000) / 1000) });
  });

  test('a lease is named as { projectId, leaseId } and nothing else; the client sees no token and no account', () => {
    expect(leaseReferenceOf({ prompt: 'x' }, isFirestoreId)).toBeNull();
    expect(leaseReferenceOf({ lease: { projectId: 'P1', leaseId: 'L1' } }, isFirestoreId)).toEqual({ projectId: 'P1', leaseId: 'L1' });
    for (const bad of [{ lease: 'L1' }, { lease: { projectId: 'a/b', leaseId: 'L1' } }, { lease: { projectId: 'P1' } }, { lease: { projectId: 'P1', leaseId: '..' } }]) {
      expect(leaseReferenceOf(bad, isFirestoreId)).toMatchObject({ ok: false, status: 400, code: 'lease-invalid' });
    }
    const view = leaseView(lease());
    expect(Object.keys(view).sort()).toEqual(['budget', 'expiresAt', 'leaseId', 'maxInFlight', 'projectId', 'used']);
  });
});

/* ------------------------------------------------------------ the routes */

test.describe('the lease branch of /api/gemini', () => {
  const src = code('app/api/gemini/route.ts');
  const at = (s: string) => {
    const i = src.indexOf(s);
    expect(i, `${s} is missing from the route`).toBeGreaterThan(-1);
    return i;
  };

  test('without a lease the call is limited exactly as before; with one, the hourly counter is not touched', () => {
    expect(src).toContain('assertRateLimit(`gemini:${decodedToken.uid}`, 20, 60 * 60 * 1000)');
    // The limiter sits in the branch without a lease.
    const branch = src.slice(at('if (lease) {'), at('assertRateLimit(`gemini:${decodedToken.uid}`'));
    expect(branch).toContain('peekLease(');
    expect(branch).toContain('} else if (!decodedToken.admin) {');
    expect(src.match(/assertRateLimit\(/g)).toHaveLength(1);
  });

  test('a leased call passes every gate an unleased one does, and is counted right before the provider call', () => {
    const counted = at('acquireLeaseCall(');
    for (const gate of [
      'verifyRequestAuth(request)',
      'assertMfaSatisfied(',
      'assertAccountActive(',
      'modelStageEnabled(',
      "if (lease && stage !== 'transformation')",
      'ALLOWED_MODELS.has(model)',
      'prompt.length > MAX_PROMPT_LENGTH',
      'loadGeminiApiKey(decodedToken.uid)',
    ]) {
      expect(at(gate), `${gate} runs after the lease is counted`).toBeLessThan(counted);
    }
    expect(counted).toBeLessThan(at('const answer: ModelAnswer = stubbed'));
    // The lease is read before anything else is done for the call.
    expect(at('leaseReferenceOf(body, isFirestoreId)')).toBeLessThan(at('assertMfaSatisfied('));
    // The slot is given back whatever happens.
    const fin = src.slice(src.lastIndexOf('} finally {'));
    expect(fin).toContain('releaseLeaseCall(db, heldLease)');
    // A leased call ends with its request: aborted, never retried after.
    expect(src).toContain('const abortSignal = lease ? request.signal : undefined;');
    expect(src).toMatch(/if \(signal\?\.aborted\) throw error;\s*const message[^\n]*\n\s*if \(retries > 0 && isTransientModelError\(message\)\)/);
  });

  test('the body is read under a byte bound, before any limiter or lease read (QA review of 03501b79, 7dd12d385189)', () => {
    expect(src).not.toContain('request.json()');
    const read = at('readBoundedJson(new Response(request.body');
    expect(read).toBeLessThan(at('leaseReferenceOf(body, isFirestoreId)'));
    expect(read).toBeLessThan(at('assertRateLimit(`gemini:${decodedToken.uid}`'));
    expect(src).toMatch(/bodyErr instanceof ResponseLimitError\) \{\s*return NextResponse\.json\([^\n]*\{ status: 413 \}\)/);
    // The bound never refuses a prompt the length check admits.
    expect(src).toContain('maxBytes: MAX_PROMPT_LENGTH * 6 + 64 * 1024');
  });

  test('a leased call the body alone refuses never reads the lease (QA review of 03501b79, 456824b829b3)', () => {
    const before = src.slice(at('if (lease) {'), at('peekLease('));
    expect(before).toMatch(/if \(leased\.stage !== 'transformation'\) \{\s*return NextResponse\.json\(/);
    expect(before).toMatch(/if \(typeof leased\.prompt !== 'string' \|\| !leased\.prompt \|\| leased\.prompt\.length > MAX_PROMPT_LENGTH\) \{\s*return NextResponse\.json\(/);
  });

  test('a leased prompt is a fill prompt: above twice the fill budget it is refused 413 before the lease is read (QA finding 804d0920fff4)', () => {
    expect(LEASED_PROMPT_MAX_CHARS).toBe(FILL_PROMPT_MAX_CHARS * 2);
    expect(LEASED_PROMPT_MAX_CHARS).toBeLessThan(250_000);
    expect(LEASE_CODES.promptTooLarge).toBe('lease-prompt-too-large');
    const before = src.slice(at('if (lease) {'), at('peekLease('));
    expect(before).toMatch(
      /if \(leased\.prompt\.length > LEASED_PROMPT_MAX_CHARS\) \{\s*return NextResponse\.json\(\s*\{[\s\S]*?code: LEASE_CODES\.promptTooLarge,\s*\},\s*\{ status: 413 \},\s*\);/,
    );
    // After the shape check, which makes `leased.prompt` a string.
    expect(at('leased.prompt.length > LEASED_PROMPT_MAX_CHARS')).toBeGreaterThan(at('leased.prompt.length > MAX_PROMPT_LENGTH'));
    expect(src.match(/assertRateLimit\(/g)).toHaveLength(1);
  });

  test('a caller gone during the backoff gets no retry (QA review of 03501b79, 08b88f95cff6)', () => {
    const retry = src.slice(at('async function callWithRetry'), at('export async function POST'));
    const waited = retry.indexOf('setTimeout(');
    const recursed = retry.indexOf('return callWithRetry(');
    // The wait ends on abort, and the signal is read again between the wait and the retry.
    expect(retry).toMatch(/signal\?\.addEventListener\('abort'/);
    expect(retry.slice(waited, recursed)).toMatch(/\}\);\s*if \(signal\?\.aborted\) throw error;\s*$/);
  });

  test('a refusal carries the lease\'s code and status', () => {
    expect(src).toMatch(/if \(!peek\.ok\) \{\s*return NextResponse\.json\(\{ error: peek\.error, code: peek\.code \}, \{ status: peek\.status \}\);/);
    expect(src).toMatch(/if \(!counted\.ok\) \{\s*return NextResponse\.json\(\{ error: counted\.error, code: counted\.code \}, \{ status: counted\.status \}\);/);
  });
});

test.describe('the lease route', () => {
  const src = code('app/api/transformation/lease/route.ts');
  const at = (s: string) => {
    const i = src.indexOf(s);
    expect(i, `${s} is missing from the route`).toBeGreaterThan(-1);
    return i;
  };

  test('owner, second factor, active account, stage switched on, current generation token — before a lease is issued', () => {
    const issued = at('issueLease(db,');
    for (const gate of [
      'verifyRequestAuth(req)',
      'assertMfaSatisfied(req, decodedToken)',
      'assertAccountActive(decodedToken.uid',
      "modelStageEnabled(profile.exists",
      'data.userId !== decodedToken.uid',
      'generationRevision(generationStateOf(data, run, platform.stamp), built.contract.fingerprint) !== generationToken',
    ]) {
      expect(at(gate), `${gate} runs after the lease is issued`).toBeLessThan(issued);
    }
    expect(at('readBoundedJson(new Response(req.body')).toBeLessThan(issued);
  });

  test('a new lease costs one unit of the same hourly model limit, and a refused charge undoes the lease', () => {
    const charge = at('assertRateLimit(`gemini:${decodedToken.uid}`, 20, 60 * 60 * 1000)');
    expect(charge).toBeGreaterThan(at("if (outcome.kind === 'reused')"));
    expect(src.slice(charge, charge + 600)).toContain('voidLease(db,');
  });

  test('the route is behind the second factor in the gated-route list', () => {
    expect(fs.readFileSync(path.join(ROOT, 'tests/helpers/gated-routes.ts'), 'utf8')).toContain("file: 'app/api/transformation/lease/route.ts'");
  });

  test('a lease is issued to the run the request names; Cancel closes it behind auth and the second factor (13.10.2026)', () => {
    expect(src).toMatch(/issueLease\(db, \{ projectId, uid: decodedToken\.uid, generationToken, runId: isRunId\(runId\) \? runId : null, plannedCalls, now \}\)/);
    expect(src).toMatch(/if \(runId !== undefined && !\(isRunId\(runId\) && isFirestoreId\(runId\)\)\) \{\s*return NextResponse\.json\(/);
    const del = src.slice(src.indexOf('export async function DELETE'));
    expect(del).toContain('signedInOwner(req)');
    expect(del).toContain('closeLease(db, { projectId, leaseId }, { uid: who.uid })');
    const gate = src.slice(src.indexOf('async function signedInOwner'), src.indexOf('export async function DELETE'));
    expect(gate).toContain('verifyRequestAuth(req)');
    expect(gate).toContain('assertMfaSatisfied(req, decodedToken)');
    const get = src.slice(src.indexOf('export async function GET'));
    expect(get).toContain('signedInOwner(req)');
    expect(get).toContain('readLeaseWindow(db, who.uid');
  });

  test('Cancel before the lease request buys no lease, and the error strip retries through the start gate (QA review of 4459238f2ef0)', () => {
    const page = fs.readFileSync(path.join(ROOT, 'app/(app)/project/[projectId]/transformation/page.tsx'), 'utf8');
    expect(page).toMatch(/if \(controller\.signal\.aborted\) throw Object\.assign\(new Error\('cancelled'\), \{ name: 'AbortError' \}\);\s*try \{\s*lease = await requestGenerationLease\(/);
    const strip = page.slice(page.indexOf('data-transformation-error=""'));
    expect(strip.slice(0, 600)).toContain('actions={canStart ? (');
    expect(strip.slice(0, 600)).toContain('onClick={startGeneration}');
  });

  test('a lease bought after Cancel, or before a failure, is closed when the generation ends (QA review of 6500c65c81c7)', () => {
    const page = fs.readFileSync(path.join(ROOT, 'app/(app)/project/[projectId]/transformation/page.tsx'), 'utf8');
    const fin = page.slice(page.indexOf('generationInFlight.current = false;'));
    const close = fin.indexOf('if (failed) closeLeaseRef.current?.();');
    expect(close).toBeGreaterThan(-1);
    expect(close).toBeLessThan(fin.indexOf('closeLeaseRef.current = null;'));
  });

  test('the page sends a fresh run id per click and closes the lease on Cancel', () => {
    const page = code('app/(app)/project/[projectId]/transformation/page.tsx');
    expect(page).toMatch(/requestGenerationLease\(projectId as string, generationToken, [^\n]*, newGenerationRunId\(\)\)/);
    expect(page).toContain('closeLeaseRef.current = () => closeGenerationLease(bought);');
    const cancel = page.slice(page.indexOf('const cancelGeneration = useCallback'), page.indexOf('const cancelGeneration = useCallback') + 400);
    expect(cancel).toMatch(/abortRef\.current\.abort\(\);\s*closeLeaseRef\.current\?\.\(\);/);
    const client = code('lib/transformation/lease-client.ts');
    expect(client).toContain("method: 'DELETE'");
    expect(client).toContain('keepalive: true');
    expect(client).toContain('JSON.stringify({ projectId, generationToken, plannedCalls, runId })');
  });
});

/* ------------------------------------------------- the store, on the emulator */

async function emulatorUp(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port: 8080 });
    s.setTimeout(1000);
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
    s.once('timeout', () => (s.destroy(), resolve(false)));
  });
}

const db = (): Firestore => {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
};
const id = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe('the store, against the Firestore emulator', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => {
    const up = await emulatorUp();
    // CI starts the emulators before every E2E shard (deploy.yml): there a silent
    // skip would pass the suite without one transaction run, so it fails instead.
    // Only a local run without emulators may skip.
    if (!up && process.env.CI) throw new Error('The Firestore emulator does not answer on 127.0.0.1:8080, and CI must run these tests.');
    test.skip(!up, 'The Firestore emulator does not answer on 127.0.0.1:8080.');
  });

  test('issue, reuse for nothing, supersede, and the 4th lease in an hour refused', async () => {
    const uid = id('lease-owner');
    const projectId = id('lease-project');
    const now = Date.now();
    const a = await issueLease(db(), { projectId, uid, generationToken: 'tok-a', plannedCalls: 9, now });
    expect(a.kind).toBe('issued');
    if (a.kind !== 'issued') return;
    expect(a.lease).toMatchObject({ budget: 26, used: 0, inFlight: 0, status: 'open' });

    const again = await issueLease(db(), { projectId, uid, generationToken: 'tok-a', plannedCalls: 9, now: now + 1 });
    expect(again).toMatchObject({ kind: 'reused', lease: { leaseId: a.lease.leaseId } });

    const b = await issueLease(db(), { projectId, uid, generationToken: 'tok-b', plannedCalls: 9, now: now + 2 });
    expect(b).toMatchObject({ kind: 'issued', superseded: [a.lease.leaseId] });
    expect((await readLease(db(), { projectId, leaseId: a.lease.leaseId }))?.status).toBe('superseded');
    expect(await peekLease(db(), { projectId, leaseId: a.lease.leaseId }, { uid, now: now + 3 })).toMatchObject({ ok: false, code: 'lease-closed' });

    const c = await issueLease(db(), { projectId: id('lease-project'), uid, generationToken: 'tok-c', plannedCalls: 9, now: now + 3 });
    expect(c.kind).toBe('issued');
    const d = await issueLease(db(), { projectId: id('lease-project'), uid, generationToken: 'tok-d', plannedCalls: 9, now: now + 4 });
    expect(d).toMatchObject({ kind: 'refused', status: 429, code: 'lease-hourly-limit' });
  });

  test('48 calls and not one more; another account and an expired lease get nothing', async () => {
    const uid = id('lease-owner');
    const projectId = id('lease-project');
    const now = Date.now();
    const issued = await issueLease(db(), { projectId, uid, generationToken: 'tok', plannedCalls: 40, now });
    if (issued.kind !== 'issued') throw new Error('not issued');
    const ref = { projectId, leaseId: issued.lease.leaseId };
    expect(issued.lease.budget).toBe(LEASE_MAX_CALLS);

    expect(await acquireLeaseCall(db(), ref, { uid: id('stranger'), now })).toMatchObject({ ok: false, status: 403, code: 'lease-invalid' });
    expect(await acquireLeaseCall(db(), ref, { uid, now: issued.lease.expiresAt + 1 })).toMatchObject({ ok: false, status: 403, code: 'lease-expired' });

    for (let i = 0; i < LEASE_MAX_CALLS; i++) {
      const got = await acquireLeaseCall(db(), ref, { uid, now: now + 10 });
      expect(got.ok, `call ${i + 1}`).toBe(true);
      await releaseLeaseCall(db(), ref);
    }
    expect(await acquireLeaseCall(db(), ref, { uid, now: now + 20 })).toMatchObject({ ok: false, status: 429, code: 'lease-exhausted' });
    const stored = await readLease(db(), ref);
    expect(stored).toMatchObject({ used: LEASE_MAX_CALLS, inFlight: 0 });
  });

  test('of six calls racing for a slot, four get one; a released slot is free again', async () => {
    const uid = id('lease-owner');
    const projectId = id('lease-project');
    const now = Date.now();
    const issued = await issueLease(db(), { projectId, uid, generationToken: 'tok', plannedCalls: 9, now });
    if (issued.kind !== 'issued') throw new Error('not issued');
    const ref = { projectId, leaseId: issued.lease.leaseId };
    const raced = await Promise.all(Array.from({ length: 6 }, () => acquireLeaseCall(db(), ref, { uid, now: now + 1 })));
    expect(raced.filter((r) => r.ok)).toHaveLength(LEASE_MAX_IN_FLIGHT);
    for (const r of raced.filter((x) => !x.ok)) expect(r).toMatchObject({ status: 429, code: 'lease-busy' });
    await releaseLeaseCall(db(), ref);
    expect((await acquireLeaseCall(db(), ref, { uid, now: now + 2 })).ok).toBe(true);
    // Never below zero, however often a slot is given back.
    for (let i = 0; i < 8; i++) await releaseLeaseCall(db(), ref);
    expect((await readLease(db(), ref))?.inFlight).toBe(0);
  });

  test('a new run at the same token gets a fresh lease; Cancel closes it; the stale slot frees itself (13.10.2026)', async () => {
    const uid = id('lease-owner');
    const projectId = id('lease-project');
    const now = Date.now();
    const a = await issueLease(db(), { projectId, uid, generationToken: 'tok', runId: 'run-aaaaaaaa', plannedCalls: 9, now });
    if (a.kind !== 'issued') throw new Error('not issued');
    const refA = { projectId, leaseId: a.lease.leaseId };
    for (let i = 0; i < LEASE_MAX_IN_FLIGHT; i++) expect((await acquireLeaseCall(db(), refA, { uid, now: now + 1 })).ok).toBe(true);
    expect(await acquireLeaseCall(db(), refA, { uid, now: now + 2 })).toMatchObject({ ok: false, code: 'lease-busy' });

    // The same run asking again gets its lease back; a new run gets its own, with nothing in flight.
    expect(await issueLease(db(), { projectId, uid, generationToken: 'tok', runId: 'run-aaaaaaaa', plannedCalls: 9, now: now + 3 })).toMatchObject({ kind: 'reused' });
    const b = await issueLease(db(), { projectId, uid, generationToken: 'tok', runId: 'run-bbbbbbbb', plannedCalls: 9, now: now + 4 });
    expect(b).toMatchObject({ kind: 'issued', superseded: [a.lease.leaseId], lease: { inFlight: 0, used: 0, runId: 'run-bbbbbbbb' } });
    if (b.kind !== 'issued') return;
    const refB = { projectId, leaseId: b.lease.leaseId };
    const got = await acquireLeaseCall(db(), refB, { uid, now: now + 5 });
    expect(got.ok).toBe(true);
    // The old run's late releases touch only its own record.
    for (let i = 0; i < LEASE_MAX_IN_FLIGHT; i++) await releaseLeaseCall(db(), refA);
    expect((await readLease(db(), refB))?.inFlight).toBe(1);
    if (got.ok) await releaseLeaseCall(db(), { ...refB, slotAt: got.slotAt });
    expect((await readLease(db(), refB))?.inFlight).toBe(0);

    // Cancel: only the owner closes, and a closed lease answers no call.
    expect(await closeLease(db(), refB, { uid: id('stranger') })).toBe(false);
    expect(await closeLease(db(), refB, { uid })).toBe(true);
    expect(await acquireLeaseCall(db(), refB, { uid, now: now + 6 })).toMatchObject({ ok: false, code: 'lease-closed' });
    expect(await closeLease(db(), refB, { uid })).toBe(false);

    // A slot held by a call that never released is free after the deadline + 30 s.
    const c = await issueLease(db(), { projectId: id('lease-project'), uid: id('lease-owner'), generationToken: 'tok', runId: 'run-cccccccc', plannedCalls: 9, now });
    if (c.kind !== 'issued') throw new Error('not issued');
    const refC = { projectId: c.lease.projectId, leaseId: c.lease.leaseId };
    for (let i = 0; i < LEASE_MAX_IN_FLIGHT; i++) expect((await acquireLeaseCall(db(), refC, { uid: c.lease.uid, now })).ok).toBe(true);
    expect(await acquireLeaseCall(db(), refC, { uid: c.lease.uid, now: now + LEASE_SLOT_STALE_MS - 1 })).toMatchObject({ ok: false, code: 'lease-busy' });
    const after = await acquireLeaseCall(db(), refC, { uid: c.lease.uid, now: now + LEASE_SLOT_STALE_MS });
    expect(after.ok).toBe(true);
    expect((await readLease(db(), refC))?.inFlight).toBe(1);
  });

  test('the hour\'s generations are read without being written', async () => {
    const uid = id('lease-owner');
    const now = Date.now();
    expect(await readLeaseWindow(db(), uid, now)).toEqual({ used: 0, limit: LEASES_PER_WINDOW, nextFreeInSeconds: null });
    await issueLease(db(), { projectId: id('lease-project'), uid, generationToken: 'tok', runId: 'run-dddddddd', plannedCalls: 9, now });
    expect(await readLeaseWindow(db(), uid, now + 1)).toMatchObject({ used: 1, nextFreeInSeconds: null });
  });
});

/*
 * What the rules text says. Whether a signed-in browser is in fact refused is
 * tried against the emulator in tests/transformation-lease-route.spec.ts
 * ('a browser signed in as the owner reads and writes neither ...').
 */
test('no rule names the lease records or opens a recursive path that would reach them', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  expect(rules).not.toContain(LEASE_COLLECTION);
  expect(rules).not.toContain(LEASE_WINDOW_COLLECTION);
  // No recursive wildcard under projects that would open the subcollection…
  expect(rules).not.toMatch(/match \/projects\/\{projectId\}\/\{[^}]*=\*\*\}/);
  // …and no catch-all at the database root that would open every collection.
  expect(rules).not.toMatch(/match \/\{[^}]*=\*\*\}/);
});
