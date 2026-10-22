/**
 * "Stored and tested" — the record that the saved own key passed its test.
 *
 * Roadmap 3.0.21: the portfolio opens only for an account whose own model key
 * is stored **and tested** (Sonny, 11.10.2026). Nothing recorded the second
 * half: `POST /api/secrets/gemini/test` answered `ok` and forgot it. Now, when
 * it tests the **saved** key (no key in the body) and the provider accepts it,
 * it writes `testedAt` onto that record.
 *
 * Two properties, both from where the field lives:
 *
 *   - **A key saved again is untested again.** `saveOwnModelKey` replaces the
 *     whole record (`tx.set`, no merge), so `testedAt` goes with the old key.
 *   - **The test speaks for the key it tested.** The record is read before the
 *     test and written with that read's update time as a precondition; a save
 *     that lands while the provider is being asked makes the write fail, and
 *     the new key stays untested. That failure is not the caller's: the test
 *     itself still passed and is answered so.
 *
 * Server-only, Admin SDK; `user_secrets` is closed to every browser
 * (`firestore.rules`). Testing an entered key that is not saved records
 * nothing — it is not the key the account would run on.
 */

/** The parts of the Admin SDK this module touches, so a spec can hand in a fake. */
export interface TestedRecordRef {
  get(): Promise<{ exists: boolean; updateTime?: unknown }>;
  update(data: Record<string, unknown>, precondition?: { lastUpdateTime: unknown }): Promise<unknown>;
}

/** The record as it stood before the test — the precondition for marking it. */
export async function readBeforeTest(ref: TestedRecordRef): Promise<{ updateTime: unknown } | null> {
  const snap = await ref.get();
  return snap.exists && snap.updateTime ? { updateTime: snap.updateTime } : null;
}

/**
 * Write `testedAt` onto the record, only if it is still the one read before
 * the test. Returns whether it was written.
 */
export async function markStoredKeyTested(
  ref: TestedRecordRef,
  before: { updateTime: unknown } | null,
  testedAt: unknown,
): Promise<boolean> {
  if (!before) return false;
  try {
    await ref.update({ testedAt }, { lastUpdateTime: before.updateTime });
    return true;
  } catch {
    return false;
  }
}
