import { test, expect, type Page } from './helpers/test';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { adminSetDoc, adminApproveUser, adminSetCustomClaim } from './helpers/admin-seed';
import { GEMINI_TEST_REAL_MODEL_HEADER } from '../lib/gemini-test-stub';
import { DESIGN_GENERATION_CEILING_MS } from '../lib/model-stages';

// Set test secret first so that imports initializing getSecret don't throw
process.env.PILOT_APPROVAL_SECRET = process.env.PILOT_APPROVAL_SECRET || 'test-approval-secret-key-12345';

import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator, disposableEmail, EMULATOR_PASSWORD } from './helpers/emulator-guard';

// Initialize Firebase SDK in Node context to register and approve the test user
const firebaseApp = initializeApp(firebaseConfig);
const firestoreDb = initializeFirestore(firebaseApp, {}, firebaseConfig.firestoreDatabaseId);
const firebaseAuth = getAuth(firebaseApp);

// Fail closed: throws unless the run targets the emulators (tests/helpers/emulator-guard.ts).
connectFirestoreToEmulator(firestoreDb);
connectAuthToEmulator(firebaseAuth);

const branchSuffix = (process.env.GITHUB_REF_NAME || 'local').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
const TEST_EMAIL = `superduper-e2e-${branchSuffix}@cleancore-test.io`;
// A disposable emulator account, new per run: admin rights come from the seeded
// claim and profile below, not from the address.
const ADMIN_USER_EMAIL = disposableEmail('pipeline-admin');
const TEST_PASSWORD = 'SuperPassword123!';
const ADMIN_PASSWORD = EMULATOR_PASSWORD;

/**
 * The way from one stage to the next: the tool's link in the bar under the
 * stage header (ADR-060), and then the stage's own address. Waiting on the URL,
 * not on a stage title: the page being left has one too, and a selector wait
 * would resolve against it.
 */
async function openTool(page: Page, key: string): Promise<void> {
  await page.locator(`[data-stage-tools="open"] a[data-workspace-tool="${key}"]`).click({ timeout: 45000 });
  await page.waitForURL(new RegExp(`/project/[^/]+/${key}(\\?|$)`), { timeout: 45000 });
}

