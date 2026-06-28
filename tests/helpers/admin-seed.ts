/**
 * Test helper: seeds Firestore documents via the server-side /api/test/seed endpoint,
 * bypassing security rules and avoiding Node ESM import issues inside Playwright.
 */

import firebaseConfig from '../../firebase-applet-config.json';

const BASE_URL = 'http://localhost:3000';

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
