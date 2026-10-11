import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';

/**
 * SEC-2026-758, SEC-2026-764: the per-account write ceiling, client half.
 *
 * A browser creates two kinds of document for itself, projects and support
 * tickets. firestore.rules allows such a create only in a request that also
 * takes one step of the account's count in `write_ceilings/{uid}` and names
 * the new document there (`ceilingTaken`, `ceilingStep`). This module is the
 * one place that writes both, in one transaction.
 *
 * The figures must match the rules: a window of one day, opened by the first
 * create after the previous one ended, and at most `ceiling` creates in it.
 */
export const WRITE_CEILINGS = {
  projects: { kind: 'project', ceiling: 50 },
  support_tickets: { kind: 'ticket', ceiling: 10 },
} as const;

export type CeilingCollection = keyof typeof WRITE_CEILINGS;

const WINDOW_MS = 24 * 60 * 60 * 1000;
/** A browser clock this far ahead still waits for the rules' day to end. */
const CLOCK_MARGIN_MS = 10 * 60 * 1000;

export class WriteCeilingReached extends Error {
  constructor(collectionName: CeilingCollection) {
    super(
      collectionName === 'projects'
        ? 'This account has created as many projects as it may in one day. Please try again tomorrow.'
        : 'This account has sent as many support tickets as it may in one day. Please try again tomorrow.',
    );
    this.name = 'WriteCeilingReached';
  }
}

function millisOf(value: unknown): number | null {
  return value && typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ? (value as { toMillis: () => number }).toMillis()
    : null;
}

/**
 * Create one document in `collectionName` for `uid`, together with the step of
 * the account's write ceiling the rules ask for. Returns the new reference, as
 * `addDoc` does.
 */
export async function createWithinCeiling(
  db: Firestore,
  collectionName: CeilingCollection,
  uid: string,
  data: Record<string, unknown>,
): Promise<DocumentReference> {
  const { kind, ceiling } = WRITE_CEILINGS[collectionName];
  const ref = doc(collection(db, collectionName));
  const ceilingRef = doc(db, 'write_ceilings', uid);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ceilingRef);
      const stored = (snap.exists() ? snap.data() : {}) as Record<string, unknown>;
      const count = typeof stored[`${kind}Count`] === 'number' ? (stored[`${kind}Count`] as number) : 0;
      const windowStart = millisOf(stored[`${kind}Window`]);
      const windowOpen = windowStart !== null && Date.now() <= windowStart + WINDOW_MS + CLOCK_MARGIN_MS;

      if (windowOpen && count >= ceiling) throw new WriteCeilingReached(collectionName);
      const step = windowOpen
        ? { [`${kind}Count`]: count + 1, [`${kind}Id`]: ref.id }
        : { [`${kind}Count`]: 1, [`${kind}Window`]: serverTimestamp(), [`${kind}Id`]: ref.id };
      tx.set(ceilingRef, step, { merge: true });
      tx.set(ref, data);
    });
  } catch (error) {
    if (error instanceof WriteCeilingReached) throw error;
    // Until the rules that know the ceiling are deployed (by hand, after this
    // app), `write_ceilings` is closed to the browser and the read above is
    // refused. The create then goes alone, which those older rules allow and
    // the newer ones refuse — so this never writes past the ceiling. Remove
    // once the rules deploy is recorded in docs/registers/rules-deployment.json.
    // The code is read, not the class: FirebaseError's constructor resets the
    // prototype to its own, so `instanceof FirestoreError` is never true and
    // the fallback never ran (QA review of b3d276e88aba;
    // tests/firestore-rules-write-ceiling-transition.spec.ts).
    if ((error as { code?: unknown } | null)?.code === 'permission-denied') {
      await setDoc(ref, data);
      return ref;
    }
    throw error;
  }
  return ref;
}
