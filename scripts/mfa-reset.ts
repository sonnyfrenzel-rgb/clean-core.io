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
 *   npx tsx scripts/mfa-reset.ts <email>            # shows what would change
 *   npx tsx scripts/mfa-reset.ts <email> --apply    # unenrols every factor, clears the flag, drops the legacy secrets
 *
 * Needs Application Default Credentials for cleancore-491216.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { FIRESTORE_DB_ID } from '../lib/constants';

const PROJECT_ID = 'cleancore-491216';
const APPLY = process.argv.includes('--apply');
const email = process.argv.slice(2).find((a) => !a.startsWith('--'));

async function main() {
  if (!email) {
    console.error('Usage: npx tsx scripts/mfa-reset.ts <email> [--apply]');
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
  console.log('Done. The account signs in with its first factor alone now and can enrol again in Settings.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
