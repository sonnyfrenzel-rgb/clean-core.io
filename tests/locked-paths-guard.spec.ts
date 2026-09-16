import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { LIVE_TEST_EXECUTION } from '../lib/locked-paths';
import { TERMS_VERSION } from '../lib/constants';

/**
 * Roadmap step 0.1 (`G0:R0`): live test execution against a connected tenant is
 * a locked path — named, with its reason and the conditions that reopen it.
 *
 * Acceptance (docs/roadmap/SCHNITT-0-UMFANG.md §1): "Die Grenze steht in
 * SECURITY.md" and "Kein View, kein Text und kein Export stellt den gesperrten
 * Pfad als verfügbar dar."
 *
 * Reopening the path means changing this spec — on purpose.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');

test.describe('the lock is named', () => {
  test('it is locked, with a boundary, a reason and all four reopening conditions', () => {
    expect(LIVE_TEST_EXECUTION.locked).toBe(true);
    expect(LIVE_TEST_EXECUTION.id).toBe('G0:R0');
    expect(LIVE_TEST_EXECUTION.reopenWhen).toHaveLength(4);
    expect(LIVE_TEST_EXECUTION.reason).toMatch(/not an isolation boundary/);
  });

  test('SECURITY.md §7.1 says exactly what the definition says', () => {
    const doc = read('SECURITY.md');
    const section = doc.slice(doc.indexOf('### 7.1 Locked path: live test execution'), doc.indexOf('\n## 8.'));
    expect(section.length).toBeGreaterThan(500);
    for (const text of [LIVE_TEST_EXECUTION.boundary.closed, LIVE_TEST_EXECUTION.boundary.open, LIVE_TEST_EXECUTION.reason, LIVE_TEST_EXECUTION.userNotice, ...LIVE_TEST_EXECUTION.reopenWhen]) {
      expect(section, text.slice(0, 60)).toContain(text);
    }
    // The executive summary no longer describes the path as merely conditional.
    expect(doc).not.toContain('Live runner egress stays disabled unless enforced at the infrastructure level');
    expect(doc).toMatch(/\*\*Live test execution against a connected S\/4HANA tenant is locked\*\*/);
  });
});

