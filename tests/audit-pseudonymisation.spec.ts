import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  auditRowBackfillChange,
  auditRowErasureUpdate,
  auditRowNamesActorEmail,
  erasedAccountPseudonym,
  planAuditBackfill,
} from '../lib/audit-pseudonymisation';
import { accountHashOf, PseudonymPepperMissingError } from '../lib/pseudonym';
import { retainProofsOfErasedAccount, type ProofLogDb } from '../lib/proof-log-erasure';

/**
 * The security log (`audit_events`) after the legal review of 05.11.2026:
 * after an erasure a row names the account by the keyed hash only, and no
 * address of it stays; administrator identities of other accounts stay; the
 * legacy backfill applies the same rule to rows written before, and is
 * idempotent. Server-free: the pure transformation, plus source checks that
 * the erasure and the script use it. The erasure against the emulator is
 * `tests/account-erasure.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ENV = { PSEUDONYM_PEPPER: 'test-pseudonym-pepper-0123456789abcdef' };
const DEL = Symbol('delete');

/** Apply an update the way Firestore does, with `DEL` as `FieldValue.delete()`. */
function applied(row: Record<string, unknown>, update: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out = { ...row };
  for (const [k, v] of Object.entries(update ?? {})) {
    if (v === DEL) delete out[k];
    else out[k] = v;
  }
  return out;
}

const UID = 'ErasedUid42';
const EMAIL = 'Erased.Person@example.org';
const now = new Date('2026-11-05T10:00:00Z');

test.describe('the erasure rule', () => {
  const hash = erasedAccountPseudonym(UID, [EMAIL], ENV);

  test('the pseudonym is the keyed hash of the address the proof log carries, else of the uid', async () => {
    expect(hash).toBe(accountHashOf(EMAIL, ENV));
    expect(hash).toMatch(/^hmac1_[0-9a-f]{64}$/);
    expect(erasedAccountPseudonym(UID, [null, ''], ENV)).toBe(accountHashOf(`uid:${UID}`, ENV));
    expect(() => erasedAccountPseudonym(UID, [EMAIL], {})).toThrow(PseudonymPepperMissingError);
    // The same value retainProofsOfErasedAccount names the account by.
    const db = {
      collection: () => ({ where: () => ({ get: async () => ({ docs: [] }) }), doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }) }),
      batch: () => ({ set: () => undefined, update: () => undefined, delete: () => undefined, commit: async () => undefined }),
    } as unknown as ProofLogDb;
    const out = await retainProofsOfErasedAccount(db, () => DEL, { uid: UID, addresses: [EMAIL, EMAIL.toLowerCase()], endedAt: now, ending: 'account-deletion', env: ENV });
    expect(out.accountHash).toBe(hash);
  });

  test('a self-service row: uid on both sides becomes the hash, the address goes, action and time stay', () => {
    const row = { actorUid: UID, actorEmail: EMAIL, action: 'BYOK_SAVE', targetUid: UID, timestamp: now };
    const after = applied(row, auditRowErasureUpdate(row, UID, hash, DEL));
    expect(after).toEqual({ actorUid: hash, action: 'BYOK_SAVE', targetUid: hash, timestamp: now });
  });

  test('an administrator\'s act on the erased account: the administrator stays named', () => {
    const row = { actorUid: 'admin-1', actorEmail: 'admin@example.org', action: 'APPROVE_USER', targetUid: UID, timestamp: now };
    expect(applied(row, auditRowErasureUpdate(row, UID, hash, DEL))).toEqual({ ...row, targetUid: hash });
    const reset = { actorUid: 'script:mfa-reset', actorEmail: 'operator@example.org', action: 'mfa.reset', targetUid: UID, targetEmail: EMAIL, factorsRemoved: 1, timestamp: now };
    const after = applied(reset, auditRowErasureUpdate(reset, UID, hash, DEL));
    expect(after).toEqual({ actorUid: 'script:mfa-reset', actorEmail: 'operator@example.org', action: 'mfa.reset', targetUid: hash, factorsRemoved: 1, timestamp: now });
  });

  test('the erased account as an administrator: its own identity goes, the subject\'s stays', () => {
    const row = { actorUid: UID, actorEmail: EMAIL, action: 'REVOKE_USER', targetUid: 'someone', timestamp: now };
    expect(applied(row, auditRowErasureUpdate(row, UID, hash, DEL))).toEqual({ actorUid: hash, action: 'REVOKE_USER', targetUid: 'someone', timestamp: now });
  });

  test('the placeholder of the earlier erasure goes; a row about somebody else is untouched; a second pass changes nothing', () => {
    const old = { actorUid: UID, actorEmail: 'acct_0123456789abcdef', action: 'BYOK_DELETE', targetUid: UID, timestamp: now };
    const once = applied(old, auditRowErasureUpdate(old, UID, hash, DEL));
    expect(once.actorEmail).toBeUndefined();
    expect(auditRowErasureUpdate(once, UID, hash, DEL)).toBeNull();
    expect(auditRowErasureUpdate({ actorUid: 'a', targetUid: 'b', action: 'x' }, UID, hash, DEL)).toBeNull();
  });

  test('the cascade uses this rule for actor and subject, and deletes instead without the pepper', () => {
    const admin = read('lib/firebase-admin.ts');
    const at = admin.indexOf("await tryDelete('audit_events'");
    expect(at).toBeGreaterThan(-1);
    const step = admin.slice(at, at + 1600);
    expect(step).toContain("for (const field of ['actorUid', 'targetUid'])");
    expect(step).toContain('erasedAccountPseudonym(uid, proofAddresses)');
    expect(step).toContain('auditRowErasureUpdate(row.data() || {}, uid, pseudonym, FieldValue.delete())');
    expect(step).toContain('writes.push((batch) => batch.delete(ref));');
    // The unkeyed log reference is no longer what an erased account is named by.
    expect(step).not.toContain('accountLogRef');
    // The row of an administrator's deletion, written after the cascade, names the hash.
    const del = admin.slice(admin.indexOf('export async function adminDeleteUser'));
    expect(del.slice(0, 1400)).toContain("await logAuditEvent(db, adminUid, 'DELETE_USER_CASCADE', subject);");
  });
});

