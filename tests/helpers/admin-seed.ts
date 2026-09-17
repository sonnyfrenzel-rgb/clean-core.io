/**
 * Test helper: seeds Firestore documents via the server-side /api/test/seed endpoint,
 * bypassing security rules and avoiding Node ESM import issues inside Playwright.
 */

import firebaseConfig from '../../firebase-config.json';

/**
 * The app under test. Port 3000 unless a run says otherwise — several worktrees
 * of this repository can have a dev server up at once, and a spec that seeds
 * through a hard-coded port silently seeds the wrong one.
 */
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function callSeedApi(payload: any) {
  const response = await fetch(`${BASE_URL}/api/test/seed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-seed-token': process.env.PILOT_APPROVAL_SECRET || '',
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Seeding API failed: ${text}`);
  }
}

export async function adminSetDoc(collectionPath: string, docId: string, data: Record<string, any>) {
  await callSeedApi({ action: 'setDoc', collectionPath, docId, data });
}

export async function adminMergeDoc(collectionPath: string, docId: string, data: Record<string, any>) {
  await callSeedApi({ action: 'mergeDoc', collectionPath, docId, data });
}

export async function adminApproveUser(uid: string) {
  await adminMergeDoc('users', uid, {
    status: 'approved',
    tier: 'starter', // Must be starter+ for Stage 6 Download Bundle button visibility
    transformationsLimit: 50, // High limit for CI: retries consume transformations
    transformationsUsed: 0,
  });
}

export async function adminSetTenantRequested(uid: string) {
  await adminMergeDoc('users', uid, {
    s4TenantAccessRequested: true,
  });
}

export async function adminSetCustomClaim(uid: string, claims: Record<string, any>) {
  await callSeedApi({ action: 'setCustomClaim', uid, claims });
}

/**
 * Marks an account's address confirmed, or takes the confirmation away.
 *
 * Roadmap 5.3 turns on exactly this bit, and the Auth emulator has no mailbox
 * to confirm one from. `email_verified` travels inside the ID token, so a
 * caller must re-mint it (`user.getIdToken(true)`) before the change is visible
 * to a route.
 */
export async function adminSetEmailVerified(uid: string, emailVerified: boolean) {
  await callSeedApi({ action: 'setEmailVerified', uid, emailVerified });
}

/** Server-side existence check — for collections client SDKs cannot read (user_secrets, mfa_*, s4_credentials). */
export async function adminDocExists(collectionPath: string, docId: string): Promise<boolean> {
  const response = await fetch(`${BASE_URL}/api/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-seed-token': process.env.PILOT_APPROVAL_SECRET || '' },
    body: JSON.stringify({ action: 'existsDoc', collectionPath, docId }),
  });
  if (!response.ok) throw new Error(`existsDoc failed: ${await response.text()}`);
  return (await response.json()).exists === true;
}

/**
 * Server-side read-back — what a route actually stored, not what it answered.
 *
 * For the stores no client SDK can reach: `projects/{id}/invitations/{id}` has
 * no match in `firestore.rules`, and `projects/{id}.readers` is Admin-SDK-only.
 */
export async function adminGetDoc(collectionPath: string, docId: string): Promise<Record<string, any> | null> {
  const response = await fetch(`${BASE_URL}/api/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-seed-token': process.env.PILOT_APPROVAL_SECRET || '' },
    body: JSON.stringify({ action: 'getDoc', collectionPath, docId }),
  });
  if (!response.ok) throw new Error(`getDoc failed: ${await response.text()}`);
  return (await response.json()).data ?? null;
}