test.describe('the lock holds in code', () => {
  test('the route refuses a live run before it measures anything', () => {
    const src = read('app/api/run-tests/route.ts');
    const body = src.indexOf('await req.json()');
    const lock = src.indexOf("s4Environment === 'live' && LIVE_TEST_EXECUTION.locked");
    const refusal = src.indexOf('{ status: 403 }', lock);
    // Refused straight after the body is read: before the project lookup, the temp dir, the probe and the credentials.
    expect(body).toBeGreaterThan(0);
    expect(lock).toBeGreaterThan(body);
    for (const later of ["collection('projects')", 'await liveRunnerPermitted()', 'loadS4ConfigForUser(']) {
      expect(src.indexOf(later, body), later).toBeGreaterThan(refusal);
    }
  });

  test('the test hook does not send a locked run and does not ask a model to explain a decision', () => {
    const src = read('hooks/useTestExecution.ts');
    const guard = src.indexOf("project?.s4Environment === 'live' && LIVE_TEST_EXECUTION.locked");
    expect(guard).toBeGreaterThan(0);
    expect(src.indexOf('await executeWithHealing(payload)')).toBeGreaterThan(guard);
    const branch = src.slice(guard, src.indexOf('return null;', guard));
    expect(branch).not.toMatch(/explainTestFailure|fetch\(/);
  });

  test('the testing page shows the lock and does not offer the run', () => {
    const src = read('app/(app)/project/[projectId]/testing/page.tsx');
    // Once, not three times. Roadmap 1.7 (ADR-004, 15.09.2026): the notice used
    // to stand as a pill on the tab, as a panel above the connection card and
    // again beside the run button — three refusals on one screen read as three
    // different refusals, and none of them said how to get the connection
    // itself. The run is still refused; what changed is how often it is said.
    expect((src.match(/data-live-test-lock/g) || []).length).toBe(1);
    expect(src).toContain('{LIVE_TEST_EXECUTION.userNotice}');
    expect(src).toMatch(/disabled=\{[^}]*activeEnvTab === 'live' && !isAbapCloud && LIVE_TEST_EXECUTION\.locked/);
    expect(src).not.toContain('>Admin-Gated</span>');
    // The way out, named: BYOT is what opens the connection check.
    expect(src).toMatch(/Bring your own tenant \(BYOT\)/);
  });
});

// ── The lock, observed rather than read (needs the emulators and the dev server) ──────────────────────────
test.describe('the lock holds when used', () => {
  const EMAIL = `lock-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'LockGuard123!';
  const PROJECT_ID = `lock-${Date.now()}`;
  const RUN_ID = `lock-run-${Date.now()}`;
  let token = '';

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    token = await cred.user.getIdToken();
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Lock', lastName: 'Guard', email: EMAIL, tier: 'pilot', status: 'approved',
      transformationsUsed: 1, transformationsLimit: 5, termsVersionAccepted: TERMS_VERSION,
      mfaEnabled: false, createdAt: new Date(),
    });
    // A CAP project on the tenant tab, with tests to run — the state in which the path would be offered.
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Lock fixture', userId: cred.user.uid, createdAt: new Date(), status: 'documented',
      extensibilityRoute: 'Side-by-Side Extension (CAP on SAP BTP)', s4Environment: 'live',
      legacyCode: 'REPORT z_lock.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n',
      analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }), cleanCoreScore: 62,
      solutionDesign: '# Target architecture\n\nSide-by-side on BTP.\n', generatedCode: 'export const ok = true;\n',
      testCases: [{ id: 'TC_01', name: 'Case', category: 'Unit', status: 'Pending' }],
      documentation: '# Blueprint\n\nLevel 1.\n',
      activeRunId: RUN_ID,
    });
    // Without an active run the stages send the reader back to Analyze.
    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: PROJECT_ID, userId: cred.user.uid,
      createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
    });
  });

  const suite = ["import { test } from 'node:test';", "import assert from 'node:assert';", "test('TC_01: runs', () => { assert.ok(true); });"].join('\n');

  test('POST /api/run-tests with a live environment is refused with the notice; the same request on mocks is not', async ({ request }) => {
    test.setTimeout(90 * 1000);
    const data = { projectId: PROJECT_ID, tests: { code: suite }, code: '', selectedTestIds: ['TC_01'] };
    const live = await request.post('/api/run-tests', { headers: { Authorization: `Bearer ${token}` }, data: { ...data, s4Environment: 'live' } });
    expect(live.status()).toBe(403);
    const refused = await live.json();
    expect(refused).toMatchObject({ error: LIVE_TEST_EXECUTION.userNotice, locked: LIVE_TEST_EXECUTION.id, exitCode: 1, testResults: [] });
    expect(refused.output).toBe('');

    // The refusal belongs to the lock, not to the account or the project: on mocks the same caller runs.
    const mock = await request.post('/api/run-tests', { headers: { Authorization: `Bearer ${token}` }, data: { ...data, s4Environment: 'mock' } });
    expect(mock.status(), await mock.text()).toBe(200);
    expect((await mock.json()).locked).toBeUndefined();
  });

  test('the testing page on the tenant tab shows the lock and sends no run', async ({ page }) => {
    test.setTimeout(180 * 1000);
    const runRequests: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/run-tests')) runRequests.push(r.method()); });

    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(4000);

    await page.goto(`/project/${PROJECT_ID}/testing`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(LIVE_TEST_EXECUTION.userNotice).first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Tests against a tenant are locked')).toBeVisible();

    // Roadmap 1.7 / ADR-004: the tab is named after what it does, and the notice
    // stands exactly once on this screen — with the way to open the connection
    // itself, so the reader is turned away from one thing rather than from all
    // of them.
    const tab = page.getByRole('button', { name: /^Check tenant connection$/ });
    await expect(tab).toBeVisible();
    await expect(tab).not.toContainText('Check only');
    const notice = page.locator('[data-live-test-lock]');
    await expect(notice).toHaveCount(1);
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Bring your own tenant (BYOT)');
    await expect(notice).toContainText('an administrator reviews it by hand');

    // The saved suite is listed after a reload (it was not until the QA review of a0c108513165), so the run itself
    // can be tried: on the tenant tab the button is disabled, it says where the suite can run, and a click reaches nothing.
    await expect(page.getByText('Switch to the Mock Environment to run this suite in the sandbox.')).toBeVisible({ timeout: 30000 });
    // A saved suite opens selected, as a generated one does — so the button is disabled by the tab, not by an empty selection.
    await expect(page.getByRole('checkbox').first()).toBeChecked();
    const run = page.getByRole('button', { name: /Run Selected/ });
    await expect(run).toBeDisabled();
    await run.dispatchEvent('click');
    await page.waitForTimeout(1500);
    expect(runRequests, 'the tenant tab must not reach the runner').toEqual([]);

    // The same selection on the mock tab can run.
    await page.getByRole('button', { name: /^Mock Environment$/ }).click();
    await expect(run).toBeEnabled({ timeout: 10000 });
  });
});

test.describe('no text offers the locked path', () => {
  /**
   * Every file a user, a mail recipient or a model-written answer can draw text from — not a list of the files
   * that happened to be fixed. A fixed list passed while the knowledge panel, the landing slideshow and the
   * tenant mails still offered the path (findings 1ba774db5f81, 544cc34084cd).
   */
  const walk = (dir: string): string[] =>
    fs.readdirSync(path.resolve(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) return ['node_modules', 'generated', '.next'].includes(e.name) ? [] : walk(rel);
      return /\.(tsx?|mjs|js|md|html)$/.test(e.name) ? [rel] : [];
    });
  // lib/locked-paths.ts is the definition of the closed path and has to name it; the spec above checks it word for word.
  const SURFACES = [...['app', 'components', 'hooks', 'lib'].flatMap(walk), 'public/linkedin-whitepaper-template.html', 'README.md'].filter((f) => f !== 'lib/locked-paths.ts');

  /** Comments are for maintainers and may quote a removed claim; `://` in a URL is not a comment. */
  const visibleText = (file: string) =>
    read(file)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

  test('the scan reaches the surfaces the claims were found on', () => {
    for (const file of ['components/KnowledgeClient.tsx', 'components/LandingSlideshow.tsx', 'app/api/send-tenant-revoke-email/route.ts', 'lib/chatbot-knowledge.ts']) {
      expect(SURFACES).toContain(file);
    }
    expect(SURFACES.length).toBeGreaterThan(200);
  });

  /** The claims that were there on 15.09.2026, each one presenting the path as available. */
  const CLAIMS = [
    /live test cases/i,
    /execute live tests/i,
    /live (?:S\/4HANA )?(?:tenant )?testing\b/i,
    /live OData tests?\b/i,
    /metadata reads? and test execution/i,
    /and test executions/i,
    /E2E unit tests on live/i,
    /test transformations directly against/i,
    /simulations against (?:live )?(?:connected )?S\/4HANA/i,
    /Connect a (?:Live )?Tenant for (?:a )?real/i,
    /run against your live tenant/i,
    /generated tests can run against a real OData/i,
    /executed in an isolated sandbox with per-case results/i,
    /badge: "Validated"/,
    // Security claims found in the same panels: credentials are encrypted on the server, not in the browser.
    /encrypted (?:locally )?in(?:-| the )browser/i,
    /Browser-side Encryption/,
    // Isolation the runner does not have: it is a restricted Node.js child process, not an isolation boundary.
    /isolated (?:testing |test )?sandbox/i,
    /isolated Node(?:\.js)? (?:process|environment|sandbox)/i,
    /in an isolated environment/i,
    /secure (?:Node(?:\.js)? )?sandbox/i,
    /containeri[sz]ed/i,
    /stays disabled unless/i,
    /tests can run against a real/i,
    /code directly against your/i,
    /fallback-routed/i,
    /connectivity tunnels/i,
  ];

  for (const file of SURFACES) {
    test(`${file}`, () => {
      const text = visibleText(file);
      for (const claim of CLAIMS) expect(text, `${file} still says ${claim}`).not.toMatch(claim);
      // Any sentence about running or executing tests against a tenant has to say it is locked.
      for (const sentence of text.split(/(?<=[.!?])\s+|\n/)) {
        if (/\b(?:run|runs|running|execut\w*)\b[^.]{0,60}\btests?\b[^.]{0,50}\bagainst\b[^.]{0,40}\btenant/i.test(sentence)) {
          expect(sentence, `${file}: "${sentence.trim().slice(0, 120)}"`).toMatch(/locked/i);
        }
      }
    });
  }
});
