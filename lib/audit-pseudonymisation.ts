import { accountHashOf } from './pseudonym';

/**
 * The security log (`audit_events`) after the legal review of 05.11.2026:
 * what a row names, and how a row names an account that no longer exists.
 *
 * - **Administrative actions** (the set below) record the acting
 *   administrator's uid and address, the affected account's uid and the time.
 * - **Self-service actions** (an account acting on its own model key, its
 *   projects, its readers and invitations, its repair drafts) record the uid,
 *   the action and the time — no address.
 * - **After an account is erased**, every row in which it is the actor or the
 *   subject keeps its action and time, but the account's uid is replaced by the
 *   keyed hash (`accountHashOf`, HMAC-SHA256 under `PSEUDONYM_PEPPER` — the
 *   same value the proof log and the deletion note carry for that account) and
 *   no address of it stays. Another administrator's uid and address in the
 *   same row stay: they attribute a privileged act to whoever made it.
 *
 * Pure — no Firestore, no `firebase-admin` — so the erasure
 * (`lib/firebase-admin.ts`), the legacy backfill
 * (`scripts/pseudonymise-audit-events.ts`) and the server-free spec
 * (`tests/audit-pseudonymisation.spec.ts`) run the same code.
 */

/**
 * The administrative actions whose row names the acting administrator's
 * address (PRV-01). Everything else an account does is self-service and is
 * recorded by uid alone.
 */
export const PRIVILEGED_AUDIT_ACTIONS: ReadonlySet<string> = new Set([
  'GRANT_ADMIN', 'REVOKE_ADMIN', 'APPROVE_USER', 'REVOKE_USER', 'GRANT_S4', 'REVOKE_S4',
  'GRANT_S4_LINK', 'REJECT_S4_LINK', 'DELETE_USER_CASCADE', 'BYOK_BLOCK', 'BYOK_DELETE_TEXT_FORM',
  // Written by `scripts/mfa-reset.ts` with the operator's address as `actorEmail`.
  'mfa.reset',
]);

/** Whether a row for `action` records the actor's address. */
export function auditRowNamesActorEmail(action: string): boolean {
  return PRIVILEGED_AUDIT_ACTIONS.has(action) || action.startsWith('RUNNER_SELFTEST:');
}

/**
 * An actor or subject that is not an account: a maintenance script, a
 * migration, the system itself (`scripts/mfa-reset.ts`,
 * `scripts/purge-audit-events.ts`, `scripts/reset-quota-v23-fairness.mjs`).
 */
export function isSystemPrincipal(id: string): boolean {
  return id === 'system' || /^(script|migration):/.test(id);
}

/** A keyed hash of an address as `accountHashOf` writes it. */
export function isKeyedPseudonym(value: unknown): boolean {
  return typeof value === 'string' && /^hmac1_[0-9a-f]{64}$/.test(value);
}

/** An account uid a row names in `field`, or null (absent, a script, already a pseudonym). */
function accountIn(row: Record<string, unknown>, field: 'actorUid' | 'targetUid'): string | null {
  const v = row[field];
  if (typeof v !== 'string' || !v || isSystemPrincipal(v) || isKeyedPseudonym(v)) return null;
  return v;
}

/** The address field that belongs to each side of a row. */
const EMAIL_OF = { actorUid: 'actorEmail', targetUid: 'targetEmail' } as const;

/**
 * The keyed hash an erased account is named by: of its address, or of
 * `uid:<uid>` when no address is known — the same rule as
 * `retainProofsOfErasedAccount` (`lib/proof-log-erasure.ts`), so one account
 * carries one pseudonym across the proof log, the deletion note and this log.
 * Throws `PseudonymPepperMissingError` without the pepper.
 */
export function erasedAccountPseudonym(
  uid: string,
  addresses: Array<string | null | undefined>,
  env: Record<string, string | undefined> = process.env,
): string {
  const first = addresses.map((a) => (a || '').trim().toLowerCase()).find(Boolean);
  return accountHashOf(first ?? `uid:${uid}`, env);
}

/**
 * The update that makes one row name the erased account `uid` only by
 * `pseudonym`: its uid replaced on whichever side it stands, and the address
 * of that side removed. Null when the row does not name the account.
 * `del` is `FieldValue.delete()`.
 */
export function auditRowErasureUpdate(
  row: Record<string, unknown>,
  uid: string,
  pseudonym: string,
  del: unknown,
): Record<string, unknown> | null {
  const update: Record<string, unknown> = {};
  for (const side of ['actorUid', 'targetUid'] as const) {
    if (row[side] !== uid) continue;
    update[side] = pseudonym;
    if (EMAIL_OF[side] in row) update[EMAIL_OF[side]] = del;
  }
  return Object.keys(update).length ? update : null;
}

/* ------------------------------------------------- the legacy backfill */

/** The account uids a row names, on either side. */
export function accountUidsOf(row: Record<string, unknown>): string[] {
  return [accountIn(row, 'actorUid'), accountIn(row, 'targetUid')].filter((u): u is string => !!u);
}

