import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, connectFirestoreEmulator } from 'firebase/firestore';
import { createHmac } from 'crypto';
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

// Accounts for testing
const NORMAL_USER_EMAIL = `security-user-${branchSuffix}@cleancore-test.io`;
const ADMIN_USER_EMAIL = `sonny.frenzel@gmail.com`; // Hardcoded admin email in constants
const TEST_PASSWORD = 'SecurityPassword123!';

test.describe('Clean-Core.io Security, Compliance & Onboarding Gates E2E Tests', () => {
  let normalUserUid = '';
  let adminUid = '';

  test.beforeAll(async () => {
    // 1. Register a normal test user
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, NORMAL_USER_EMAIL, TEST_PASSWORD);
      normalUserUid = cred.user.uid;
      console.log(`Registered test normal user with UID: ${normalUserUid}`);
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(firebaseAuth, NORMAL_USER_EMAIL, TEST_PASSWORD);
        normalUserUid = cred.user.uid;
      } else {
        throw e;
      }
    }

    // Set normal user profile in Firestore (not approved for S/4 tenant access)
    await setDoc(doc(firestoreDb, 'users', normalUserUid), {
      firstName: 'Normal',
      lastName: 'Security User',
      email: NORMAL_USER_EMAIL,
      tier: 'pilot',
      status: 'pending',
      s4TenantAccessAllowed: false,
      s4TenantAccessRequested: true,
      createdAt: new Date(),
    });

    // 2. Register an admin user
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, ADMIN_USER_EMAIL, TEST_PASSWORD);
      adminUid = cred.user.uid;
      console.log(`Registered test admin user with UID: ${adminUid}`);
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(firebaseAuth, ADMIN_USER_EMAIL, TEST_PASSWORD);
        adminUid = cred.user.uid;
      } else {
        throw e;
      }
    }

    // Set admin profile in Firestore
    await setDoc(doc(firestoreDb, 'users', adminUid), {
      firstName: 'Sonny',
      lastName: 'Frenzel',
      email: ADMIN_USER_EMAIL,
      isAdmin: true,
      createdAt: new Date(),
    });
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

    // Generate valid HMAC token
    const secret = process.env.PILOT_APPROVAL_SECRET || 'fallback-secret-key-12345';
    const validToken = createHmac('sha256', secret).update(normalUserUid).digest('hex');

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

    // 2. Seed some mock data in projects and examples for the temporary user
    const mockProjDoc = doc(firestoreDb, 'projects', `proj-${tempUid}`);
    await setDoc(mockProjDoc, {
      name: 'Temp Project to Delete',
      status: 'uploaded',
      userId: tempUid,
      createdAt: new Date(),
    });

    const mockExampleDoc = doc(firestoreDb, 'abap_examples', `example-${tempUid}`);
    await setDoc(mockExampleDoc, {
      name: 'Temp Example to Delete',
      code: '" Mock Code',
      userId: tempUid,
      createdAt: new Date(),
    });

    const tempUserDoc = doc(firestoreDb, 'users', tempUid);
    await setDoc(tempUserDoc, {
      firstName: 'Temp',
      lastName: 'Delete',
      email: tempEmail,
      createdAt: new Date(),
    });

    // 3. Call secure deletion API
    const deleteResponse = await request.post('/api/account/delete', {
      headers: {
        'Authorization': `Bearer ${tempToken}`,
      },
    });
    expect(deleteResponse.status()).toBe(200);

    // 4. Verify all documents are purged from Firestore
    const projSnap = await getDoc(mockProjDoc);
    expect(projSnap.exists()).toBe(false);

    const exampleSnap = await getDoc(mockExampleDoc);
    expect(exampleSnap.exists()).toBe(false);

    const userSnap = await getDoc(tempUserDoc);
    expect(userSnap.exists()).toBe(false);
  });
});
