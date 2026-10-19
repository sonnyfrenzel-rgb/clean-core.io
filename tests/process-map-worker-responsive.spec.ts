import fs from 'fs';
import path from 'path';
import { test, expect } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The page stays responsive while the process map is drawn (owner, 12.10.2026:
 * the CO project froze the Documentation tool — Chrome's "Page not
 * responding" while `buildReadingExports` ran 11–13 s on the main thread).
 *
 * The program is a benchmark case the router is known to be slow on
 * (BM-039, ~13 s for its reading in Node on 12.10.2026), so the map is pending
 * for long enough to measure. A `longtask` observer installed before the
 * page's own scripts (buffered, so nothing before it is lost) records every
 * task over 50 ms from the start of the navigation until the map is drawn;
 * none may be anywhere near the old freeze — the page's own load included.
 * The reading worker is proven to have taken the map's job by the mark the
 * client sets when it posts one (`cc-reading-worker:reading`,
 * `lib/bpmn/reading-exports-client.ts`), so the test fails if the page quietly
 * fell back to its own thread — and a CSP violation naming the worker fails it
 * too (CI runs this against `npm start`, where the enforced and the
 * report-only policy are both sent).
 *
 * `MAP_WORKER_FORCE_INLINE=1` removes `Worker` from the page before its
 * scripts run — the main-thread fallback — to show that the spec fails there.
 */

const STAMP = Date.now();
const EMAIL = `map-worker-${STAMP}@cleancore-test.io`;
const PASSWORD = 'MapWorker123!';
const PROJECT_ID = `map-worker-${STAMP}`;
const RUN_ID = `map-worker-run-${STAMP}`;
const FILE_NAME = 'mzmm_pr_release_f01.abap';
const PROGRAM = fs.readFileSync(path.join(__dirname, 'prozess-benchmark', 'cases', 'BM-039', FILE_NAME), 'utf8');

/**
 * The longest task allowed from navigation start until the map is drawn. The
 * freeze it guards against was 11–13 s; the page's own load (parse, hydrate)
 * stays well under this on CI's production build.
 */
const LONGEST_TASK_MS = 1500;
const FORCE_INLINE = process.env.MAP_WORKER_FORCE_INLINE === '1';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
  const uid = cred.user.uid;
  await adminSetDoc('users', uid, {
    firstName: 'Map', lastName: 'Worker', email: EMAIL,
    tier: 'pilot', status: 'approved', activatedAt: new Date(),
    transformationsUsed: 1, transformationsLimit: 50,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
  const fingerprint = {
    sha256: sha256Hex(PROGRAM), fileName: FILE_NAME,
    lineCount: PROGRAM.split('\n').length, byteSize: Buffer.byteLength(PROGRAM, 'utf8'),
    objectType: 'Report', uploadedAt: new Date().toISOString(),
  };
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Purchase requisition release', userId: uid, createdAt: new Date(),
    status: 'documented', legacyCode: PROGRAM, s4Deployment: 'private',
    activeRunId: RUN_ID, inputFingerprint: fingerprint,
  });
  const unsignedRun = {
    runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
    createdAt: new Date().toISOString(), status: 'completed', inputFingerprint: fingerprint,
  };
  const runHash = recomputeStoredRunHash(unsignedRun);
  await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
    ...unsignedRun, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!),
  });
});

interface Probe {
  longTasks: Array<{ start: number; duration: number }>;
  violations: string[];
}

test('the Documentation tool stays responsive while a slow map is drawn, and the map arrives', async ({ page }) => {
  test.setTimeout(300 * 1000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await signInViaLanding(page, EMAIL, PASSWORD);
  await page.addInitScript((forceInline) => {
    const probe: { longTasks: Array<{ start: number; duration: number }>; violations: string[] } = { longTasks: [], violations: [] };
    (window as unknown as { __probe: typeof probe }).__probe = probe;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) probe.longTasks.push({ start: e.startTime, duration: e.duration });
      }).observe({ type: 'longtask', buffered: true });
    } catch { /* no long-task timing in this browser */ }
    document.addEventListener('securitypolicyviolation', (e) => {
      probe.violations.push(`${e.disposition} ${e.effectiveDirective} ${e.blockedURI}`);
    });
    if (forceInline) delete (window as unknown as { Worker?: unknown }).Worker;
  }, FORCE_INLINE);

  await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
  // The map is slow enough to be seen pending — the window this spec is about.
  await expect(page.getByText('Reading the process from the code…')).toBeVisible({ timeout: 90_000 });

  await page.locator('[data-process-map-canvas] [data-map-node]').first().waitFor({ timeout: 240_000 });
  const drawnAt = await page.evaluate(() => performance.now());

  const probe = await page.evaluate(() => (window as unknown as { __probe: Probe }).__probe);
  const marks = await page.evaluate(() =>
    performance.getEntriesByType('mark').map((m) => m.name).filter((n) => n.startsWith('cc-reading-worker:')),
  );
  // Time 0 of the document's timeline is the start of the navigation.
  const untilDrawn = probe.longTasks.filter((t) => t.start < drawnAt);
  const longest = Math.max(0, ...untilDrawn.map((t) => t.duration));
  const measured =
    `map drawn ${Math.round(drawnAt)} ms after navigation start; longest task ${Math.round(longest)} ms; ` +
    `${untilDrawn.length} long tasks [${untilDrawn.map((t) => `${Math.round(t.start)}+${Math.round(t.duration)}`).join(', ')}]; ` +
    `worker marks [${marks.join(', ')}]`;
  test.info().annotations.push({ type: 'measured', description: measured });
  console.log(`[map-worker] ${measured}`);
  expect(longest, `a task blocked the page for ${Math.round(longest)} ms before the map was drawn`).toBeLessThan(LONGEST_TASK_MS);
  expect(marks, "the reading worker was handed the map's job").toContain('cc-reading-worker:reading');
  expect(probe.violations.filter((v) => /worker|_next\/static/.test(v)), probe.violations.join('\n')).toEqual([]);
});
