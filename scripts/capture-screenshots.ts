import { chromium } from 'playwright';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, doc, setDoc, getDoc, connectFirestoreEmulator } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import firebaseConfig from '../firebase-applet-config.json';

const firebaseApp = initializeApp(firebaseConfig);
const firestoreDb = initializeFirestore(firebaseApp, {}, firebaseConfig.firestoreDatabaseId);
const firebaseAuth = getAuth(firebaseApp);
connectFirestoreEmulator(firestoreDb, '127.0.0.1', 8080);
connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });

const TEST_EMAIL = 'screenshot-bot@cleancore-test.io';
const TEST_PASSWORD = 'ScreenshotPass123!';
const OUT = path.join(process.cwd(), 'public', 'screenshots');

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('\n📸 Clean-Core.io Screenshot Capture\n');

  // ── Step 0: Setup test user ──
  let uid = '';
  try {
    const cred = await createUserWithEmailAndPassword(firebaseAuth, TEST_EMAIL, TEST_PASSWORD);
    uid = cred.user.uid;
    console.log(`Created user: ${uid}`);
  } catch (e: any) {
    if (e.code === 'auth/email-already-in-use') {
      const cred = await signInWithEmailAndPassword(firebaseAuth, TEST_EMAIL, TEST_PASSWORD);
      uid = cred.user.uid;
      console.log(`Reusing user: ${uid}`);
    } else throw e;
  }

  await setDoc(doc(firestoreDb, 'users', uid), {
    firstName: 'Screenshot', lastName: 'Bot', email: TEST_EMAIL,
    tier: 'starter', status: 'approved', transformationsUsed: 0,
    transformationsLimit: 25, maxTeamMembers: 1, orgId: null,
    identityProvider: 'password', createdAt: new Date(), isAdmin: false, authMethod: 'password',
  }, { merge: true });

  // ── Launch browser ──
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', msg => { if (msg.type() === 'error') console.log(`  [ERR] ${msg.text().substring(0, 120)}`); });

  const BASE = 'http://localhost:3000';

  // ── Login ──
  console.log('🔐 Logging in...');
  await page.goto(BASE);
  await sleep(2000);
  await page.click('button:has-text("Get Pilot Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In"), button[type="submit"]:has-text("Anmelden")');
  await sleep(3000);
  await page.evaluate(() => window.stop());
  await sleep(500);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'commit', timeout: 45000 });
  await page.waitForSelector('h1:has-text("Workspace")', { timeout: 60000 });
  console.log('✅ Logged in\n');

  // ── Create project ──
  console.log('📁 Creating project...');
  await page.click('button:has-text("Create Project")');
  await page.waitForSelector('input[placeholder*="Z_FI_INVOICE_REPORT"]');
  await page.fill('input[placeholder*="Z_FI_INVOICE_REPORT"]', 'Screenshot Demo Invoice Extractor');
  await page.click('button[type="submit"]:has-text("Create"), button[type="submit"]:has-text("Erstellen")');
  await page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 45000 });

  const projectId = page.url().split('/project/')[1].split('/')[0];
  console.log(`✅ Project: ${projectId}\n`);

  // Seed the project with test data for later stages
  await setDoc(doc(firestoreDb, 'projects', projectId), {
    testCases: [
      { id: 'TC_01', name: 'Extract Invoice Headers', category: 'Smoke Test', priority: 'High', description: 'Verify invoice header mapping', preconditions: 'Data parsed', steps: ['Execute mapping'], expectedResult: 'Passed', status: 'Passed', message: 'Passed' }
    ],
    testSuite: {
      code: `import { test } from 'node:test';\nimport assert from 'node:assert';\n\ntest('TC_01: Extract Invoice Headers', () => {\n  assert.strictEqual(1, 1);\n});\n`
    }
  }, { merge: true });

  // ── Upload ABAP file ──
  const abapFile = path.join(process.cwd(), 'abap-test-files', 'Z_INVOICE_EXTRACTOR.txt');
  await page.setInputFiles('input[type="file"]', abapFile);
  await sleep(1000);

  // ── Accept terms + start analysis ──
  await page.locator('input[type="checkbox"]').check();
  await page.click('text=Private Cloud RISE Edition');
  await page.click('button:has-text("Start Analysis")');
  await sleep(500);
  await page.click('button:has-text("Start AI Modernization Engine")');

  // Wait for analysis report
  console.log('⏳ Waiting for AI Analysis (up to 60s)...');
  await page.waitForSelector('text=Business Analysis Report', { timeout: 60000 });
  await sleep(2000);

  // ── SCREENSHOT 1: Analysis ──
  console.log('📸 [1/6] Analysis page');
  await page.screenshot({ path: path.join(OUT, 'step-1.jpg'), type: 'jpeg', quality: 92 });

  // ── Navigate to Design ──
  console.log('📸 [2/6] Design page');
  await page.click('button:has-text("Continue to Design")');
  await page.waitForSelector('text=Target Project Blueprint', { timeout: 60000 });
  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, 'step-2.jpg'), type: 'jpeg', quality: 92 });

  // ── Navigate to Transformation ──
  console.log('📸 [3/6] Transformation page');
  await page.click('button:has-text("Continue to Transformation")');
  await page.waitForSelector('button:has-text("Sync Scroll:")', { timeout: 60000 });
  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, 'step-3.jpg'), type: 'jpeg', quality: 92 });

  // ── Navigate to Testing ──
  console.log('📸 [4/6] Testing page');
  await page.click('button:has-text("Proceed to Testing")');
  await page.waitForSelector('button:has-text("Run Selected"), button:has-text("Generate Suite")', { timeout: 60000 });
  const runBtn = page.locator('button:has-text("Run Selected")');
  if (!(await runBtn.isVisible())) {
    await page.click('button:has-text("Generate Suite")');
    await runBtn.waitFor({ timeout: 60000 });
  }
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT, 'step-4.jpg'), type: 'jpeg', quality: 92 });

  // ── Navigate to Documentation ──
  console.log('📸 [5/6] Documentation page');
  await page.click('button:has-text("Proceed to Documentation")');
  await page.waitForSelector('h1:has-text("Process Blueprint")', { timeout: 60000 });
  const startBtn = page.locator('button:has-text("Start Architectural Mapping")');
  try {
    await startBtn.waitFor({ timeout: 5000 });
    await startBtn.click();
  } catch {}
  await page.waitForSelector('text=Interactive BPMN Map', { timeout: 60000 });
  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, 'step-5.jpg'), type: 'jpeg', quality: 92 });

  // ── Navigate to Delivery ──
  console.log('📸 [6/6] Delivery page');
  await page.click('button:has-text("Proceed to Delivery")');
  await page.waitForSelector('button:has-text("Download Bundle")', { timeout: 60000 });
  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, 'step-6.jpg'), type: 'jpeg', quality: 92 });

  await browser.close();
  console.log('\n✅ All 6 screenshots captured in public/screenshots/\n');
}

run().catch(e => { console.error('❌ Failed:', e.message); process.exit(1); });
