import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK in Node context to register and approve the test user
const firebaseApp = initializeApp(firebaseConfig);
const firestoreDb = initializeFirestore(firebaseApp, {}, firebaseConfig.firestoreDatabaseId);
const firebaseAuth = getAuth(firebaseApp);

const TEST_EMAIL = `superduper-e2e-${Date.now()}@cleancore-test.io`;
const TEST_PASSWORD = 'SuperPassword123!';

test.describe('Clean-Core.io End-to-End Pipeline & Safe Examples Verification', () => {
  
  test.beforeAll(async () => {
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

    // 2. Elevate user status to 'approved' inside Firestore and provision transformations quota
    const userDocRef = doc(firestoreDb, 'users', uid);
    const docSnap = await getDoc(userDocRef);
    if (!docSnap.exists()) {
      await setDoc(userDocRef, {
        firstName: 'Super',
        lastName: 'Duper E2E',
        email: TEST_EMAIL,
        tier: 'starter',
        status: 'approved',
        transformationsUsed: 0,
        transformationsLimit: 25,
        maxTeamMembers: 1,
        orgId: null,
        identityProvider: 'password',
        createdAt: new Date(),
        isAdmin: false,
        authMethod: 'password',
      });
      console.log('Created new E2E test user profile with starter tier.');
    } else {
      const data = docSnap.data();
      if (data.status !== 'approved' || data.tier !== 'starter') {
        await setDoc(userDocRef, { status: 'approved', tier: 'starter' }, { merge: true });
        console.log('Approved existing E2E test user profile and updated to starter tier.');
      } else {
        console.log('E2E test user profile already exists, is approved, and has starter tier.');
      }
    }
  });

  test('should walk through the complete 6 progressive stages using a safe example', async ({ page }) => {
    test.setTimeout(300 * 1000); // 5 minutes timeout for all 5 live LLM calls

    // --- STAGE 0: LOGIN ---
    console.log('Navigating to homepage and signing in...');
    await page.goto('/');
    await expect(page).toHaveTitle(/Clean-Core/i);

    // Open Sign-In Modal
    await page.click('button:has-text("Get Pilot Access")');
    await page.waitForSelector('input[type="email"]');

    // Fill Credentials
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    
    // Submit Sign-In
    await page.click('button[type="submit"]:has-text("Sign In"), button[type="submit"]:has-text("Anmelden")');
    await page.waitForURL('**/dashboard');
    console.log('Successfully logged in and reached /dashboard.');

    // --- STAGE 0.5: CREATE PROJECT ---
    console.log('Creating a new E2E transformation project...');
    const createProjectButton = page.locator('button:has-text("Create Project"), button:has-text("Projekt erstellen")').first();
    await expect(createProjectButton).toBeVisible();
    await createProjectButton.click();

    // Fill project name in modal form
    await page.waitForSelector('input[placeholder*="Z_FI_INVOICE_REPORT"]');
    await page.fill('input[placeholder*="Z_FI_INVOICE_REPORT"]', 'Super Duper E2E Invoice Extractor');
    
    // Click submit in project creation modal
    await page.click('button[type="submit"]:has-text("Create"), button[type="submit"]:has-text("Erstellen")');
    await page.waitForURL(/.*\/project\/.*\/analyze/);
    console.log('Project created. Navigated to analyze page.');

    // --- STAGE 1: ANALYZE & SECURITY SCANS ---
    console.log('Executing Stage 1: Upload and Security checks...');
    // Read the safe ABAP example file Z_INVOICE_EXTRACTOR.txt
    const abapFilePath = path.join(process.cwd(), 'abap-test-files', 'Z_INVOICE_EXTRACTOR.txt');
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

    // Accept Pilot Terms & Conditions Checkbox
    await page.locator('input[type="checkbox"]').check();
    await expect(startAnalysisBtn).toBeEnabled();
    console.log('Terms accepted checkbox verified.');

    // Click Operating Model (Private Cloud RISE)
    await page.click('text=Private Cloud RISE Edition');

    // Click Start Analysis to trigger prompt model confirmation
    await startAnalysisBtn.click();
    
    // Verify confirmation modal opens
    const confirmationModal = page.locator('h3:has-text("Confirm Target Operating Model")');
    await expect(confirmationModal).toBeVisible();

    // Click Start AI Modernization Engine in confirmation modal
    await page.click('button:has-text("Start AI Modernization Engine")');
    console.log('AI modernization started. Performing deep analysis...');

    // Wait for the analysis loader to complete and render the analysis report
    const complianceHeader = page.locator('h3:has-text("Understanding Clean Core")');
    // Generous timeout since Gemini call is executed live in this test context
    await expect(page.locator('text=Business Analysis Report')).toBeVisible({ timeout: 45000 });
    console.log('Stage 1 Complete: Analysis report parsed and rendered.');

    // --- STAGE 2: SOLUTION DESIGN ---
    console.log('Navigating to Stage 2: Solution Design...');
    await page.click('button:has-text("Continue to Design")');
    await page.waitForURL(/.*\/project\/.*\/design/);
    
    // Verify that the files tree explorer renders the modernization directory structures
    await expect(page.locator('text=Target Project Blueprint')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('text=/project-root')).toBeVisible();
    console.log('Stage 2 Complete: Visual architecture catalog verified.');

    // --- STAGE 3: TRANSFORMATION ---
    console.log('Navigating to Stage 3: Transformation...');
    await page.click('button:has-text("Continue to Transformation")');
    await page.waitForURL(/.*\/project\/.*\/transformation/);
    
    // Verify proportional side-by-side scrolls toggles
    await expect(page.locator('button:has-text("Sync Scroll:")')).toBeVisible({ timeout: 45000 });
    console.log('Stage 3 Complete: Side-by-Side transformation scroll verification passed.');

    // --- STAGE 4: TESTING SANDBOX ---
    console.log('Navigating to Stage 4: Testing Sandbox...');
    await page.click('button:has-text("Proceed to Testing")');
    await page.waitForURL(/.*\/project\/.*\/testing/);
    
    // Check if Run Selected is already visible (preloaded suite), otherwise generate it
    const runButton = page.locator('button:has-text("Run Selected")');
    if (!(await runButton.isVisible())) {
      console.log('Test suite not preloaded. Clicking Generate Suite...');
      await page.click('button:has-text("Generate Suite")');
      await expect(runButton).toBeVisible({ timeout: 60000 });
    } else {
      console.log('Test suite preloaded. Proceeding directly to execution.');
    }
    
    // Run automated unit tests in Sandbox
    await page.click('button:has-text("Run Selected")');
    
    // Verify that test console stubs resolve to visual Green success badges
    await expect(page.locator('text=Passed').first()).toBeVisible({ timeout: 15000 });
    console.log('Stage 4 Complete: Sandbox test case runs executed successfully.');

    // --- STAGE 5: PROCESS BLUEPRINTING & DOCUMENTATION ---
    console.log('Navigating to Stage 5: Documentation...');
    await page.click('button:has-text("Proceed to Documentation")');
    await page.waitForURL(/.*\/project\/.*\/documentation/);
    
    // Click "Start Architectural Mapping" if it is present (new project flow)
    const startButton = page.locator('button:has-text("Start Architectural Mapping")');
    try {
      await expect(startButton).toBeVisible({ timeout: 5000 });
      await startButton.click();
      console.log('Triggered architectural blueprint documentation generation...');
    } catch (e) {
      console.log('Documentation blueprint already exists or is generating, skipping click.');
    }
    
    // Verify BPMN process flows are active
    await expect(page.locator('text=Interactive BPMN Map')).toBeVisible({ timeout: 60000 });
    console.log('Stage 5 Complete: Architectural documentation mapped successfully.');

    // --- STAGE 6: MODULAR HANDOVER DELIVERY ---
    console.log('Navigating to Stage 6: Delivery...');
    await page.click('button:has-text("Proceed to Delivery")');
    await page.waitForURL(/.*\/project\/.*\/delivery/);

    // Setup download event listener
    const downloadPromise = page.waitForEvent('download');
    
    // Click ZIP Download Handover Bundle
    await page.click('button:has-text("Download Bundle")');
    const download = await downloadPromise;

    // Assert download is successful
    const filename = download.suggestedFilename();
    expect(filename).toContain('.zip');
    console.log(`Stage 6 Complete: Handover ZIP file successfully downloaded (${filename}).`);
  });
});
