import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, connectFirestoreEmulator } from 'firebase/firestore';
import { adminSetDoc, adminSetCustomClaim, adminMergeDoc, adminDocExists } from './helpers/admin-seed';
import JSZip from 'jszip';
import { createHash } from 'crypto';

// Set test secret first so that imports initializing getSecret don't throw
process.env.PILOT_APPROVAL_SECRET = process.env.PILOT_APPROVAL_SECRET || 'test-approval-secret-key-12345';

import { createApprovalToken } from '../lib/approval-token';
import { computeRunHash, signRunHash } from '../lib/run-signature';
import firebaseConfig from '../firebase-config.json';

// Initialize Firebase SDK in Node context for seeding and validation
const firebaseApp = initializeApp(firebaseConfig);
const firestoreDb = initializeFirestore(firebaseApp, {}, firebaseConfig.firestoreDatabaseId);
const firebaseAuth = getAuth(firebaseApp);

if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  console.log('[TEST SDK] Connecting E2E security test runner to emulators...');
  connectFirestoreEmulator(firestoreDb, '127.0.0.1', 8080);
  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

const branchSuffix = (process.env.GITHUB_REF_NAME || 'local').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

// Accounts for testing (using timestamp to prevent collisions between sequential test runs in the emulator)
const NORMAL_USER_EMAIL = `security-user-${branchSuffix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@cleancore-test.io`;
const ADMIN_USER_EMAIL = `sonny.frenzel@gmail.com`; // Hardcoded admin email in constants
const TEST_PASSWORD = 'SecurityPassword123!';

