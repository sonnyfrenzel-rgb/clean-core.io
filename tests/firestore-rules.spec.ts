import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, doc, setDoc, getDoc, connectFirestoreEmulator } from 'firebase/firestore';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK in Node context for seeding and validation
const firebaseApp = initializeApp(firebaseConfig);
const firestoreDb = initializeFirestore(firebaseApp, {}, firebaseConfig.firestoreDatabaseId);
const firebaseAuth = getAuth(firebaseApp);

if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  console.log('[TEST SDK] Connecting firestore rules test runner to emulators...');
  connectFirestoreEmulator(firestoreDb, '127.0.0.1', 8080);
  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

const branchSuffix = (process.env.GITHUB_REF_NAME || 'local').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

// Unique usernames per run
const OWNER_EMAIL = `owner-user-${branchSuffix}-${Date.now()}@cleancore-test.io`;
const ATTACKER_EMAIL = `attacker-user-${branchSuffix}-${Date.now()}@cleancore-test.io`;
const TEST_PASSWORD = 'SecurityPassword123!';

test.describe('Firestore Security Rules: AnalysisRuns subcollection validation', () => {
  let ownerUid = '';
  let attackerUid = '';
  const projectId = `test-project-${Date.now()}`;
  const runId = `test-run-${Date.now()}`;

  test.beforeAll(async () => {
    // 1. Create owner account
    const ownerCred = await createUserWithEmailAndPassword(firebaseAuth, OWNER_EMAIL, TEST_PASSWORD);
    ownerUid = ownerCred.user.uid;
    await adminSetDoc('users', ownerUid, {
      firstName: 'Owner',
      lastName: 'User',
      email: OWNER_EMAIL,
      tier: 'pilot',
      status: 'approved',
    });

    // Seed the owner's project using Admin SDK (bypasses rules)
    await adminSetDoc('projects', projectId, {
      name: 'Owner Project',
      userId: ownerUid,
      createdAt: new Date(),
      status: 'created',
    });

    // Seed a run under the owner's project using Admin SDK
    await adminSetDoc(`projects/${projectId}/runs`, runId, {
      runId,
      projectId,
      userId: ownerUid,
      createdAt: new Date().toISOString(),
      status: 'completed',
      cleanCoreScore: 85,
      extensibilityRoute: 'Side-by-Side (SAP BTP)',
    });

    // 2. Create attacker account
    const attackerCred = await createUserWithEmailAndPassword(firebaseAuth, ATTACKER_EMAIL, TEST_PASSWORD);
    attackerUid = attackerCred.user.uid;
    await adminSetDoc('users', attackerUid, {
      firstName: 'Attacker',
      lastName: 'User',
      email: ATTACKER_EMAIL,
      tier: 'pilot',
      status: 'approved',
    });
  });

  test('owner should be allowed to read their own runs, but blocked from writing directly', async () => {
    // Sign in as owner
    await signInWithEmailAndPassword(firebaseAuth, OWNER_EMAIL, TEST_PASSWORD);

    // 1. Read run (should succeed)
    const runDocRef = doc(firestoreDb, 'projects', projectId, 'runs', runId);
    const snap = await getDoc(runDocRef);
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.cleanCoreScore).toBe(85);

    // 2. Direct write/overwrite run (should fail)
    let writeFailed = false;
    try {
      await setDoc(runDocRef, {
        cleanCoreScore: 100, // Attempt to falsify analysis score
      }, { merge: true });
    } catch (e: any) {
      writeFailed = true;
    }
    expect(writeFailed).toBe(true);
  });

  test('attacker should be blocked from reading other users runs', async () => {
    // Sign in as attacker
    await signInWithEmailAndPassword(firebaseAuth, ATTACKER_EMAIL, TEST_PASSWORD);

    // Read other user's run (should fail)
    const runDocRef = doc(firestoreDb, 'projects', projectId, 'runs', runId);
    let readFailed = false;
    try {
      await getDoc(runDocRef);
    } catch (e: any) {
      readFailed = true;
    }
    expect(readFailed).toBe(true);
  });

  test('unauthenticated request should be blocked from reading any runs', async () => {
    // Sign out
    await firebaseAuth.signOut();

    // Read run (should fail)
    const runDocRef = doc(firestoreDb, 'projects', projectId, 'runs', runId);
    let readFailed = false;
    try {
      await getDoc(runDocRef);
    } catch (e: any) {
      readFailed = true;
    }
    expect(readFailed).toBe(true);
  });

  test('owner should be blocked from updating analysis result fields directly on the project document', async () => {
    // Sign in as owner
    await signInWithEmailAndPassword(firebaseAuth, OWNER_EMAIL, TEST_PASSWORD);

    const projectDocRef = doc(firestoreDb, 'projects', projectId);
    
    // 1. Attempt to update analysis (should fail)
    let updateAnalysisFailed = false;
    try {
      await setDoc(projectDocRef, {
        analysis: 'falsified analysis narrative data',
      }, { merge: true });
    } catch (e: any) {
      updateAnalysisFailed = true;
    }
    expect(updateAnalysisFailed).toBe(true);

    // 2. Attempt to update activeRunId (should fail)
    let updateActiveRunIdFailed = false;
    try {
      await setDoc(projectDocRef, {
        activeRunId: 'some-fake-run-id',
      }, { merge: true });
    } catch (e: any) {
      updateActiveRunIdFailed = true;
    }
    expect(updateActiveRunIdFailed).toBe(true);

    // 3. Attempt to update cleanCoreScore (should fail)
    let updateCleanCoreScoreFailed = false;
    try {
      await setDoc(projectDocRef, {
        cleanCoreScore: 99,
      }, { merge: true });
    } catch (e: any) {
      updateCleanCoreScoreFailed = true;
    }
    expect(updateCleanCoreScoreFailed).toBe(true);

    // 4. Attempt to update auditMetadata (should fail)
    let updateAuditMetadataFailed = false;
    try {
      await setDoc(projectDocRef, {
        auditMetadata: { tampered: true },
      }, { merge: true });
    } catch (e: any) {
      updateAuditMetadataFailed = true;
    }
    expect(updateAuditMetadataFailed).toBe(true);

    // 5. Attempt to update charged flag (should fail)
    let updateChargedFailed = false;
    try {
      await setDoc(projectDocRef, {
        charged: false,
      }, { merge: true });
    } catch (e: any) {
      updateChargedFailed = true;
    }
    expect(updateChargedFailed).toBe(true);

    // 6. Attempt to update solutionDesign (should succeed - allowlisted draft field)
    let updateSolutionDesignFailed = false;
    try {
      await setDoc(projectDocRef, {
        solutionDesign: 'new draft solution architecture design',
      }, { merge: true });
    } catch (e: any) {
      updateSolutionDesignFailed = true;
    }
    expect(updateSolutionDesignFailed).toBe(false);
  });

  test('project creation rules should restrict un-allowlisted fields', async () => {
    // Sign in as owner
    await signInWithEmailAndPassword(firebaseAuth, OWNER_EMAIL, TEST_PASSWORD);

    const newProjectId = `new-test-project-${Date.now()}`;
    const newProjectRef = doc(firestoreDb, 'projects', newProjectId);

    // 1. Create with forbidden field 'analysis' (should fail)
    let createWithAnalysisFailed = false;
    try {
      await setDoc(newProjectRef, {
        name: 'New Project',
        status: 'uploaded',
        userId: ownerUid,
        createdAt: new Date(),
        analysis: 'fake analysis injected at creation time',
      });
    } catch (e: any) {
      createWithAnalysisFailed = true;
    }
    expect(createWithAnalysisFailed).toBe(true);

    // 2. Create with allowed fields only (should succeed)
    let createAllowedSucceeded = true;
    try {
      await setDoc(newProjectRef, {
        name: 'New Project Succeeded',
        status: 'uploaded',
        userId: ownerUid,
        createdAt: new Date(),
        legacyCode: 'REPORT ztest.',
      });
    } catch (e: any) {
      createAllowedSucceeded = false;
    }
    expect(createAllowedSucceeded).toBe(true);
  });
});