/**
 * The addresses a row reveals for its accounts — the actor's address on a row
 * the account itself wrote (every row before 3.0.21 had one), the subject's on
 * an MFA reset — so the backfill can name a deleted account by the hash of its
 * address, as the erasure would have.
 */
export function addressHintsOf(row: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const side of ['actorUid', 'targetUid'] as const) {
    const uid = accountIn(row, side);
    const email = row[EMAIL_OF[side]];
    if (uid && typeof email === 'string' && email.includes('@')) out.push([uid, email]);
  }
  return out;
}

export interface BackfillContext {
  /** Whether the account still exists (Auth user or profile). */
  exists: (uid: string) => boolean;
  /** The pseudonym of a deleted account (`erasedAccountPseudonym`). */
  pseudonymOf: (uid: string) => string;
}

export interface BackfillChange {
  update: Record<string, unknown>;
  /** A self-service row lost the address it was written with before 3.0.21. */
  selfServiceAddressRemoved: boolean;
  /** Sides (actor, subject) of a deleted account that were pseudonymised. */
  sidesPseudonymised: number;
}

/**
 * What the backfill changes on one row, or null when the row is already in the
 * current shape — which makes a second run a no-op:
 *
 * 1. a self-service row by a live account loses `actorEmail` (rows written
 *    before 3.0.21 carried one; `auditRowNamesActorEmail`);
 * 2. every side naming an account that no longer exists is pseudonymised as
 *    the erasure does it (`auditRowErasureUpdate`) — which also removes the
 *    `acct_…` placeholder an erasure before this change put in `actorEmail`.
 *
 * Rows of scripts and migrations, and the administrator's address on an
 * administrative row by a live administrator, stay as they are.
 */
export function auditRowBackfillChange(
  row: Record<string, unknown>,
  ctx: BackfillContext,
  del: unknown,
): BackfillChange | null {
  let update: Record<string, unknown> = {};
  let sidesPseudonymised = 0;
  for (const uid of new Set(accountUidsOf(row))) {
    if (ctx.exists(uid)) continue;
    const change = auditRowErasureUpdate(row, uid, ctx.pseudonymOf(uid), del);
    if (!change) continue;
    update = { ...update, ...change };
    sidesPseudonymised += ['actorUid', 'targetUid'].filter((s) => s in change).length;
  }
  const actor = accountIn(row, 'actorUid');
  const action = typeof row.action === 'string' ? row.action : '';
  const selfServiceAddressRemoved =
    !!actor && ctx.exists(actor) && 'actorEmail' in row && !auditRowNamesActorEmail(action);
  if (selfServiceAddressRemoved) update.actorEmail = del;
  if (!Object.keys(update).length) return null;
  return { update, selfServiceAddressRemoved, sidesPseudonymised };
}

export interface BackfillPlan {
  /** Document id → the update for it. */
  updates: Map<string, Record<string, unknown>>;
  counts: {
    scanned: number;
    changed: number;
    selfServiceAddressesRemoved: number;
    rowsOfDeletedAccounts: number;
    sidesPseudonymised: number;
    deletedAccounts: number;
  };
}

/**
 * The whole backfill over a set of rows, given which accounts still exist.
 * Each deleted account is named by the hash of an address some row of it
 * reveals, or of its uid — one value per account across all its rows. Counts
 * only: nothing in the plan's counts names an account or an address.
 * Throws `PseudonymPepperMissingError` without the pepper.
 */
export function planAuditBackfill(
  rows: Array<{ id: string; data: Record<string, unknown> }>,
  existing: ReadonlySet<string>,
  del: unknown,
  env: Record<string, string | undefined> = process.env,
): BackfillPlan {
  const hints = new Map<string, string>();
  for (const row of rows) for (const [uid, email] of addressHintsOf(row.data)) if (!hints.has(uid)) hints.set(uid, email);
  const pseudonyms = new Map<string, string>();
  const ctx: BackfillContext = {
    exists: (uid) => existing.has(uid),
    pseudonymOf: (uid) => {
      if (!pseudonyms.has(uid)) pseudonyms.set(uid, erasedAccountPseudonym(uid, [hints.get(uid)], env));
      return pseudonyms.get(uid)!;
    },
  };
  const updates = new Map<string, Record<string, unknown>>();
  const counts = { scanned: rows.length, changed: 0, selfServiceAddressesRemoved: 0, rowsOfDeletedAccounts: 0, sidesPseudonymised: 0, deletedAccounts: 0 };
  for (const row of rows) {
    const change = auditRowBackfillChange(row.data, ctx, del);
    if (!change) continue;
    updates.set(row.id, change.update);
    counts.changed++;
    if (change.selfServiceAddressRemoved) counts.selfServiceAddressesRemoved++;
    if (change.sidesPseudonymised > 0) counts.rowsOfDeletedAccounts++;
    counts.sidesPseudonymised += change.sidesPseudonymised;
  }
  counts.deletedAccounts = pseudonyms.size;
  return { updates, counts };
}
