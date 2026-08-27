import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { canonicalizeJson, computeRunHash, signRunHash, verifyRunIntegrity } from '../lib/run-signature';

/**
 * A signature that is never checked is decoration.
 *
 * `runs/create` hashed the run and signed the hash; `audit-pack/create` then
 * confirmed that `runHash` was a non-empty string and signed a manifest
 * attesting to it. Nothing recomputed the hash and nothing verified the HMAC, so
 * a run altered after creation came back out as a validly signed audit pack over
 * the altered content — the signature laundering the change instead of catching
 * it.
 *
 * Two client-writable fields made that reachable without any privileged access
 * at all: `worklist` and `extensibilityRoute` are both in the update allowlist
 * in firestore.rules, and the pack read them from the project in preference to
 * the run.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const KEY = 'test-signing-key-for-run-integrity';

function signedRun(payload: Record<string, any>) {
  const runHash = computeRunHash(payload);
  return { ...payload, runHash, signature: signRunHash(runHash, KEY) };
}

test.describe('run integrity', () => {
  const base = {
    runId: 'r1',
    projectId: 'p1',
    userId: 'u1',
    createdAt: '2026-08-27T00:00:00.000Z',
    status: 'completed',
    cleanCoreScore: 34,
    worklist: [{ id: 'w1', title: 'Direct read on VBAK', severity: 'High' }],
  };

  test('an untouched run verifies', () => {
    expect(verifyRunIntegrity(signedRun(base), KEY).valid).toBe(true);
  });

  test('a changed score no longer verifies', () => {
    const run = signedRun(base);
    run.cleanCoreScore = 95;
    const r = verifyRunIntegrity(run, KEY);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('hash-mismatch');
  });

  test('a removed worklist finding no longer verifies', () => {
    const run = signedRun(base);
    run.worklist = [];
    expect(verifyRunIntegrity(run, KEY).valid).toBe(false);
  });

  test('re-hashing after the edit does not help without the key', () => {
    // The realistic attack: alter the document AND recompute the hash. Only the
    // HMAC stands in the way, which is why the hash check alone was never enough.
    const run: Record<string, any> = signedRun(base);
    run.cleanCoreScore = 95;
    // Modelled as someone who read the code: strip the unsigned fields exactly
    // the way the verifier does, so the hash check passes and only the HMAC is
    // left standing. Setting them to `undefined` instead would canonicalise to
    // `null` and fail one step earlier, which would flatter the test.
    const unsigned = { ...run };
    delete unsigned.runHash;
    delete unsigned.signature;
    delete unsigned.analysis;
    run.runHash = computeRunHash(unsigned);
    const r = verifyRunIntegrity(run, KEY);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('signature-mismatch');
  });

  test('the narrative is outside the signature by design', () => {
    const run = signedRun(base);
    (run as any).analysis = 'a completely different narrative';
    expect(verifyRunIntegrity(run, KEY).valid).toBe(true);
  });

  test('canonical form is order-independent', () => {
    expect(canonicalizeJson({ b: 1, a: 2 })).toBe(canonicalizeJson({ a: 2, b: 1 }));
  });
});

test.describe('the audit pack refuses what it cannot verify', () => {
  const route = () => read('app/api/audit-pack/create/route.ts');

  test('it verifies the run before signing anything', () => {
    const s = route();
    expect(s).toContain('verifyRunIntegrity');
    // The check has to come before the manifest is signed, or it decides nothing.
    expect(s.indexOf('verifyRunIntegrity')).toBeLessThan(s.indexOf('createHmac'));
  });

  test('evidence comes from the run, not from the client-writable project', () => {
    const s = route();
    expect(s, 'the project worklist is preferred again').not.toMatch(/worklist:\s*projectData\.worklist/);
    expect(s, 'the project route is preferred again').not.toMatch(/extensibilityRoute:\s*projectData\./);
    expect(s).toContain('runData.worklist');
  });

  test('both fields really are client-writable, which is why this matters', () => {
    const rules = read('firestore.rules');
    const start = rules.indexOf('affectedKeys().hasOnly([');
    const block = rules.slice(start, rules.indexOf(']', start));
    expect(block).toContain("'worklist'");
    expect(block).toContain("'extensibilityRoute'");
  });
});

test.describe('one canonicaliser, not two', () => {
  test('runs/create uses the shared module', () => {
    const s = read('app/api/runs/create/route.ts');
    expect(s).toContain("from '@/lib/run-signature'");
    // A second local copy is how producer and verifier drift apart.
    expect(s).not.toMatch(/function canonicalizeJson/);
  });
});
