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
import { generateTOTP } from '../lib/totp';
import firebaseConfig from '../firebase-applet-config.json';

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

  test('should reject user approval attempts if admin token is missing or invalid', async ({ request }) => {
    // 1. Call without auth header
    const noAuthResponse = await request.post('/api/admin/approve-user', {
      data: {
        uid: normalUserUid,
        token: 'invalid-token',
        action: 'approve',
      },
    });
    expect(noAuthResponse.status()).toBe(403); // Admin required

    // 2. Call with normal user token
    const normalUserCred = await signInWithEmailAndPassword(firebaseAuth, NORMAL_USER_EMAIL, TEST_PASSWORD);
    const normalUserToken = await normalUserCred.user.getIdToken();
    const badAuthResponse = await request.post('/api/admin/approve-user', {
      headers: {
        'Authorization': `Bearer ${normalUserToken}`,
      },
      data: {
        uid: normalUserUid,
        token: 'some-token',
        action: 'approve',
      },
    });
    expect(badAuthResponse.status()).toBe(403); // Admin required
  });

  test('should cryptographically verify HMAC tokens during admin approvals', async ({ request }) => {
    // Sign in as Admin
    const adminCred = await signInWithEmailAndPassword(firebaseAuth, ADMIN_USER_EMAIL, TEST_PASSWORD);
    const adminToken = await adminCred.user.getIdToken();

    // 1. Approve with invalid token
    const invalidTokenRes = await request.post('/api/admin/approve-user', {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
      },
      data: {
        uid: normalUserUid,
        token: 'incorrect-hmac-token-12345',
        action: 'approve',
      },
    });
    expect(invalidTokenRes.status()).toBe(500); // Invalid verification token error
    const errBody = await invalidTokenRes.json();
    expect(errBody.error).toContain('Invalid verification token');

    // Generate valid approval token (Audit P2: action-bound, expiring)
    const validToken = createApprovalToken(normalUserUid, 'pilot', 'approve');

    // 2. Approve with valid token
    const validTokenRes = await request.post('/api/admin/approve-user', {
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
    expect(userDoc.data()?.status).toBe('approved');
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

    // 4. Verify all documents are purged from Firestore
    // Sign in as Admin to verify (since normal users get PERMISSION_DENIED on non-existent documents)
    await signInWithEmailAndPassword(firebaseAuth, ADMIN_USER_EMAIL, TEST_PASSWORD);

    const projSnap = await getDoc(doc(firestoreDb, 'projects', `proj-${tempUid}`));
    expect(projSnap.exists()).toBe(false);

    const exampleSnap = await getDoc(doc(firestoreDb, 'abap_examples', `example-${tempUid}`));
    expect(exampleSnap.exists()).toBe(false);

    const userSnap = await getDoc(doc(firestoreDb, 'users', tempUid));
    expect(userSnap.exists()).toBe(false);

    // The run subcollection under the (now-deleted) project must be gone too.
    const runSnap = await getDoc(doc(firestoreDb, 'projects', `proj-${tempUid}`, 'runs', `run-${tempUid}`));
    expect(runSnap.exists()).toBe(false);

    // Collections locked to `if false` in rules — verify server-side via the seed API.
    expect(await adminDocExists(`user_secrets/${tempUid}/providers`, 'gemini')).toBe(false);
    expect(await adminDocExists('s4_credentials', tempUid)).toBe(false);
    expect(await adminDocExists('mfa_secrets', tempUid)).toBe(false);
    expect(await adminDocExists('mfa_pending', tempUid)).toBe(false);
  });

  // ── v1.20 §5/§8: server-authoritative audit pack (generated & signed server-side) ──

  async function seedRunnableProject(uid: string, suffix: string) {
    const projectId = `apk-${suffix}-${uid}`;
    const runId = `apkrun-${suffix}-${uid}`;
    await adminSetDoc('projects', projectId, {
      name: 'Audit Pack Test', status: 'analyzed', userId: uid, activeRunId: runId,
      extensibilityRoute: 'Side-by-Side (SAP BTP)', createdAt: new Date(),
      auditMetadata: {
        inputFingerprint: { sha256: 'abc', fileName: 'Z.abap', lineCount: 10, byteSize: 100, objectType: 'Report', uploadedAt: new Date().toISOString() },
        modelCard: { provider: 'google-gemini', model: 'gemini-3-flash-preview', engineVersion: 'v1.22.1', catalogVersion: '2024.FPS02', byokUsed: false, analysisTimestamp: new Date().toISOString() },
      },
    });
    await adminSetDoc(`projects/${projectId}/runs`, runId, {
      runId, projectId, userId: uid, status: 'completed', runHash: 'testrunhash', signature: 'sig',
      analyzerVersion: 'v1.22.1', rulesetVersion: 'rules-v1.0', sapApiCatalogVersion: '2024.FPS02',
      extensibilityRoute: 'Side-by-Side (SAP BTP)', cleanCoreScore: 88, complexityScore: 40, criticalityScore: 30,
      evidenceReport: [], dataCoupling: [], codeInventory: [], worklist: [],
      originalRecommendation: 'cap', recommendationConfidence: 80, recommendationJustification: 'x',
    });
    return { projectId, runId };
  }

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

  test('should successfully complete the server-side MFA lifecycle (setup, verify, disable)', async ({ request }) => {
    // 1. Get auth token
    const cred = await signInWithEmailAndPassword(firebaseAuth, NORMAL_USER_EMAIL, TEST_PASSWORD);
    const token = await cred.user.getIdToken();

    // 2. Start setup
    const startRes = await request.post('/api/mfa/setup/start', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(startRes.status()).toBe(200);
    const { secret, qrCodeUrl } = await startRes.json();
    expect(secret).toBeDefined();
    expect(qrCodeUrl).toContain(encodeURIComponent(NORMAL_USER_EMAIL));

    // 3. Verify setup
    const currentCode = await generateTOTP(secret);
    const verifySetupRes = await request.post('/api/mfa/setup/verify', {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { secret, code: currentCode }
    });
    expect(verifySetupRes.status()).toBe(200);
    const { backupCodes } = await verifySetupRes.json();
    expect(backupCodes).toHaveLength(5);

    // 4. Verify login flow MFA token verification
    const loginTotpCode = await generateTOTP(secret);
    const loginVerifyRes = await request.post('/api/mfa/verify', {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { code: loginTotpCode }
    });
    expect(loginVerifyRes.status()).toBe(200);

    // 5. Verify using a backup code
    const testBackupCode = backupCodes[0];
    const backupVerifyRes = await request.post('/api/mfa/verify', {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { code: testBackupCode }
    });
    expect(backupVerifyRes.status()).toBe(200);

    // Re-verifying with the same backup code must fail (consumed)
    const backupVerifyRes2 = await request.post('/api/mfa/verify', {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { code: testBackupCode }
    });
    expect(backupVerifyRes2.status()).toBe(400);

    // 6. Disable MFA
    // Extract the cookie from backup verify response
    const setCookieHeader = backupVerifyRes.headers()['set-cookie'] || '';
    const match = setCookieHeader.match(/mfa_session=([^;]+)/);
    const cookieVal = match ? match[1] : '';

    // Force refresh token to get a fresh auth_time
    const freshToken = await cred.user.getIdToken(true);
    const disableRes = await request.post('/api/mfa/disable', {
      headers: {
        'Authorization': `Bearer ${freshToken}`,
        'Cookie': `mfa_session=${cookieVal}`
      }
    });
    expect(disableRes.status()).toBe(200);

    // Check user profile has mfaEnabled = false
    const userDoc = await getDoc(doc(firestoreDb, 'users', cred.user.uid));
    expect(userDoc.data()?.mfaEnabled).toBe(false);
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

  test('should enforce MFA session cookie gate on protected routes', async ({ request }) => {
    // 1. Register a temporary user
    const mfaEmail = `mfa-gate-test-${Date.now()}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, mfaEmail, TEST_PASSWORD);
    const mfaUid = cred.user.uid;

    // Create profile via Admin SDK (bypasses security rules)
    await adminSetDoc('users', mfaUid, {
      firstName: 'Mfa',
      lastName: 'Gate',
      email: mfaEmail,
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

    // Approve the user using the Admin API
    const adminCred = await signInWithEmailAndPassword(firebaseAuth, ADMIN_USER_EMAIL, TEST_PASSWORD);
    const adminToken = await adminCred.user.getIdToken();
    const validToken = createApprovalToken(mfaUid, 'pilot', 'approve');
    const approveRes = await request.post('/api/admin/approve-user', {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
      },
      data: {
        uid: mfaUid,
        token: validToken,
        action: 'approve',
      },
    });
    expect(approveRes.status()).toBe(200);

    // Sign back in as the MFA user to get a fresh token with approved status
    const mfaCred = await signInWithEmailAndPassword(firebaseAuth, mfaEmail, TEST_PASSWORD);
    const mfaToken = await mfaCred.user.getIdToken();

    // 2. Set up MFA for this user
    const startRes = await request.post('/api/mfa/setup/start', {
      headers: { 'Authorization': `Bearer ${mfaToken}` }
    });
    const { secret } = await startRes.json();
    const currentCode = await generateTOTP(secret);

    // Complete setup (enables MFA and sets cookie)
    const verifySetupRes = await request.post('/api/mfa/setup/verify', {
      headers: { 'Authorization': `Bearer ${mfaToken}`, 'Content-Type': 'application/json' },
      data: { code: currentCode }
    });
    expect(verifySetupRes.status()).toBe(200);

    // Extract the mfa_session cookie from the verify setup headers
    const setCookieHeader = verifySetupRes.headers()['set-cookie'] || '';
    expect(setCookieHeader).toContain('mfa_session');

    // 3. Access /api/gemini with token but NO cookie (should fail with 403)
    const blockedRes = await request.post('/api/gemini', {
      headers: {
        'Authorization': `Bearer ${mfaToken}`,
        'Content-Type': 'application/json',
        'Cookie': '' // explicit empty cookies
      },
      data: { prompt: 'Hello' }
    });
    expect(blockedRes.status()).toBe(403);
    const blockedBody = await blockedRes.json();
    expect(blockedBody.error).toContain('MFA verification required');

    // 4. Access /api/gemini WITH cookie (should pass)
    const match = setCookieHeader.match(/mfa_session=([^;]+)/);
    const cookieVal = match ? match[1] : '';

    const allowedRes = await request.post('/api/gemini', {
      headers: {
        'Authorization': `Bearer ${mfaToken}`,
        'Content-Type': 'application/json',
        'Cookie': `mfa_session=${cookieVal}`
      },
      data: { prompt: 'Explain ABAP select statement in 10 words.' }
    });
    // It should either return 200 (success) or 502/500 if Gemini API is offline, but NOT 403 (MFA blocked)!
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
