import { suppressionId, normaliseEmail } from '@/lib/unsubscribe-token';
import { ADMIN_SIGNUP_MAIL_KIND } from '@/lib/admin-signup-email';
import {
  ERASURE_NOTES,
  PROOF_LOG_COLLECTIONS,
  accountHashOf,
  contractEndRecord,
  erasureNoteRecord,
  pseudonymisedDeliveryFields,
  pseudonymisedProofFields,
  type ContractEnding,
} from '@/lib/proof-log';

/**
 * What an account erasure keeps, and how (privacy policy section 5, Terms 1.3,
 * the deletion dialog C7; acceptance tests T05/T06) — "proofs, not data":
 *
 * 1. the acceptance and ending records (`consent_events`,
 *    `byok_agreement_events`) stay, with the address, the uid and the locale
 *    replaced by the keyed hash of the address, the end of the contract and
 *    its kind added, and their own deletion date — 31 December of the third
 *    year after the end;
 * 2. one more record of the end of the contract itself;
 * 3. the deletion note "account (hash) deleted on [date]", three years;
 * 4. the delivery records of mails to the account, pseudonymised the same way,
 *    until their own period ends (the operator's notification about the new
 *    account is deleted, as its mail is from the operator's mailbox);
 * 5. an opt-out of community mail, as the keyed hash only, without end.
 *
 * Everything else the cascade in `lib/firebase-admin.ts` deletes. This module
 * only takes the handful of Firestore calls it needs, so a spec can drive it
 * with a stand-in (`tests/proof-log-3021.spec.ts`).
 */

interface Doc {
  id?: string;
  ref: unknown;
  exists?: boolean;
  data: () => Record<string, unknown> | undefined;
}
interface Query {
  get(): Promise<{ docs: Doc[] }>;
}
interface DocRef {
  get(): Promise<Doc>;
}
export interface ProofLogDb {
  collection(name: string): {
    where(field: string, op: '==' | 'array-contains', value: unknown): Query;
    doc(id?: string): unknown;
  };
  batch(): {
    set(ref: unknown, data: Record<string, unknown>, opts?: { merge: boolean }): unknown;
    update(ref: unknown, data: Record<string, unknown>): unknown;
    delete(ref: unknown): unknown;
    commit(): Promise<unknown>;
  };
}

type Write = (b: ReturnType<ProofLogDb['batch']>) => void;

async function commitAll(db: ProofLogDb, writes: Write[]): Promise<void> {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 400)) w(batch);
    await batch.commit();
  }
}

function asDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const t = v as { toDate?: () => Date } | null;
  return t && typeof t.toDate === 'function' ? t.toDate() : null;
}

/** The suppression list's document id for an address: the keyed hash, as everywhere else. */
export function suppressionKeyOf(email: string, env: Record<string, string | undefined> = process.env): string {
  return accountHashOf(email, env);
}

export interface RetainInput {
  uid: string;
  /** The account's addresses as stored (profile, invitation spelling). The first names the hash. */
  addresses: string[];
  endedAt: Date;
  ending: ContractEnding;
  env?: Record<string, string | undefined>;
}

export async function retainProofsOfErasedAccount(
  db: ProofLogDb,
  del: () => unknown,
  input: RetainInput,
): Promise<{ accountHash: string; pseudonymised: number }> {
  const env = input.env ?? process.env;
  const addresses = [...new Set(input.addresses.map(normaliseEmail).filter(Boolean))];
  // Throws PseudonymPepperMissingError before anything is written.
  const accountHash = accountHashOf(addresses[0] ?? `uid:${input.uid}`, env);
  const writes: Write[] = [];
  let pseudonymised = 0;
  const end = { accountHash, endedAt: input.endedAt, ending: input.ending };

  // 1. The acceptance and ending records.
  for (const name of PROOF_LOG_COLLECTIONS) {
    const rows = await db.collection(name).where('userId', '==', input.uid).get();
    for (const row of rows.docs) {
      pseudonymised++;
      writes.push((b) => b.update(row.ref, pseudonymisedProofFields(end, del())));
    }
  }
  // 2. The end of the contract. 3. The deletion note. Ids per hash and day, so
  //    a retried erasure writes them once.
  const day = input.endedAt.toISOString().slice(0, 10);
  writes.push((b) => b.set(db.collection('consent_events').doc(`contract-ended__${accountHash}__${day}`), contractEndRecord(end)));
  writes.push((b) => b.set(db.collection(ERASURE_NOTES).doc(`${accountHash}__${day}`), erasureNoteRecord({ accountHash, deletedAt: input.endedAt, ending: input.ending })));

  // 4. The delivery records, by uid and by address.
  const deliveries = new Map<unknown, Doc>();
  for (const row of (await db.collection('email_events').where('uid', '==', input.uid).get()).docs) deliveries.set(row.ref, row);
  for (const address of new Set([...input.addresses.filter(Boolean), ...addresses])) {
    for (const row of (await db.collection('email_events').where('to', 'array-contains', address).get()).docs) deliveries.set(row.ref, row);
  }
  for (const row of deliveries.values()) {
    const data = row.data() || {};
    if (data.kind === ADMIN_SIGNUP_MAIL_KIND) {
      writes.push((b) => b.delete(row.ref));
      continue;
    }
    pseudonymised++;
    const sentAt = asDate(data.sentAt) ?? asDate(data.updatedAt);
    writes.push((b) => b.update(row.ref, pseudonymisedDeliveryFields({ accountHash, sentAt, now: input.endedAt }, del())));
  }

  // 5. The opt-out list: one keyed entry per address that opted out; the
  //    legacy entries (plain SHA-256 id, address in clear) go.
  const suppressions = db.collection('email_suppressions');
  for (const address of addresses) {
    const keyedId = suppressionKeyOf(address, env);
    const found = new Map<unknown, Doc>();
    const legacyRef = suppressions.doc(suppressionId(address)) as DocRef;
    const legacy = await legacyRef.get();
    if (legacy.exists) found.set(legacy.ref, legacy);
    for (const row of (await suppressions.where('email', '==', address).get()).docs) found.set(row.ref, row);
    const keyedRef = suppressions.doc(keyedId) as DocRef;
    const keyed = await keyedRef.get();
    if (found.size === 0 && !keyed.exists) continue;
    const first = [...found.values()][0]?.data() || keyed.data() || {};
    writes.push((b) =>
      b.set(
        keyedRef,
        {
          list: typeof first.list === 'string' ? first.list : 'community-updates',
          keyed: true,
          retention: 'without-time-limit',
          unsubscribedAt: first.unsubscribedAt ?? input.endedAt,
          email: del(),
          uid: del(),
        },
        { merge: true },
      ),
    );
    for (const [ref, row] of found) if (row.id !== keyedId) writes.push((b) => b.delete(ref));
  }
  for (const row of (await suppressions.where('uid', '==', input.uid).get()).docs) {
    if (row.id && addresses.some((a) => suppressionKeyOf(a, env) === row.id)) continue;
    writes.push((b) => b.delete(row.ref));
  }

  await commitAll(db, writes);
  return { accountHash, pseudonymised };
}
