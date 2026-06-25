/**
 * Test helper: seeds Firestore documents via the Firebase Admin SDK,
 * bypassing security rules.  This is required for creating admin user
 * profiles (isAdmin: true) because the client-side security rules
 * intentionally reject privilege-escalated writes.
 */

import firebaseConfig from '../../firebase-applet-config.json';

let adminApp: any = null;
let adminFirestore: any = null;

function getProjectId() {
  return firebaseConfig.projectId || 'cleancore-491216';
}

function getDatabaseId() {
  return firebaseConfig.firestoreDatabaseId || 'ai-studio-e57d33e3-9092-46bd-9c18-ac19c9a8b67e';
}

/**
 * Lazily initialise the Admin SDK, connecting to the Firestore emulator
 * when NEXT_PUBLIC_USE_FIREBASE_EMULATOR is set.
 */
async function ensureAdmin() {
  if (adminApp) return;

  const adminAppModule = await import('firebase-admin/app');
  const adminFirestoreModule = await import('firebase-admin/firestore');

  // Point Admin SDK at emulators when running locally / in CI
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    }
  }

  if (adminAppModule.getApps().length === 0) {
    adminApp = adminAppModule.initializeApp({ projectId: getProjectId() });
  } else {
    adminApp = adminAppModule.getApps()[0];
  }

  adminFirestore = adminFirestoreModule.getFirestore(adminApp, getDatabaseId());
}

/**
 * Write a document via the Admin SDK (bypasses all security rules).
 * Equivalent to `setDoc(doc(db, collection, id), data)` but server-side.
 */
export async function adminSetDoc(collectionPath: string, docId: string, data: Record<string, any>) {
  await ensureAdmin();
  await adminFirestore.collection(collectionPath).doc(docId).set(data);
}

/**
 * Merge-write a document via the Admin SDK (bypasses all security rules).
 */
export async function adminMergeDoc(collectionPath: string, docId: string, data: Record<string, any>) {
  await ensureAdmin();
  await adminFirestore.collection(collectionPath).doc(docId).set(data, { merge: true });
}

/**
 * Approve a user directly via the Admin SDK (bypasses API auth verification).
 * Replicates the server-side logic of POST /api/admin/approve-user.
 */
export async function adminApproveUser(uid: string) {
  await ensureAdmin();
  await adminFirestore.collection('users').doc(uid).set({
    status: 'approved',
    tier: 'starter', // Must be starter+ for Stage 6 Download Bundle button visibility
    transformationsLimit: 50, // High limit for CI: retries consume transformations
    transformationsUsed: 0,
  }, { merge: true });
}

/**
 * Mark a user as having requested tenant access via the Admin SDK.
 * Replicates the Firestore write in POST /api/request-tenant-access.
 */
export async function adminSetTenantRequested(uid: string) {
  await ensureAdmin();
  const { FieldValue } = await import('firebase-admin/firestore');
  await adminFirestore.collection('users').doc(uid).set({
    s4TenantAccessRequested: true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * Set the `admin` custom claim on an Auth user via the Admin SDK.
 * Required because Firestore security rules check ONLY
 * `request.auth.token.admin` (not the Firestore document).
 */
export async function adminSetCustomClaim(uid: string, claims: Record<string, any>) {
  await ensureAdmin();
  const adminAuthModule = await import('firebase-admin/auth');
  const auth = adminAuthModule.getAuth(adminApp);
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), ...claims });
}