test.describe('which actions name the actor\'s address', () => {
  test('administrative actions do, self-service actions do not', () => {
    for (const a of ['GRANT_ADMIN', 'APPROVE_USER', 'DELETE_USER_CASCADE', 'BYOK_BLOCK', 'BYOK_DELETE_TEXT_FORM', 'mfa.reset', 'RUNNER_SELFTEST:held']) {
      expect(auditRowNamesActorEmail(a), a).toBe(true);
    }
    for (const a of ['BYOK_SAVE', 'BYOK_AUTO_STEPS_ON', 'project.reader.revoke:p', 'project.invitation.withdraw:p', 'PROJECT_REPAIR_DRAFT_ADOPTED:p:d', 'PROJECT_DECISION_SET:p']) {
      expect(auditRowNamesActorEmail(a), a).toBe(false);
    }
  });
});

test.describe('the legacy backfill', () => {
  const LIVE = 'live-uid';
  const GONE = 'gone-uid';
  const GONE_NO_ADDRESS = 'gone-without-address';
  const rows = [
    { id: 'r1', data: { actorUid: LIVE, actorEmail: 'live@example.org', action: 'BYOK_SAVE', targetUid: LIVE, timestamp: now } },
    { id: 'r2', data: { actorUid: LIVE, action: 'BYOK_DELETE', targetUid: LIVE, timestamp: now } },
    { id: 'r3', data: { actorUid: 'admin-live', actorEmail: 'admin@example.org', action: 'APPROVE_USER', targetUid: GONE, timestamp: now } },
    { id: 'r4', data: { actorUid: GONE, actorEmail: 'Gone@Example.org', action: 'project.reader.revoke:p1', targetUid: LIVE, timestamp: now } },
    { id: 'r5', data: { actorUid: GONE, actorEmail: 'acct_0123456789abcdef', action: 'BYOK_DELETE', targetUid: GONE, timestamp: now } },
    { id: 'r6', data: { actorUid: 'script:mfa-reset', actorEmail: 'operator@example.org', action: 'mfa.reset', targetUid: GONE_NO_ADDRESS, timestamp: now } },
    { id: 'r7', data: { actorUid: 'migration:v2.3', actorEmail: 'system-migration', action: 'RESET_QUOTA_V23_FAIRNESS', targetUid: LIVE, timestamp: now } },
    { id: 'r8', data: { actorUid: 'admin-live', actorEmail: 'admin@example.org', action: 'GRANT_S4', targetUid: LIVE, timestamp: now } },
  ];
  const existing = new Set([LIVE, 'admin-live']);

  test('self-service addresses go, deleted accounts become the hash, everything else stays', () => {
    const plan = planAuditBackfill(rows, existing, DEL, ENV);
    const after = Object.fromEntries(rows.map((r) => [r.id, applied(r.data, plan.updates.get(r.id))]));
    const goneHash = accountHashOf('gone@example.org', ENV);
    const anonHash = accountHashOf(`uid:${GONE_NO_ADDRESS}`, ENV);

    expect(after.r1).toEqual({ actorUid: LIVE, action: 'BYOK_SAVE', targetUid: LIVE, timestamp: now });
    expect(plan.updates.has('r2')).toBe(false);
    expect(after.r3).toEqual({ actorUid: 'admin-live', actorEmail: 'admin@example.org', action: 'APPROVE_USER', targetUid: goneHash, timestamp: now });
    expect(after.r4).toEqual({ actorUid: goneHash, action: 'project.reader.revoke:p1', targetUid: LIVE, timestamp: now });
    // One pseudonym per account across its rows, from the address another row revealed.
    expect(after.r5).toEqual({ actorUid: goneHash, action: 'BYOK_DELETE', targetUid: goneHash, timestamp: now });
    expect(after.r6).toEqual({ actorUid: 'script:mfa-reset', actorEmail: 'operator@example.org', action: 'mfa.reset', targetUid: anonHash, timestamp: now });
    expect(plan.updates.has('r7')).toBe(false);
    expect(plan.updates.has('r8')).toBe(false);

    expect(plan.counts).toEqual({ scanned: 8, changed: 5, selfServiceAddressesRemoved: 1, rowsOfDeletedAccounts: 4, sidesPseudonymised: 5, deletedAccounts: 2 });
    // The counts carry figures only.
    expect(JSON.stringify(plan.counts)).not.toMatch(/@|uid/);
  });

  test('a second run finds nothing to do', () => {
    const plan = planAuditBackfill(rows, existing, DEL, ENV);
    const once = rows.map((r) => ({ id: r.id, data: applied(r.data, plan.updates.get(r.id)) }));
    const again = planAuditBackfill(once, existing, DEL, ENV);
    expect(again.updates.size).toBe(0);
    expect(again.counts.changed).toBe(0);
  });

  test('a single row: nothing to change returns null', () => {
    const ctx = { exists: () => true, pseudonymOf: () => 'never' };
    expect(auditRowBackfillChange({ actorUid: LIVE, action: 'BYOK_SAVE', targetUid: LIVE }, ctx, DEL)).toBeNull();
  });

  test('without the pepper it throws before planning anything', () => {
    expect(() => planAuditBackfill(rows, existing, DEL, {})).toThrow(PseudonymPepperMissingError);
  });

  test('the script: dry run by default, counts only, refuses CI, default database the repository\'s', () => {
    const s = read('scripts/pseudonymise-audit-events.ts');
    expect(s).toContain("const apply = process.argv.includes('--apply');");
    expect(s).toContain("process.argv.includes('--database') ? argValue('--database') : FIRESTORE_DB_ID");
    expect(s).toContain('if (process.env.CI || process.env.GITHUB_ACTIONS)');
    expect(s).toContain('planAuditBackfill(rows, existing, FieldValue.delete())');
    // Every console line prints a constant or a count — never a row's content.
    for (const line of s.split('\n').filter((l) => /console\.(log|error)\(/.test(l))) {
      expect(line, line).not.toMatch(/\.data\b|actorEmail|targetEmail|\buid\b(?!s)|\.id\b/);
    }
  });
});