test.describe('Clean-Core.io End-to-End Pipeline & Safe Examples Verification', () => {
  
  // The account the walk signs in as, for the project it seeds (stage 0.5).
  let ownerUid = '';

  test.beforeAll(async ({ request }) => {
    console.log('Initializing test user registration...');
    let uid = '';
    try {
      // 1. Create a test user programmatically
      const userCred = await createUserWithEmailAndPassword(firebaseAuth, TEST_EMAIL, TEST_PASSWORD);
      uid = userCred.user.uid;
      console.log(`Registered new test user with UID: ${uid}`);
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        const userCred = await signInWithEmailAndPassword(firebaseAuth, TEST_EMAIL, TEST_PASSWORD);
        uid = userCred.user.uid;
        console.log(`Test user already exists. Signed in with UID: ${uid}`);
      } else {
        throw error;
      }
    }

    // 2. Create user profile via Admin SDK (bypasses security rules)
    const userDocRef = doc(firestoreDb, 'users', uid);
    const docSnap = await getDoc(userDocRef).catch(() => null);
    if (!docSnap || !docSnap.exists()) {
      await adminSetDoc('users', uid, {
        firstName: 'Super',
        lastName: 'Duper E2E',
        email: TEST_EMAIL,
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
      console.log('Created new E2E test user profile with free/pending defaults.');
    }

    // 3. Register a fresh admin account for this run
    const adminUid = (await createUserWithEmailAndPassword(firebaseAuth, ADMIN_USER_EMAIL, ADMIN_PASSWORD)).user.uid;
    // Seed admin profile via Admin SDK (bypasses security rules).
    // The client SDK would reject isAdmin:true on profile creation (L100 in firestore.rules).
    await adminSetDoc('users', adminUid, {
      firstName: 'Admin', lastName: 'E2E', email: ADMIN_USER_EMAIL,
      isAdmin: true, createdAt: new Date(),
    });
    // Set admin custom claim so Firestore rules (token-only check) recognise this user
    await adminSetCustomClaim(adminUid, { admin: true });

    // 4. Activate the user directly via Admin SDK. Registration activates an
    // account by itself now; seeding it keeps this test about the pipeline, and
    // the seed helper also raises the quota so CI retries do not run it out.
    await adminApproveUser(uid);
    ownerUid = uid;
    console.log('Admin approved test user via Admin SDK.');

    // 3. Delete all projects and examples belonging to the test user to prevent query congestion
    try {
      const projectsQuery = query(collection(firestoreDb, 'projects'), where('userId', '==', uid));
      const projectsSnapshot = await getDocs(projectsQuery);
      console.log(`Cleaning up ${projectsSnapshot.docs.length} legacy test projects...`);
      for (const docSnap of projectsSnapshot.docs) {
        // F-03: client project deletes are disabled (server-only recursiveDelete via
        // /api/projects/{id}). Best-effort cleanup — ignore the expected denial.
        try { await deleteDoc(doc(firestoreDb, 'projects', docSnap.id)); } catch { /* server-managed */ }
      }
      
      const examplesQuery = query(collection(firestoreDb, 'abap_examples'), where('userId', '==', uid));
      const examplesSnapshot = await getDocs(examplesQuery);
      console.log(`Cleaning up ${examplesSnapshot.docs.length} legacy test examples...`);
      for (const docSnap of examplesSnapshot.docs) {
        await deleteDoc(doc(firestoreDb, 'abap_examples', docSnap.id));
      }
    } catch (cleanErr) {
      console.error('Error during E2E test database cleanup:', cleanErr);
    }
  });

  test('should walk through all seven phases using a safe example', async ({ page }) => {
    // Live calls: analyze, design + its NFR proposals (two calls, one write, up to
    // the product's own ceiling), documentation, testing. The budget follows the ceiling.
    test.setTimeout(480 * 1000);

    // Redirect browser console logs to terminal for CI debugging (unbuffered)
    page.on('console', msg => process.stdout.write(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}\n`));
    page.on('pageerror', err => process.stdout.write(`[BROWSER ERROR] ${err.name}: ${err.message}\n${err.stack}\n`));

    // The one walk that uses the real model (tests/gemini-real-model-guard.spec.ts):
    // the test server answers `/api/gemini` with the stub by default, and this
    // spec asserts what only a real design answer produces — the blueprint's
    // `/project-root` — and the transformation built on it. Every model call of
    // this page opts out of the stub with the test secret.
    const realModelSecret = process.env.PILOT_APPROVAL_SECRET ?? '';
    expect(realModelSecret, 'the real-model opt-in needs PILOT_APPROVAL_SECRET').not.toBe('');
    await page.route('**/api/gemini', (route) =>
      route.continue({ headers: { ...route.request().headers(), [GEMINI_TEST_REAL_MODEL_HEADER]: realModelSecret } }),
    );

    // --- STAGE 0: LOGIN ---
    console.log('Navigating to homepage and signing in...');
    await page.goto('/');
    // The landing title is "SAP Clean Core Accelerator · ABAP Analysis & Re-design" since 3.5.2 (owner, 25.11.2026): the brand
    // suffix would take it past the 60 characters the snippet guard allows, so the title names the topic.
    await expect(page).toHaveTitle(/Clean[- ]Core/i);

    // Open Sign-In Modal
    await page.click('[data-header-sign-in]');
    await page.waitForSelector('input[type="email"]');

    // Fill Credentials
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    
    // Submit Sign-In
    console.log(`[CI DEBUG] Logging in with email: ${TEST_EMAIL}`);
    console.log('[CI DEBUG] Clicking Sign In button and waiting for redirect to /dashboard...');
    await page.click('button[type="submit"]:has-text("Sign In"), button[type="submit"]:has-text("Anmelden")');
    // Wait for Firebase Auth to settle after login (auth token must be persisted to IndexedDB
    // before navigating, otherwise the dashboard's onAuthStateChanged fires with null)
    await page.waitForTimeout(3000);
    console.log('[CI DEBUG] Auth settlement period complete. Forcing hard navigation to /dashboard...');

    // Abort any in-flight Next.js RSC streaming from the previous router.push to prevent
    // the server from being blocked when we issue a fresh page.goto
    await page.evaluate(() => window.stop());
    await page.waitForTimeout(500);

    // Force a full-page navigation instead of relying on Next.js router.push (which silently
    // fails in production builds on CI runners due to missing RSC prefetch data).
    // Use 'commit' instead of 'domcontentloaded' — it resolves as soon as the server sends
    // the first byte, which avoids hanging on slow RSC chunk streaming.
    try {
      await page.goto('/dashboard', { waitUntil: 'commit', timeout: 45000 });
    } catch (navError) {
      console.log(`[CI DEBUG] First goto attempt failed: ${navError}. Retrying with fresh context...`);
      await page.evaluate(() => window.stop());
      await page.waitForTimeout(1000);
      await page.goto('/dashboard', { waitUntil: 'commit', timeout: 45000 });
    }
    console.log('[CI DEBUG] Hard navigation to /dashboard committed. Waiting for Workspace h1...');

    // Wait for the dashboard loading guard to resolve and "My workspace" to appear —
    // for an account with no project yet its first view (AB-14a), whose h1 is not "My workspace".
    await page.waitForSelector('[data-cc-workspace] h1', { timeout: 90000 });
    console.log('Successfully logged in and reached /dashboard.');

    // --- STAGE 0.5: CREATE PROJECT ---
    // "My workspace" is the 3.0 list for every account since roadmap 3.0.1
    // (ADR-061), and its "New project" leads to the example-or-own-code page;
    // that path, through the import page, is walked by
    // tests/own-code-import-page.spec.ts. This walk is about the seven stages
    // from the Analyze stage's own upload on, so it checks that "New project"
    // is there and then starts from an empty project of this account.
    console.log('Creating a new E2E transformation project...');
    // A new account's first view has the start built in (AB-14a); the list has "New project"; the tiles of a
    // returning account (3.3.0) have "Analyse another Z program". An actionable start, not a container (QA review
    // 92ba4ba017dc, 38a985dd8002).
    const start = page.locator('[data-workspace-new-project], [data-home-start-example], [data-ws-analyse-another]').first();
    await expect(start).toBeVisible({ timeout: 60000 });
    await expect(start).toBeEnabled();

    const { adminMergeDoc } = await import('./helpers/admin-seed');
    const projectId = `e2e-pipeline-${branchSuffix}-${Date.now()}`;
    await adminSetDoc('projects', projectId, {
      name: 'Super Duper E2E Invoice Extractor',
      status: 'created',
      userId: ownerUid,
      createdAt: new Date(),
    });
    await page.goto(`/project/${projectId}/analyze?view=it`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 45000 });
    console.log('Project created. Navigated to analyze page.');

    // Seed a test case and suite to bypass live generation flake. The case is
    // seeded as `Pending` with no message, so a verdict on the page later can
    // only come from the run this spec starts.
    console.log(`Seeding project ${projectId}`);

    // Use Admin SDK to bypass security rules (client SDK triggers getUserData()
    // evaluation errors in the emulator)
    await adminMergeDoc('projects', projectId, {
      testCases: [
        {
          id: 'TC_01',
          name: 'Extract Invoice Headers',
          category: 'Smoke Test',
          priority: 'High',
          description: 'Verify invoice extraction headers mapping',
          preconditions: 'Invoice data parsed',
          steps: ['1. Execute mapping'],
          expectedResult: 'Invoice header fields are mapped',
          status: 'Pending',
          message: ''
        }
      ],
      testSuite: {
        code: `import { test } from 'node:test';\nimport assert from 'node:assert';\n\ntest('TC_01: Extract Invoice Headers', () => {\n  assert.strictEqual(1, 1);\n});\n`
      }
    });
    console.log(`Seeded project ${projectId} in Firestore.`);

    // --- STAGE 1: ANALYZE & SECURITY SCANS ---
    console.log('Executing Stage 1: Upload and Security checks...');
    // Read the safe ABAP example file Z_INVOICE_EXTRACTOR.txt
    const abapFilePath = path.join(process.cwd(), 'public', 'starter-examples', 'Z_INVOICE_EXTRACTOR.txt');
    const abapCode = fs.readFileSync(abapFilePath, 'utf8');

    // Simulate drag-and-drop / select file interaction via hidden input
    await page.setInputFiles('input[type="file"]', abapFilePath);
    console.log('Uploaded ABAP Invoice Extractor.');

    // Verify visual code preview is rendered
    const textPreview = page.locator('textarea[placeholder="Paste legacy code here..."]');
    await expect(textPreview).toBeVisible();
    
    // Assert visual security scan indicator badge is displayed and clean
    const securityCheckBadge = page.locator('text=Malicious Payload Check passed:');
    await expect(securityCheckBadge).toBeVisible();
    console.log('Verified automatic security check is present and passing.');

    // Verify Start Analysis button is disabled by default (due to unaccepted terms)
    const startAnalysisBtn = page.locator('button:has-text("Start Analysis")');
    await expect(startAnalysisBtn).toBeDisabled();

    // Accept Terms & Conditions checkbox
    await page.locator('input[type="checkbox"]').check();
    // Since e6829efd (UX-013/134/165) the button also stays closed until a
    // target operating model is chosen, and says so under itself.
    await expect(startAnalysisBtn).toBeDisabled();
    await expect(page.locator('#analyze-start-blocked-reason')).toContainText('Select a target operating model');
    console.log('Terms accepted checkbox verified.');

    // Click Operating Model (SAP Cloud ERP Private)
    await page.getByText('SAP Cloud ERP Private', { exact: true }).first().click();
    await expect(startAnalysisBtn).toBeEnabled();
    await expect(page.locator('#analyze-start-blocked-reason')).toHaveCount(0);

    // Click Start Analysis to trigger prompt model confirmation
    await startAnalysisBtn.click();
    
    // Verify confirmation modal opens
    // A CcDialog since D.10b: the title is the dialog's h2 and names it.
    const confirmationModal = page.getByRole('dialog', { name: 'Confirm Target Operating Model' });
    await expect(confirmationModal).toBeVisible();

    // Confirm the operating model and start (label since D.10a)
    await page.click('button:has-text("Confirm and start the analysis")');
    console.log('AI modernization started. Performing deep analysis...');

    // Wait for the analysis loader to complete and render the analysis report
    const complianceHeader = page.getByRole('dialog', { name: 'Understanding Clean Core' });
    // Generous timeout since Gemini call is executed live in this test context
    // A project's first run continues in the workspace with the first look
    // (owner 02.10.2026, roadmap 3.0.1); the report is read on the Analyze
    // tool, opened from the workspace's tools bar.
    await page.waitForURL(new RegExp(`/project/${projectId}/analyze\\?first=1`), { timeout: 180000 });
    // Since AB-2 the first run continues in Analyze, Business view (the map); the report is IT's, one view switch away.
    await expect(page.locator('[data-analyze-business="ready"]')).toBeVisible({ timeout: 90000 });
    await page.locator('[data-stage-view-switch] [role="radio"]', { hasText: 'IT' }).click({ timeout: 60000 });
    await page.waitForURL(new RegExp(`/project/${projectId}/analyze\\?.*view=it`), { timeout: 60000 });
    // The stage answers first since the tool-page rebuild (ADR-029, ADR-050).
    await expect(page.locator('[data-analysis-answer]')).toBeVisible({ timeout: 90000 });
    console.log('Stage 1 Complete: Analysis report parsed and rendered.');

    // --- STAGE 2: SOLUTION DESIGN ---
    console.log('Navigating to Stage 2: Solution Design...');
    // A stage is a tool of the workspace since roadmap 3.0.1: the way across is
    // the tools bar under the stage header, not a "Continue to …" button.
    await openTool(page, 'design');
    // The design is written on the owner's click once the business questions
    // are read (owner decision 22.10.2026); with questions open, the secondary
    // action writes it and names them as open. Its document opens on the group
    // "What we build", which holds the blueprint.
    // Since Design shows three views (ADR-130) the design is written in the Business view, under the business
    // questions, and read in the IT view, whose canvas holds the document and "Confirm target".
    const viewRadio = (name: string) => page.locator('[data-stage-view-switch] [role="radio"]', { hasText: name });
    await viewRadio('Business').click({ timeout: 60000 });
    const gate = page.locator('[data-design-write-gate]');
    await expect(gate).toHaveAttribute('data-design-write-gate', /^(ready|open)$/, { timeout: 120_000 });
    if ((await gate.getAttribute('data-design-write-gate')) === 'open') await page.locator('[data-design-generate-without]').click();
    else await page.locator('[data-design-generate]').click();
    // Design and its NFR proposals are two model calls in sequence, saved in one
    // write (eb8987e0): wait as long as the product itself waits, not 45 s.
    await expect(page.locator('[data-design-written]')).toBeVisible({ timeout: DESIGN_GENERATION_CEILING_MS + 15_000 });
    await viewRadio('IT').click();
    await expect(page.locator('[data-design-section="blueprint"]')).toBeVisible({ timeout: 60_000 });
    await page.locator('[data-design-section="blueprint"]').click();
    await page.waitForSelector('text=Target Project Blueprint', { timeout: 45000 });
    
    // Verify that the files tree explorer renders the modernization directory structures
    await expect(page.locator('text=Target Project Blueprint')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('text=/project-root')).toBeVisible();
    console.log('Stage 2 Complete: Visual architecture catalog verified.');

    // The decision, route included, in one go on the Decide page (ADR-145): Design's Management view leads there and
    // no longer confirms a target itself.
    console.log('Recording the decision on the Decide page...');
    await viewRadio('Management').click();
    await expect(page.locator('[data-design-decide]')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-design-confirm]')).toHaveCount(0);
    await page.locator('[data-design-decide]').click();
    await expect(page.locator('[data-decide-state="choosing"]')).toBeVisible({ timeout: 120_000 });
    await page.locator('[data-decide-option="rebuild"]').click();
    await expect(page.locator('[data-decide-record]')).toBeEnabled({ timeout: 120_000 });

    // Listen for console errors during the click
    page.on('console', msg => {
      if (msg.type() === 'error') console.log(`[BROWSER ERROR] ${msg.text()}`);
    });

    await page.locator('[data-decide-record]').click();
    await page.locator('[data-cc-message-box]').getByRole('button', { name: 'Record the decision', exact: true }).click();
    // One confirmation: the decision, its route and its record, by the signed-in account.
    await expect(page.locator('[data-decide-state="decided"][data-decide-option="rebuild"]')).toBeVisible({ timeout: 60000 });
    console.log('Decision recorded.');

    // --- STAGE 3: TRANSFORMATION ---
    console.log('Navigating to Stage 3: Transformation...');
    await openTool(page, 'transformation');
    // Since 3.5.0 (ADR-129 (4)) the code beside the original, with its Sync Scroll, is the drawer "All code side by
    // side", offered with a generated package; this walk generates none. The stage opens on its answer: no code yet,
    // and Generate code offered to the owner.
    await expect(page.locator('[data-transformation-answer="none"]')).toBeAttached({ timeout: 45000 });
    await expect(page.locator('[data-generate-code]')).toBeVisible({ timeout: 45000 });
    console.log('Stage 3 Complete: Transformation opens on its answer, Generate code offered.');

    // The canonical order (roadmap §7.0, lib/workflow-steps.ts): Documentation is
    // phase 4, Testing 5, Economics 6. Transformation used to hand over to Testing
    // and Testing to Documentation, while the product's own copy already called
    // Documentation "stage 4".

    // --- STAGE 4: PROCESS BLUEPRINTING & DOCUMENTATION ---
    console.log('Navigating to Stage 4: Documentation...');
    await openTool(page, 'documentation');
    // One name for the stage everywhere (UX-169): the title is the stepper's label.
    await page.waitForSelector('[data-stage-header="documentation"] h1[data-stage-title]', { timeout: 45000 });

    // Roadmap 3.0.5: the documentation is read out of the code by the engine;
    // since 03.10.2026 opening the stage writes it, without a click.

    // Since 3.5.0 the engine's reading stands in the document's appendix fold, closed until the reader opens it:
    // it is written on opening (attached), not shown first.
    await expect(page.locator('[data-engine-documentation]')).toBeAttached({ timeout: 60000 });
    console.log('Stage 4 Complete: process documentation read from the code.');

    // --- STAGE 5: TESTING SANDBOX ---
    console.log('Navigating to Stage 5: Testing Sandbox...');
    await openTool(page, 'testing');
    // The answer first (ADR-131): with no scenario its one action is "Write the scenarios", beside the answer.
    await page.waitForSelector('[data-testing-flow]', { timeout: 60000 });
    if ((await page.locator('[data-testing-answer="not-started"]').count()) > 0) {
      console.log('Test suite not preloaded. Clicking Write the scenarios...');
      await page.locator('[data-answer-card]').getByRole('button', { name: 'Write the scenarios' }).click();
      await expect(page.locator('[data-testing-answer="not-started"]')).toHaveCount(0, { timeout: 60000 });
    } else {
      console.log('Test suite preloaded.');
    }

    // Which execution step 2 offers is decided by the project's route, and the
    // route of this example by the evidence engine, not by a model:
    // Z_INVOICE_EXTRACTOR has no Side-by-Side driver, so it is routed In-App
    // (ABAP Cloud). Its suite is an ABAP Unit class, which the isolated runner
    // cannot execute — so step 2 offers no run and says why, and nothing is
    // made up. Until 02.10.2026 this route answered "Run" with a simulated run
    // in the browser that reached no server (owner report). Stated as a
    // precondition, so a change of route fails here by name.
    const { adminGetDoc } = await import('./helpers/admin-seed');
    const routed = await adminGetDoc('projects', projectId);
    expect(routed?.extensibilityRoute, 'the example is expected on the ABAP Cloud route').toContain('ABAP Cloud');

    const runTestsRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/run-tests')) runTestsRequests.push(r.method());
    });
    // "Where it ran" marks your SAP system and offers no run here (ADR-131 S3, S5).
    const ran = page.locator('[data-testing-ran]');
    await expect(ran.locator('[data-test-place="your-system"][data-test-place-active]')).toBeVisible();
    await expect(ran.locator('[data-test-place="here"]')).toContainText('cannot run an ABAP Unit class');
    await expect(page.getByRole('button', { name: /against SAP mocks$/ })).toHaveCount(0);
    // No result card appears from nowhere.
    await expect(page.locator('div.group', { has: page.locator('h4', { hasText: 'Extract Invoice Headers' }) })).toHaveCount(0);
    expect(runTestsRequests).toEqual([]);
    console.log('Stage 5 Complete: scenarios written; ABAP Unit is not run here, and the page says so.');

    // --- STAGE 6: ECONOMICS ---
    console.log('Navigating to Stage 6: Economics...');
    await openTool(page, 'tco');
    await page.waitForSelector('[data-stage-header="tco"]', { timeout: 45000 });
    console.log('Stage 6 reached: Economics.');

    // --- STAGE 7: MODULAR HANDOVER DELIVERY ---
    console.log('Navigating to Stage 7: Delivery...');
    await openTool(page, 'delivery');
    // Since 3.5.0 the bundle button says what it hands over: the package, or the review version while the
    // handover is not complete.
    const bundleButton = page.getByRole('button', { name: /^Download the (package|review version)$/ }).first();
    await expect(bundleButton).toBeVisible({ timeout: 45000 });

    // Setup download event listener
    const downloadPromise = page.waitForEvent('download');
    
    // Click ZIP Download Handover Bundle
    await bundleButton.click();
    const download = await downloadPromise;

    // Assert download is successful
    const filename = download.suggestedFilename();
    expect(filename).toContain('.zip');
    console.log(`Stage 7 Complete: Handover ZIP file successfully downloaded (${filename}).`);
  });
});