test.describe('Clean-Core.io Security, Compliance & Onboarding Gates E2E Tests', () => {
  let normalUserUid = '';
  let adminUid = '';

  test.beforeAll(async ({ request }) => {
    // 1. Register a normal test user
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, NORMAL_USER_EMAIL, TEST_PASSWORD);
      normalUserUid = cred.user.uid;
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(firebaseAuth, NORMAL_USER_EMAIL, TEST_PASSWORD);
        normalUserUid = cred.user.uid;
      } else {
        throw e;
      }
    }

    // Seed normal user profile via Admin SDK (bypasses security rules).
    // Using the client SDK's setDoc() triggers the emulator's rules evaluation
    // which fails when the update rule tries to access resource.data on a
    // non-existent document.
    await adminSetDoc('users', normalUserUid, {
      firstName: 'Normal',
      lastName: 'Security User',
      email: NORMAL_USER_EMAIL,
      tier: 'pilot',
      status: 'pending',
      isAdmin: false,
      transformationsUsed: 0,
      transformationsLimit: 5,
      maxTeamMembers: 1,
      s4TenantAccessAllowed: false,
      s4TenantAccessRequested: false,
      mfaEnabled: false,
      createdAt: new Date(),
    });

    // Request access via server-side API
    const normalUserCred = await signInWithEmailAndPassword(firebaseAuth, NORMAL_USER_EMAIL, TEST_PASSWORD);
    const normalUserToken = await normalUserCred.user.getIdToken();
    const reqResponse = await request.post('/api/request-tenant-access', {
      headers: {
        'Authorization': `Bearer ${normalUserToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        name: 'Normal Security User',
        motivation: 'Testing live tenant access integration gates.'
      }
    });
    if (reqResponse.status() !== 200) {
      throw new Error(`Failed to request tenant access via API: ${await reqResponse.text()}`);
    }

    // 2. Register an admin user
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, ADMIN_USER_EMAIL, TEST_PASSWORD);
      adminUid = cred.user.uid;
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(firebaseAuth, ADMIN_USER_EMAIL, TEST_PASSWORD);
        adminUid = cred.user.uid;
      } else {
        throw e;
      }
    }

    // Seed admin profile via Admin SDK (bypasses security rules).
    // The client SDK would reject isAdmin:true on profile creation (L100 in firestore.rules).
    await adminSetDoc('users', adminUid, {
      firstName: 'Sonny',
      lastName: 'Frenzel',
      email: ADMIN_USER_EMAIL,
      isAdmin: true,
      createdAt: new Date(),
    });
    // Set admin custom claim so Firestore rules (token-only check) recognise this user
    await adminSetCustomClaim(adminUid, { admin: true });
  });

  test('should restrict S/4HANA connection tests for unapproved users (API Gating)', async ({ request }) => {
    // Sign in as normal user to get their token
    const cred = await signInWithEmailAndPassword(firebaseAuth, NORMAL_USER_EMAIL, TEST_PASSWORD);
    const token = await cred.user.getIdToken();

    // Call connection test API
    const response = await request.post('/api/test-s4-connection', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      data: {
        url: 'https://sandbox.s4hana.com/sap/opu/odata/sap/API_BUSINESS_PARTNER',
        authType: 'basic',
      },
    });

    // Assert that request is forbidden (403) and returns the restriction message
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.message || body.error).toContain('Access to S/4HANA live tenant endpoints is restricted');
  });

  // Signup no longer routes through an approval endpoint — /api/admin/approve-user
  // and the one-click links that fed it were removed with the approval gate. What
  // is still reachable is the admin console action, so that is what has to hold
  // the line against a caller who is not an administrator.
  test('should reject account state changes if admin token is missing or invalid', async ({ request }) => {
    // 1. Call without auth header
    const noAuthResponse = await request.post('/api/admin/console-action', {
      data: {
        uid: normalUserUid,
        action: 'approve-user',
      },
    });
    expect(noAuthResponse.status()).toBe(403); // Admin required

    // 2. Call with normal user token
    const normalUserCred = await signInWithEmailAndPassword(firebaseAuth, NORMAL_USER_EMAIL, TEST_PASSWORD);
    const normalUserToken = await normalUserCred.user.getIdToken();
    const badAuthResponse = await request.post('/api/admin/console-action', {
      headers: {
        'Authorization': `Bearer ${normalUserToken}`,
      },
      data: {
        uid: normalUserUid,
        action: 'approve-user',
      },
    });
    expect(badAuthResponse.status()).toBe(403); // Admin required

    // 3. The account must still be untouched.
    const userDoc = await getDoc(doc(firestoreDb, 'users', normalUserUid));
    expect(userDoc.data()?.status).not.toBe('approved');
  });

  // Tenant access is the one approval a human still makes, and it is the only
  // remaining HMAC-token flow. The pilot equivalent went away with the signup
  // approval gate; this keeps the cryptographic check itself under test.
  test('should cryptographically verify HMAC tokens during admin approvals', async ({ request }) => {
    // Sign in as Admin
    const adminCred = await signInWithEmailAndPassword(firebaseAuth, ADMIN_USER_EMAIL, TEST_PASSWORD);
    const adminToken = await adminCred.user.getIdToken();

    // 1. Approve with invalid token
    const invalidTokenRes = await request.post('/api/admin/approve-tenant', {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
      },
      data: {
        uid: normalUserUid,
        token: 'test-incorrect-hmac-token-12345', // test- prefix: a fixture, not a credential (scripts/qa/lib/redact.mjs)
        action: 'approve',
      },
    });
    expect(invalidTokenRes.status()).toBe(500); // Invalid verification token error
    const errBody = await invalidTokenRes.json();
    expect(errBody.error).toContain('Invalid verification token');

    // A refused token must not have granted anything.
    const beforeDoc = await getDoc(doc(firestoreDb, 'users', normalUserUid));
    expect(beforeDoc.data()?.s4TenantAccessAllowed).not.toBe(true);

    // Generate valid approval token (Audit P2: action-bound, expiring)
    const validToken = createApprovalToken(normalUserUid, 'tenant', 'approve');

    // 2. Approve with valid token
    const validTokenRes = await request.post('/api/admin/approve-tenant', {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
      },
      data: {
        uid: normalUserUid,
        token: validToken,
        action: 'approve',
      },
    });
    expect(validTokenRes.status()).toBe(200);

    // Verify Firestore document was updated
    const userDoc = await getDoc(doc(firestoreDb, 'users', normalUserUid));
    expect(userDoc.data()?.s4TenantAccessAllowed).toBe(true);
  });

  test('registration activates the account and records consent server-side', async ({ request }) => {
    const signupEmail = `signup-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, signupEmail, TEST_PASSWORD);
    const signupUid = cred.user.uid;
    const signupToken = await cred.user.getIdToken();

    // What the browser is allowed to write: a pending profile, no consent.
    await setDoc(doc(firestoreDb, 'users', signupUid), {
      firstName: 'Sign',
      lastName: 'Up',
      email: signupEmail,
      tier: 'pilot',
      status: 'pending',
      transformationsUsed: 0,
      transformationsLimit: 5,
      maxTeamMembers: 1,
      orgId: null,
      identityProvider: 'password',
      createdAt: new Date(),
      isAdmin: false,
      authMethod: 'password',
      s4TenantAccessAllowed: false,
      s4TenantAccessRequested: false,
      mfaEnabled: false,
    });

    const res = await request.post('/api/account/register', {
      headers: { 'Authorization': `Bearer ${signupToken}` },
      data: { firstName: 'Sign', lastName: 'Up', acceptedTerms: true, acceptedPrivacy: true },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).activated).toBe(true);

    const activated = await getDoc(doc(firestoreDb, 'users', signupUid));
    expect(activated.data()?.status).toBe('approved');
    expect(activated.data()?.activatedAt).toBeTruthy();
    // Only the Admin SDK can write this — the client create rule rejects it.
    expect(activated.data()?.termsVersionAccepted).toBeTruthy();
    expect(activated.data()?.termsAcceptedAt).toBeTruthy();

    // Idempotent: calling again neither re-activates nor sends a second mail.
    const again = await request.post('/api/account/register', {
      headers: { 'Authorization': `Bearer ${signupToken}` },
      data: { acceptedTerms: true, acceptedPrivacy: true },
    });
    expect(again.status()).toBe(200);
    expect((await again.json()).activated).toBe(false);
  });

  test('registration refuses to activate an account that did not accept the terms', async ({ request }) => {
    const refuseEmail = `no-consent-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, refuseEmail, TEST_PASSWORD);
    const refuseUid = cred.user.uid;
    const refuseToken = await cred.user.getIdToken();

    await setDoc(doc(firestoreDb, 'users', refuseUid), {
      firstName: 'No',
      lastName: 'Consent',
      email: refuseEmail,
      tier: 'pilot',
      status: 'pending',
      transformationsUsed: 0,
      transformationsLimit: 5,
      maxTeamMembers: 1,
      orgId: null,
      identityProvider: 'password',
      createdAt: new Date(),
      isAdmin: false,
      authMethod: 'password',
      s4TenantAccessAllowed: false,
      s4TenantAccessRequested: false,
      mfaEnabled: false,
    });

    // Recording consent where it was given is only half of V14. An endpoint that
    // activates regardless of the body makes the mechanism optional: post false
    // and come out approved with no consent_events row anywhere.
    const res = await request.post('/api/account/register', {
      headers: { 'Authorization': `Bearer ${refuseToken}` },
      data: { acceptedTerms: false, acceptedPrivacy: false },
    });
    expect(res.status()).toBe(400);

    const after = await getDoc(doc(firestoreDb, 'users', refuseUid));
    expect(after.data()?.status).toBe('pending');
    expect(after.data()?.termsVersionAccepted).toBeFalsy();
  });

  test('a suspended account cannot reinstate itself through registration', async ({ request }) => {
    const suspendedEmail = `suspended-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, suspendedEmail, TEST_PASSWORD);
    const suspendedUid = cred.user.uid;
    const suspendedToken = await cred.user.getIdToken();

    // Exactly what adminRevokeUser leaves behind.
    await adminSetDoc('users', suspendedUid, {
      firstName: 'Sus',
      lastName: 'Pended',
      email: suspendedEmail,
      tier: 'pilot',
      status: 'suspended',
      transformationsUsed: 0,
      transformationsLimit: 0,
      isAdmin: false,
      createdAt: new Date(),
      activatedAt: new Date(),
    });

    const res = await request.post('/api/account/register', {
      headers: { 'Authorization': `Bearer ${suspendedToken}` },
      data: { acceptedTerms: true, acceptedPrivacy: true },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.activated).toBe(false);
    expect(body.status).toBe('suspended');

    const still = await getDoc(doc(firestoreDb, 'users', suspendedUid));
    expect(still.data()?.status).toBe('suspended');
  });

  test('an account revoked before v2.4.2 cannot reinstate itself either', async ({ request }) => {
    const legacyEmail = `legacy-revoked-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, legacyEmail, TEST_PASSWORD);
    const legacyUid = cred.user.uid;
    const legacyToken = await cred.user.getIdToken();

    // The old adminRevokeUser wrote exactly this: back to 'pending' with the
    // quota zeroed, and no activatedAt — the field did not exist yet. By status
    // alone it is indistinguishable from a fresh signup.
    await adminSetDoc('users', legacyUid, {
      firstName: 'Legacy',
      lastName: 'Revoked',
      email: legacyEmail,
      tier: 'pilot',
      status: 'pending',
      transformationsUsed: 3,
      transformationsLimit: 0,
      isAdmin: false,
      createdAt: new Date(),
    });

    const res = await request.post('/api/account/register', {
      headers: { 'Authorization': `Bearer ${legacyToken}` },
      data: { acceptedTerms: true, acceptedPrivacy: true },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).activated).toBe(false);

    const still = await getDoc(doc(firestoreDb, 'users', legacyUid));
    expect(still.data()?.status).toBe('pending');
    expect(still.data()?.transformationsLimit).toBe(0);
  });

  test('the client cannot assert its own terms acceptance on create', async () => {
    const forgeEmail = `consent-forge-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, forgeEmail, TEST_PASSWORD);

    // V14: these two fields used to sit in the client-writable create allowlist,
    // so a browser could record a consent nothing stood behind.
    await expect(
      setDoc(doc(firestoreDb, 'users', cred.user.uid), {
        firstName: 'Con',
        lastName: 'Sent',
        email: forgeEmail,
        tier: 'pilot',
        status: 'pending',
        transformationsUsed: 0,
        transformationsLimit: 5,
        maxTeamMembers: 1,
        orgId: null,
        identityProvider: 'password',
        createdAt: new Date(),
        isAdmin: false,
        authMethod: 'password',
        s4TenantAccessAllowed: false,
        s4TenantAccessRequested: false,
        mfaEnabled: false,
        termsVersionAccepted: '2026-07-07',
        termsAcceptedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  test('should execute secure cascading deletion (GDPR Right to Erasure)', async ({ request }) => {
    // 1. Register a temporary user to delete
    const tempEmail = `temp-delete-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const tempCred = await createUserWithEmailAndPassword(firebaseAuth, tempEmail, TEST_PASSWORD);
    const tempUid = tempCred.user.uid;
    const tempToken = await tempCred.user.getIdToken();

    // 2. Seed some mock data in projects and examples for the temporary user via Admin SDK
    await adminSetDoc('projects', `proj-${tempUid}`, {
      name: 'Temp Project to Delete',
      status: 'uploaded',
      userId: tempUid,
      createdAt: new Date(),
    });

    await adminSetDoc('abap_examples', `example-${tempUid}`, {
      name: 'Temp Example to Delete',
      code: '" Mock Code',
      userId: tempUid,
      createdAt: new Date(),
    });

    await adminSetDoc('users', tempUid, {
      firstName: 'Temp',
      lastName: 'Delete',
      email: tempEmail,
      tier: 'pilot',
      status: 'pending',
      isAdmin: false,
      transformationsUsed: 0,
      transformationsLimit: 5,
      maxTeamMembers: 1,
      s4TenantAccessAllowed: false,
      s4TenantAccessRequested: false,
      mfaEnabled: false,
      createdAt: new Date(),
    });

    // 2b. Seed the collections that previously escaped the deletion cascade:
    //     an immutable run under the project, BYOK secret, and single-doc secrets.
    await adminSetDoc(`projects/proj-${tempUid}/runs`, `run-${tempUid}`, {
      runId: `run-${tempUid}`, userId: tempUid, analysis: '{"summary":"x"}', runHash: 'deadbeef',
    });
    await adminSetDoc(`user_secrets/${tempUid}/providers`, 'gemini', { encryptedKey: 'ciphertext', userId: tempUid });
    await adminSetDoc('s4_credentials', tempUid, { userId: tempUid, encrypted: 'x' });
    await adminSetDoc('mfa_secrets', tempUid, { userId: tempUid, secret: 'x' });
    await adminSetDoc('mfa_pending', tempUid, { userId: tempUid, secret: 'x' });

    // 3. Call secure deletion API
    const deleteResponse = await request.post('/api/account/delete', {
      headers: {
        'Authorization': `Bearer ${tempToken}`,
      },
    });
    expect(deleteResponse.status()).toBe(200);

    // 4. Verify all documents are purged from Firestore.
    //
    // Server-side, like the locked collections below. This used to sign in as
    // the administrator and read the documents as a client, which worked
    // because the rules let an administrator read any project. They do not any
    // more (Sonny, 16.09.2026: only the owner), and a deletion check has no
    // business needing a permission the product does not grant.
    expect(await adminDocExists('projects', `proj-${tempUid}`)).toBe(false);
    expect(await adminDocExists('abap_examples', `example-${tempUid}`)).toBe(false);
    expect(await adminDocExists('users', tempUid)).toBe(false);
    // The run subcollection under the (now-deleted) project must be gone too.
    expect(await adminDocExists(`projects/proj-${tempUid}/runs`, `run-${tempUid}`)).toBe(false);

    // Collections locked to `if false` in rules — verify server-side via the seed API.
    expect(await adminDocExists(`user_secrets/${tempUid}/providers`, 'gemini')).toBe(false);
    expect(await adminDocExists('s4_credentials', tempUid)).toBe(false);
    expect(await adminDocExists('mfa_secrets', tempUid)).toBe(false);
    expect(await adminDocExists('mfa_pending', tempUid)).toBe(false);
  });

  test('admin console delete-user runs the full GDPR erasure cascade (not just users)', async ({ request }) => {
    // 1. Temp user + a broad data seed, including the collections a naive admin-delete
    //    (users + registration_requests only) would have orphaned.
    const tempEmail = `temp-admindel-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const tempCred = await createUserWithEmailAndPassword(firebaseAuth, tempEmail, TEST_PASSWORD);
    const tempUid = tempCred.user.uid;

    await adminSetDoc('projects', `aproj-${tempUid}`, { name: 'Admin Del Project', status: 'uploaded', userId: tempUid, createdAt: new Date() });
    await adminSetDoc(`projects/aproj-${tempUid}/runs`, `arun-${tempUid}`, { runId: `arun-${tempUid}`, userId: tempUid, analysis: '{"summary":"x"}', runHash: 'deadbeef' });
    await adminSetDoc('abap_examples', `aex-${tempUid}`, { name: 'x', code: '" x', userId: tempUid, createdAt: new Date() });
    await adminSetDoc('users', tempUid, {
      firstName: 'Temp', lastName: 'AdminDel', email: tempEmail, tier: 'pilot', status: 'pending', isAdmin: false,
      transformationsUsed: 0, transformationsLimit: 5, maxTeamMembers: 1,
      s4TenantAccessAllowed: false, s4TenantAccessRequested: false, mfaEnabled: false, createdAt: new Date(),
    });
    await adminSetDoc(`user_secrets/${tempUid}/providers`, 'gemini', { encryptedKey: 'ciphertext', userId: tempUid });
    await adminSetDoc('s4_credentials', tempUid, { userId: tempUid, encrypted: 'x' });
    await adminSetDoc('mfa_secrets', tempUid, { userId: tempUid, secret: 'x' });
    await adminSetDoc('mfa_pending', tempUid, { userId: tempUid, secret: 'x' });
    await adminSetDoc('registration_requests', tempUid, { userId: tempUid, status: 'pending', email: tempEmail });
    await adminSetDoc('tenant_access_requests', tempUid, { userId: tempUid, status: 'pending' });

    // 2. Fresh admin token — satisfies the recent-auth step-up; the test admin has MFA disabled.
    const adminCred = await signInWithEmailAndPassword(firebaseAuth, ADMIN_USER_EMAIL, TEST_PASSWORD);
    const adminToken = await adminCred.user.getIdToken(true);

    // 3. Admin console delete
    const res = await request.post('/api/admin/console-action', {
      headers: { 'Authorization': `Bearer ${adminToken}` },
      data: { uid: tempUid, action: 'delete-user' },
    });
    expect(res.status()).toBe(200);

    // 4. The whole cascade must be purged — not only users + registration_requests.
    expect(await adminDocExists('projects', `aproj-${tempUid}`)).toBe(false);
    expect(await adminDocExists(`projects/aproj-${tempUid}/runs`, `arun-${tempUid}`)).toBe(false);
    expect(await adminDocExists('abap_examples', `aex-${tempUid}`)).toBe(false);
    expect(await adminDocExists('users', tempUid)).toBe(false);
    expect(await adminDocExists(`user_secrets/${tempUid}/providers`, 'gemini')).toBe(false);
    expect(await adminDocExists('s4_credentials', tempUid)).toBe(false);
    expect(await adminDocExists('mfa_secrets', tempUid)).toBe(false);
    expect(await adminDocExists('mfa_pending', tempUid)).toBe(false);
    expect(await adminDocExists('registration_requests', tempUid)).toBe(false);
    expect(await adminDocExists('tenant_access_requests', tempUid)).toBe(false);
  });

  test('F-03: DELETE /api/projects/{id} recursively purges the project AND its runs', async ({ request }) => {
    const email = `temp-projdel-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, TEST_PASSWORD);
    const uid = cred.user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'T', lastName: 'PD', email, tier: 'pilot', status: 'approved', isAdmin: false,
      transformationsUsed: 0, transformationsLimit: 5, maxTeamMembers: 1,
      s4TenantAccessAllowed: false, s4TenantAccessRequested: false, mfaEnabled: false, createdAt: new Date(),
    });
    const projectId = `pdproj-${uid}`;
    await adminSetDoc('projects', projectId, { name: 'PD', status: 'uploaded', userId: uid, createdAt: new Date() });
    await adminSetDoc(`projects/${projectId}/runs`, `pdrun-${uid}`, { runId: `pdrun-${uid}`, userId: uid, analysis: '{}', runHash: 'x' });

    const token = await cred.user.getIdToken(true);
    const res = await request.delete(`/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    // Parent AND the immutable runs subcollection must be gone (no orphaned run).
    expect(await adminDocExists('projects', projectId)).toBe(false);
    expect(await adminDocExists(`projects/${projectId}/runs`, `pdrun-${uid}`)).toBe(false);
  });

  /**
   * The same route, from an administrator who is not the owner.
   *
   * `decoded.admin === true` used to stand in for ownership, and the only other
   * gate is `assertMfaSatisfied`, which lets any token through for an account
   * whose profile does not say `mfaEnabled` — which is exactly the admin
   * account seeded in `beforeAll` above. So a plain ID token with the claim
   * erased somebody else's project and every signed run under it, with no
   * step-up, no mirror check of a withdrawn claim and no audit event (QA full
   * review of a19945ef01dc, 6a3eea208009). Deleting is now owner-only.
   */
  test('an administrator token cannot delete another account’s project', async ({ request }) => {
    const email = `temp-admindel-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, TEST_PASSWORD);
    const ownerUid = cred.user.uid;
    await adminSetDoc('users', ownerUid, {
      firstName: 'T', lastName: 'AD', email, tier: 'pilot', status: 'approved', isAdmin: false,
      transformationsUsed: 0, transformationsLimit: 5, maxTeamMembers: 1,
      s4TenantAccessAllowed: false, s4TenantAccessRequested: false, mfaEnabled: false, createdAt: new Date(),
    });
    const projectId = `adproj-${ownerUid}`;
    await adminSetDoc('projects', projectId, { name: 'AD', status: 'uploaded', userId: ownerUid, createdAt: new Date() });
    await adminSetDoc(`projects/${projectId}/runs`, `adrun-${ownerUid}`, { runId: `adrun-${ownerUid}`, userId: ownerUid, analysis: '{}', runHash: 'x' });
    const ownerToken = await cred.user.getIdToken(true);

    // The administrator seeded in beforeAll: `admin: true` on the token, no
    // second factor on the profile.
    const adminCred = await signInWithEmailAndPassword(firebaseAuth, ADMIN_USER_EMAIL, TEST_PASSWORD);
    const adminToken = await adminCred.user.getIdToken(true);
    const refused = await request.delete(`/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(refused.status()).toBe(403);
    // Nothing was destroyed on the way to the refusal — the project and the
    // immutable run under it both survive.
    expect(await adminDocExists('projects', projectId)).toBe(true);
    expect(await adminDocExists(`projects/${projectId}/runs`, `adrun-${ownerUid}`)).toBe(true);

    // And the route is not simply broken: the owner still deletes the same project.
    const allowed = await request.delete(`/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(allowed.status()).toBe(200);
    expect(await adminDocExists('projects', projectId)).toBe(false);
  });

  /**
   * The export route, from the same administrator.
   *
   * Deleting a stranger's project was taken away on 17.09.2026; reading one
   * through an export was the door beside it. `decodedToken.admin === true`
   * stood in for ownership here too, so an administrator who knew a project id
   * got back the ZIP — the ABAP, the evidence, the decision record — from a
   * plain ID token, with `assertMfaSatisfied` waving through an account whose
   * profile does not say `mfaEnabled` (QA full review of a19945ef01dc,
   * 3ad7de2e710c). `firestore.rules` had already taken the operator's read of a
   * foreign project away; this was the way round it.
   *
   * The refusal is checked before the run exists, so it is the ownership test
   * and not a later gate that produces it: a 403 here cannot be a 422 for a
   * missing active run.
   */
  test('an administrator token cannot export another account’s audit pack', async ({ request }) => {
    const email = `temp-adminpack-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, TEST_PASSWORD);
    const ownerUid = cred.user.uid;
    await adminSetDoc('users', ownerUid, {
      firstName: 'T', lastName: 'AP', email, tier: 'pilot', status: 'approved', isAdmin: false,
      transformationsUsed: 0, transformationsLimit: 5, maxTeamMembers: 1,
      s4TenantAccessAllowed: false, s4TenantAccessRequested: false, mfaEnabled: false, createdAt: new Date(),
    });
    const projectId = `appack-${ownerUid}`;
    await adminSetDoc('projects', projectId, { name: 'AP', status: 'uploaded', userId: ownerUid, createdAt: new Date() });

    const adminCred = await signInWithEmailAndPassword(firebaseAuth, ADMIN_USER_EMAIL, TEST_PASSWORD);
    const adminToken = await adminCred.user.getIdToken(true);
    const refused = await request.post('/api/audit-pack/create', {
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      data: { projectId },
    });
    expect(refused.status(), 'the administrator claim still stood in for ownership').toBe(403);
    expect((await refused.json()).error).toContain('Unauthorized');

    // And the route is not simply shut: the owner gets past the ownership gate
    // and is stopped further down, where a project with no analysis belongs.
    const ownerToken = await cred.user.getIdToken(true);
    const owner = await request.post('/api/audit-pack/create', {
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      data: { projectId },
    });
    expect(owner.status(), 'the owner was refused by the ownership gate too').toBe(422);
  });

  /**
   * S/4 access ends with the account, not with the flag.
   *
   * `adminRevokeUser` writes `status: 'suspended'`; it does not clear
   * `s4TenantAccessAllowed`. The four S/4 routes ask `assertS4TenantAccess`
   * and not `assertAccountActive`, and that gate read the profile and then
   * decided from the flag alone — so a suspended account went on sending
   * authenticated requests to the stored tenant, which is the only place in
   * this product where a request leaves for somebody else's production system
   * (QA full review of a19945ef01dc, 7bf8808c5773).
   */
  test('a suspended account with S/4 access granted is refused at the tenant gate', async ({ request }) => {
    const email = `temp-s4susp-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, TEST_PASSWORD);
    const uid = cred.user.uid;
    const profile = {
      firstName: 'T', lastName: 'S4', email, tier: 'pilot', isAdmin: false,
      transformationsUsed: 0, transformationsLimit: 5, maxTeamMembers: 1,
      s4TenantAccessAllowed: true, s4TenantAccessRequested: false, mfaEnabled: false, createdAt: new Date(),
    };

    // Approved and granted: the gate lets the request through to the route's
    // own validation, which is what proves the gate is the thing being measured.
    await adminSetDoc('users', uid, { ...profile, status: 'approved' });
    const token = await cred.user.getIdToken(true);
    const allowed = await request.post('/api/test-s4-connection', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {},
    });
    expect(allowed.status(), 'the granted account did not reach the route').toBe(400);

    // Suspended, nothing else changed.
    await adminMergeDoc('users', uid, { status: 'suspended' });
    const refused = await request.post('/api/test-s4-connection', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {},
    });
    expect(refused.status(), 'a suspended account still reached the live tenant endpoints').toBe(403);
    expect((await refused.json()).message).toContain('suspended');
  });

  /**
   * A withdrawal that the token revocation did not finish still holds outside
   * the admin routes.
   *
   * The mirror was read in `verifyAdminRequest` only, so `/api/admin/*` was
   * covered and the claim-based exemptions elsewhere were not: an
   * administrator whose claim had been withdrawn but whose refresh-token
   * revocation failed kept `admin: true` on the token he was holding, and
   * `assertS4TenantAccess` took it at face value — a way into the live tenant
   * endpoints for an account that had no S/4 grant of its own (QA full review
   * of a19945ef01dc, 79dc8a8a2d59). The mirror is now a deny gate on every
   * token that carries the claim.
   */
  test('a withdrawn admin claim no longer opens the S/4 gate', async ({ request }) => {
    const email = `temp-mirrors4-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, TEST_PASSWORD);
    const uid = cred.user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'T', lastName: 'MS', email, tier: 'pilot', status: 'approved', isAdmin: true,
      transformationsUsed: 0, transformationsLimit: 5, maxTeamMembers: 1,
      s4TenantAccessAllowed: false, s4TenantAccessRequested: false, mfaEnabled: false, createdAt: new Date(),
    });
    await adminSetCustomClaim(uid, { admin: true });
    const token = await cred.user.getIdToken(true);
    const headers = { Authorization: `Bearer ${token}` };

    // The claim alone opens the gate while the mirror agrees — the account has
    // no `s4TenantAccessAllowed` of its own, so this is the claim and nothing else.
    const before = await request.get('/api/s4-credentials', { headers });
    expect(before.status(), 'the admin claim did not open the S/4 gate').not.toBe(403);

    // The mirror is withdrawn. The token is untouched and still says `admin: true`.
    await adminMergeDoc('users', uid, { isAdmin: false });
    const after = await request.get('/api/s4-credentials', { headers });
    expect(after.status(), 'the withdrawn claim still opened the S/4 gate').toBe(403);
    expect((await after.json()).error).toContain('restricted');
  });

  test('F-02: a pending account is blocked at a business API (run-tests → 403)', async ({ request }) => {
    const email = `temp-pending-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, TEST_PASSWORD);
    const uid = cred.user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'T', lastName: 'PE', email, tier: 'pilot', status: 'pending', isAdmin: false,
      transformationsUsed: 0, transformationsLimit: 5, maxTeamMembers: 1,
      s4TenantAccessAllowed: false, s4TenantAccessRequested: false, mfaEnabled: false, createdAt: new Date(),
    });
    const token = await cred.user.getIdToken(true);
    // Account-state gate runs before the body is used, so a minimal payload is fine.
    const res = await request.post('/api/run-tests', {
      headers: { Authorization: `Bearer ${token}` },
      data: { tests: [], projectId: 'x', code: '', selectedTestIds: [] },
    });
    expect(res.status()).toBe(403);
  });

  // ── v1.20 §5/§8: server-authoritative audit pack (generated & signed server-side) ──

  async function seedRunnableProject(uid: string, suffix: string) {
    const projectId = `apk-${suffix}-${uid}`;
    const runId = `apkrun-${suffix}-${uid}`;
    // F-02: business APIs now require an approved account — seed an approved profile
    // so the account-state gate passes (the owner reaches the ownership/run checks).
    await adminSetDoc('users', uid, {
      firstName: 'APK', lastName: 'Owner', email: `apk-${uid}@cleancore-test.io`, tier: 'pilot',
      status: 'approved', isAdmin: false, transformationsUsed: 0, transformationsLimit: 5,
      maxTeamMembers: 1, s4TenantAccessAllowed: false, s4TenantAccessRequested: false,
      mfaEnabled: false, createdAt: new Date(),
    });
    await adminSetDoc('projects', projectId, {
      name: 'Audit Pack Test', status: 'analyzed', userId: uid, activeRunId: runId,
      extensibilityRoute: 'Side-by-Side (SAP BTP)', createdAt: new Date(),
      auditMetadata: {
        inputFingerprint: { sha256: 'abc', fileName: 'Z.abap', lineCount: 10, byteSize: 100, objectType: 'Report', uploadedAt: new Date().toISOString() },
        modelCard: { provider: 'google-gemini', model: 'gemini-3-flash-preview', engineVersion: 'v1.22.1', catalogVersion: '2024.FPS02', byokUsed: false, analysisTimestamp: new Date().toISOString() },
      },
    });
    // A real signature, not the placeholders this used to seed. The audit-pack
    // route now recomputes the hash and verifies the HMAC before it signs
    // anything on top, so `runHash: 'testrunhash'` would be refused — correctly.
    // Signing here with the same key the route resolves makes the test exercise
    // the guarantee instead of a fiction.
    const runPayload = {
      runId, projectId, userId: uid, status: 'completed',
      analyzerVersion: 'v1.22.1', rulesetVersion: 'rules-v1.0', sapApiCatalogVersion: '2024.FPS02',
      extensibilityRoute: 'Side-by-Side (SAP BTP)', cleanCoreScore: 88, complexityScore: 40, criticalityScore: 30,
      evidenceReport: [], dataCoupling: [], codeInventory: [], worklist: [],
      originalRecommendation: 'cap', recommendationConfidence: 80, recommendationJustification: 'x',
    };
    const runHash = computeRunHash(runPayload);
    const signingKey = process.env.AUDIT_SIGNING_KEY!;
    await adminSetDoc(`projects/${projectId}/runs`, runId, {
      ...runPayload,
      runHash,
      signature: signRunHash(runHash, signingKey),
    });
    return { projectId, runId, runHash };
  }

  test('a run edited after signing cannot be exported', async ({ request }) => {
    const email = `apk-tamper-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, TEST_PASSWORD);
    const uid = cred.user.uid;
    const token = await cred.user.getIdToken();
    const { projectId, runId } = await seedRunnableProject(uid, 'tamper');

    // The realistic edit: change the score in the run document and leave the
    // signature alone. The route used to check only that runHash was present, so
    // this produced a validly signed audit pack over the altered number.
    await adminMergeDoc(`projects/${projectId}/runs`, runId, { cleanCoreScore: 99 });

    const res = await request.post('/api/audit-pack/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toContain('no longer matches its own signature');
  });

  test('audit pack is generated and signed server-side for the owner', async ({ request }) => {
    const email = `apk-owner-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, TEST_PASSWORD);
    const uid = cred.user.uid;
    const token = await cred.user.getIdToken();
    const { projectId } = await seedRunnableProject(uid, 'ok');

    const res = await request.post('/api/audit-pack/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/zip');

    // The returned ZIP must carry a server-signed manifest whose file hashes match.
    const zip = await JSZip.loadAsync(await res.body());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.signed).toBe(true);
    expect(typeof manifest.signature).toBe('string');
    expect(manifest.signature.length).toBeGreaterThan(0);
    expect(manifest.files.length).toBeGreaterThan(0);
    // Re-hash a file from the ZIP and confirm it matches the manifest (integrity).
    const first = manifest.files[0];
    const content = await zip.file(first.path)!.async('string');
    const hex = createHash('sha256').update(content).digest('hex');
    expect(hex).toBe(first.sha256);
  });

  test('audit pack create rejects foreign user, missing run, and unauthenticated', async ({ request }) => {
    const ownerEmail = `apk-o2-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const owner = await createUserWithEmailAndPassword(firebaseAuth, ownerEmail, TEST_PASSWORD);
    const { projectId } = await seedRunnableProject(owner.user.uid, 'neg');

    // Foreign user → 403
    const otherEmail = `apk-x-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const other = await createUserWithEmailAndPassword(firebaseAuth, otherEmail, TEST_PASSWORD);
    const otherToken = await other.user.getIdToken();
    const foreign = await request.post('/api/audit-pack/create', {
      headers: { Authorization: `Bearer ${otherToken}` },
      data: { projectId },
    });
    expect(foreign.status()).toBe(403);

    // Owner but project has no active run → 422
    const ownerToken = await owner.user.getIdToken();
    const noRunProjectId = `apk-norun-${branchSuffix}-${owner.user.uid}`;
    await adminSetDoc('projects', noRunProjectId, { name: 'No Run', status: 'uploaded', userId: owner.user.uid, createdAt: new Date() });
    const noRun = await request.post('/api/audit-pack/create', {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: { projectId: noRunProjectId },
    });
    expect(noRun.status()).toBe(422);

    // Unauthenticated → 401
    const unauth = await request.post('/api/audit-pack/create', { data: { projectId } });
    expect(unauth.status()).toBe(401);
  });

  // ── v2.0 trust-chain: legacy /api/export/sign must no longer sign client-supplied hashes ──
  const SIGN_FILES = [{ path: '00-executive-summary.md', sha256: 'a'.repeat(64), bytes: 42 }];

  test('legacy /api/export/sign is disabled (410) and never signs client-supplied file hashes', async ({ request }) => {
    const email = `sign-owner-${branchSuffix}-${Date.now()}@cleancore-test.io`;
    const owner = await createUserWithEmailAndPassword(firebaseAuth, email, TEST_PASSWORD);
    const uid = owner.user.uid;
    const token = await owner.user.getIdToken();
    const { projectId, runId } = await seedRunnableProject(uid, 'sign');

    // Even the legitimate owner with the active run must NOT get a signature for
    // arbitrary, client-supplied file hashes. The endpoint is retired in favour
    // of the server-authoritative /api/audit-pack/create.
    const res = await request.post('/api/export/sign', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId, runId, files: SIGN_FILES },
    });
    expect(res.status()).toBe(410);
    const body = await res.json();
    expect(body.signature).toBeUndefined();
    expect(body.signed).toBeUndefined();
    expect(body.replacement).toBe('/api/audit-pack/create');

    // Unauthenticated callers get the same closed door (no oracle for probing).
    const unauth = await request.post('/api/export/sign', { data: { projectId, runId, files: SIGN_FILES } });
    expect(unauth.status()).toBe(410);
  });

  test('should restrict privilege escalation on profile creation (Hardened Rules)', async () => {
    // Register a malicious new user
    const maliciousEmail = `malicious-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, maliciousEmail, TEST_PASSWORD);
    const malUid = cred.user.uid;

    const malUserDoc = doc(firestoreDb, 'users', malUid);

    // Try to create profile with isAdmin: true
    await expect(
      setDoc(malUserDoc, {
        firstName: 'Malicious',
        lastName: 'User',
        email: maliciousEmail,
        isAdmin: true,
        createdAt: new Date(),
      })
    ).rejects.toThrow();

    // Try to create profile with tier: 'enterprise'
    await expect(
      setDoc(malUserDoc, {
        firstName: 'Malicious',
        lastName: 'User',
        email: maliciousEmail,
        tier: 'enterprise',
        createdAt: new Date(),
      })
    ).rejects.toThrow();

    // Try to create profile with transformationsLimit: 1000
    await expect(
      setDoc(malUserDoc, {
        firstName: 'Malicious',
        lastName: 'User',
        email: maliciousEmail,
        transformationsLimit: 1000,
        createdAt: new Date(),
      })
    ).rejects.toThrow();

    // Try to create profile with status: 'approved'
    await expect(
      setDoc(malUserDoc, {
        firstName: 'Malicious',
        lastName: 'User',
        email: maliciousEmail,
        status: 'approved',
        createdAt: new Date(),
      })
    ).rejects.toThrow();

    // Creating with safe defaults should succeed
    await expect(
      setDoc(malUserDoc, {
        firstName: 'Malicious',
        lastName: 'User',
        email: maliciousEmail,
        tier: 'pilot',
        status: 'pending',
        isAdmin: false,
        transformationsUsed: 0,
        transformationsLimit: 5,
        maxTeamMembers: 1,
        createdAt: new Date(),
      })
    ).resolves.not.toThrow();
  });

  test('should completely restrict client read/write to private collections', async () => {
    const cred = await signInWithEmailAndPassword(firebaseAuth, NORMAL_USER_EMAIL, TEST_PASSWORD);
    
    // Normal user attempting to access mfa_secrets/{uid} directly
    const mfaSecretDoc = doc(firestoreDb, 'mfa_secrets', cred.user.uid);
    await expect(setDoc(mfaSecretDoc, { secret: 'hijacked' })).rejects.toThrow();
    await expect(getDoc(mfaSecretDoc)).rejects.toThrow();

    // Normal user attempting to access s4_credentials/{uid} directly
    const s4CredentialsDoc = doc(firestoreDb, 's4_credentials', cred.user.uid);
    await expect(setDoc(s4CredentialsDoc, { secret: 'hijacked' })).rejects.toThrow();
    await expect(getDoc(s4CredentialsDoc)).rejects.toThrow();
  });

  test('should restrict orgId and maxTeamMembers manipulation on profile create/update', async () => {
    // 1. Try to create with an orgId
    const testEmail = `org-test-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, testEmail, TEST_PASSWORD);
    const testUid = cred.user.uid;
    const testUserDoc = doc(firestoreDb, 'users', testUid);

    await expect(
      setDoc(testUserDoc, {
        firstName: 'Org',
        lastName: 'Test',
        email: testEmail,
        orgId: 'some-malicious-org-id',
        createdAt: new Date(),
      })
    ).rejects.toThrow();

    // Create with safe defaults (should succeed)
    await setDoc(testUserDoc, {
      firstName: 'Org',
      lastName: 'Test',
      email: testEmail,
      tier: 'pilot',
      status: 'pending',
      isAdmin: false,
      transformationsUsed: 0,
      transformationsLimit: 5,
      maxTeamMembers: 1,
      orgId: null,
      createdAt: new Date(),
    });

    // 2. Try to update orgId
    await expect(
      setDoc(testUserDoc, { orgId: 'hacked-org-id' }, { merge: true })
    ).rejects.toThrow();

    // 3. Try to update maxTeamMembers
    await expect(
      setDoc(testUserDoc, { maxTeamMembers: 100 }, { merge: true })
    ).rejects.toThrow();
  });

  test('an account with a second factor is refused by the gated routes until the token carries the factor', async ({ request }) => {
    // Roadmap 0.13: the second factor is Firebase's own TOTP multi-factor, and
    // the proof is the ID token's `firebase.sign_in_second_factor`. The Auth
    // emulator cannot enrol a TOTP factor, so the positive path — a token that
    // names the factor — is exercised on the gate functions in
    // tests/mfa-native-gate.spec.ts. What the emulator can show is the
    // negative: a profile that requires the factor, a token that never saw
    // one, and the gated route saying so.
    const mfaEmail = `mfa-gate-test-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, mfaEmail, TEST_PASSWORD);
    const mfaUid = cred.user.uid;
    await adminSetDoc('users', mfaUid, {
      firstName: 'Mfa',
      lastName: 'Gate',
      email: mfaEmail,
      tier: 'pilot',
      status: 'approved',
      activatedAt: new Date(),
      isAdmin: false,
      transformationsUsed: 0,
      transformationsLimit: 5,
      maxTeamMembers: 1,
      s4TenantAccessAllowed: false,
      s4TenantAccessRequested: false,
      mfaEnabled: true,
      mfaFactor: 'totp',
      createdAt: new Date(),
    });
    const mfaCred = await signInWithEmailAndPassword(firebaseAuth, mfaEmail, TEST_PASSWORD);
    const mfaToken = await mfaCred.user.getIdToken();

    // The token was issued by the first factor alone.
    const blockedRes = await request.post('/api/gemini', {
      headers: { Authorization: `Bearer ${mfaToken}`, 'Content-Type': 'application/json' },
      data: { prompt: 'Hello' },
    });
    expect(blockedRes.status()).toBe(403);
    const blockedBody = await blockedRes.json();
    expect(blockedBody.error).toContain('Multi-factor authentication required');

    // The same account without the requirement passes the gate (and reaches
    // whatever the route does next — anything but the gate's 403).
    await adminMergeDoc('users', mfaUid, { mfaEnabled: false });
    const allowedRes = await request.post('/api/gemini', {
      headers: { Authorization: `Bearer ${mfaToken}`, 'Content-Type': 'application/json' },
      data: { prompt: 'Explain ABAP select statement in 10 words.' },
    });
    expect(allowedRes.status()).not.toBe(403);
  });

  test('BYOK Server-Only Secret Store Flow (F-01) E2E Test', async ({ request }) => {
    // 1. Sign in as the normal test user to get an auth token
    const userCred = await signInWithEmailAndPassword(firebaseAuth, NORMAL_USER_EMAIL, TEST_PASSWORD);
    const token = await userCred.user.getIdToken();

    // 2. Save the API Key securely (MFA is disabled by default, should pass)
    const dummyKey = 'AIzaSyDummyKeyForTestingBYOK1234';
    const saveRes = await request.post('/api/secrets/gemini', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { apiKey: dummyKey }
    });
    expect(saveRes.status()).toBe(200);
    const saveBody = await saveRes.json();
    expect(saveBody.ok).toBe(true);
    expect(saveBody.byokConfigured).toBe(true);
    expect(saveBody.byokLast4).toBe('1234');

    // 3. Enable MFA and verify that the BYOK endpoints are now blocked with 403
    await adminMergeDoc('users', userCred.user.uid, { mfaEnabled: true });

    const mfaBlockedSaveRes = await request.post('/api/secrets/gemini', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { apiKey: dummyKey }
    });
    expect(mfaBlockedSaveRes.status()).toBe(403);

    const mfaBlockedDeleteRes = await request.delete('/api/secrets/gemini', {
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    });
    expect(mfaBlockedDeleteRes.status()).toBe(403);

    // Disable MFA again to complete the rest of the test
    await adminMergeDoc('users', userCred.user.uid, { mfaEnabled: false });

    // 4. Test that direct client-side Firestore access to user_secrets is blocked by rules
    let directReadFailed = false;
    try {
      const docRef = doc(firestoreDb, 'user_secrets', userCred.user.uid, 'providers', 'gemini');
      await getDoc(docRef);
    } catch (e: any) {
      directReadFailed = true;
    }
    expect(directReadFailed).toBe(true);

    // 5. Test Key connection testing endpoint (expect 400 since it is a dummy key, but it proves the endpoint decrypted and used the key)
    const testRes = await request.post('/api/secrets/gemini/test', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {} // tests the saved key
    });
    expect(testRes.status()).toBe(400); // Invalid key error expected
    const testBody = await testRes.json();
    expect(testBody.error).toBeDefined();

    // 6. Delete the key securely
    const deleteRes = await request.delete('/api/secrets/gemini', {
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    });
    expect(deleteRes.status()).toBe(200);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.ok).toBe(true);

    // 7. Verify profile metadata is updated
    const userDocRef = doc(firestoreDb, 'users', userCred.user.uid);
    const userSnap = await getDoc(userDocRef);
    const userData = userSnap.data();
    expect(userData?.byokConfigured).toBeUndefined();
    expect(userData?.byokLast4).toBeUndefined();
    expect(userData?.geminiApiKey).toBeUndefined();
  });
});
