/**
 * Which sign-in a "not now" on the Terms gate belongs to.
 *
 * The decline is kept in session storage so a reload does not ask again
 * (components/TermsReacceptGate.tsx). Stored as a bare `'1'`, it also outlived
 * a sign-out: the next sign-in in the same tab found it and the gate stayed
 * silent, although the rule is that a new sign-in asks again (Sonny,
 * 18.09.2026) — carried QA finding 3f5a34a117be.
 *
 * So the stored value names the sign-in: the account and the time Firebase
 * recorded for that sign-in. A reload keeps both; signing in again changes the
 * time, and another account changes the uid. Pure — no Firebase import — so it
 * can be tested without a browser.
 */

export interface SignedInUser {
  uid: string;
  metadata: { lastSignInTime?: string | null };
}

/** The value a decline is stored under for this sign-in, or null with nobody signed in. */
export function declineMark(user: SignedInUser | null | undefined): string | null {
  if (!user?.uid) return null;
  return `${user.uid}|${user.metadata?.lastSignInTime ?? ''}`;
}

/** Whether `stored` is a decline made in this very sign-in. */
export function declinedInThisSignIn(stored: string | null | undefined, user: SignedInUser | null | undefined): boolean {
  const mark = declineMark(user);
  return mark !== null && stored === mark;
}
