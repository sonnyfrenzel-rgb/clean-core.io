/**
 * Removes the second factor from one account — the recovery path for a lost
 * authenticator, and the one-off migration from the application-level TOTP
 * that preceded Firebase's factor (roadmap 0.13).
 *
 * Firebase's TOTP factor has no backup codes. When the authenticator is gone,
 * an administrator confirms the request with the person out of band and runs
 * this; the account then signs in with its first factor alone and enrols again
 * in Settings.
 *
 * Usage:
 *   npx tsx scripts/mfa-reset.ts <email>                              # shows what would change
 *   npx tsx scripts/mfa-reset.ts <email> --apply --operator <email>   # unenrols every factor, clears the flag, drops the legacy secrets
 *
 * Needs Application Default Credentials for cleancore-491216.
 *
 * `--operator` is required for `--apply`, and it is not paperwork. Removing
 * someone's second factor is the most security-relevant thing an administrator
 * can do to an account, and the privacy policy tells readers that
 * administrative actions on an account are recorded in an audit log "together
 * with the acting administrator, the affected account and the time". Approval,
 * revocation and deletion write that record through `logAuditEvent`; this
 * script wrote only an `mfaResetAt` stamp on the user document — a single field
 * that the next reset overwrites and that names nobody
 * (security audit of v2.11.0, SEC-2026-023).
 *
 * Application Default Credentials identify a Google principal, not a Firestore
 * user, so the acting person cannot be derived here — which is why it has to be
 * stated. The record is only as honest as the person who types it, and that is
 * still the difference between a log and no log.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { FIRESTORE_DB_ID } from '../lib/constants';

const PROJECT_ID = 'cleancore-491216';
const APPLY = process.argv.includes('--apply');
const flagValue = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  const next = i >= 0 ? process.argv[i + 1] : undefined;
  return next && !next.startsWith('--') ? next : undefined;
};
const OPERATOR = flagValue('operator');
const REASON = flagValue('reason');
const email = process.argv.slice(2).find((a, i, all) => {
  if (a.startsWith('--')) return false;
  const previous = all[i - 1];
  return previous !== '--operator' && previous !== '--reason';
});

async function main() {
  if (!email) {
    console.error('Usage: npx tsx scripts/mfa-reset.ts <email> [--apply --operator <email> [--reason "..."]]');
    process.exit(1);
  }
  if (APPLY && !OPERATOR) {
    console.error('Refusing to apply without --operator <email>: the audit record has to name who did this.');
    process.exit(1);
  }
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const auth = getAuth();
  const db = getFirestore(getApps()[0], FIRESTORE_DB_ID);

  const user = await auth.getUserByEmail(email);
  const factors = user.multiFactor?.enrolledFactors ?? [];
  const profile = (await db.collection('users').doc(user.uid).get()).data() ?? {};
  const legacySecret = (await db.collection('mfa_secrets').doc(user.uid).get()).exists;
  const legacyPending = (await db.collection('mfa_pending').doc(user.uid).get()).exists;

  console.log(`account      : ${user.uid}`);
  console.log(`factors      : ${factors.length ? factors.map((f) => `${f.factorId}${f.displayName ? ` (${f.displayName})` : ''}`).join(', ') : 'none'}`);
  console.log(`mfaEnabled   : ${profile.mfaEnabled === true}`);
  console.log(`legacy docs  : mfa_secrets=${legacySecret} mfa_pending=${legacyPending}`);

  if (!APPLY) {
    console.log('DRY RUN — nothing changed. Re-run with --apply.');
    return;
  }

  if (factors.length) await auth.updateUser(user.uid, { multiFactor: { enrolledFactors: null } });
  await db.collection('users').doc(user.uid).set(
    { mfaEnabled: false, mfaFactor: FieldValue.delete(), mfaSecret: FieldValue.delete(), mfaBackupCodes: FieldValue.delete(), mfaResetAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  await Promise.all([db.collection('mfa_secrets').doc(user.uid).delete(), db.collection('mfa_pending').doc(user.uid).delete()]);

  // Written last, so a record only exists for a reset that actually happened —
  // the same shape `logAuditEvent` writes for approval, revocation and
  // deletion, with the actor stated rather than derived. `audit_events` is
  // server-only in `firestore.rules` (`allow read, write: if false`), so this
  // needs the Admin SDK and cannot be written or removed from a browser.
  await db.collection('audit_events').add({
    actorUid: 'script:mfa-reset',
    actorEmail: OPERATOR,
    action: 'mfa.reset',
    targetUid: user.uid,
    targetEmail: user.email || email,
    factorsRemoved: factors.length,
    ...(REASON ? { reason: REASON } : {}),
    timestamp: new Date(),
  });

  console.log(`Recorded in audit_events: mfa.reset on ${user.email || email} by ${OPERATOR}.`);
  console.log('Done. The account signs in with its first factor alone now and can enrol again in Settings.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
