/**
 * Roadmap step 0.2 — "nothing claims more than the data allows", the nine UX
 * findings the register schedules into it.
 *
 * Each of the nine was a sentence, a badge or a control that told the reader
 * something the product had not established:
 *
 *   UX-037  the Transformation stage promised Node.js on the RAP track
 *   UX-038  a "Quirk Remediation Mode" toggle switched a banner, never the code
 *   UX-040  three "Transformation Insights" cards, static and track-wrong
 *   UX-059  the dashboard forum reported a public post and kept it in useState
 *   UX-027  a green success tick for code that was never compiled or tested
 *   UX-029  "BPMN-Compatible" / "SAP Build-Compatible", qualified only on hover
 *   UX-076  an onboarding cancel dialog that said the reader would "fail"
 *   UX-026  a Jira modal promising Epics and Stories it cannot create
 *   UX-084  the first-run guide quoted the header's quota backwards
 *
 * The assertions are made against the rendered page wherever a browser can
 * reach it. A source grep is satisfied by a component that fetches the same
 * sentence from somewhere else; rendered text is not (the reasoning of
 * `tests/landing-style-guard.spec.ts`). One of the nine — the Jira modal — is
 * imported by nothing in the app, so no route can render it; that one is read
 * from source, and says so.
 */
import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { getCloudServiceDetails } from '../components/design/CloudServiceIntegrations';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with its comments taken out — a comment renders nothing. */
const withoutComments = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const STAMP = Date.now();
const PASSWORD = 'ClaimsHonesty123!';

function emulatorAuth() {
  // The default app by name rather than "any app": a named app left in the
  // registry by an earlier spec makes `getApps()` non-empty, initialisation is
  // skipped, and the argument-less getAuth() then fails.
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch {
    /* already connected */
  }
  return auth;
}

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

/** A populated project on one of the two extensibility tracks. */
async function seedProject(uid: string, id: string, route: string, generatedCode: string) {
  await adminSetDoc('projects', id, {
    name: `Claims honesty ${route}`,
    userId: uid,
    createdAt: new Date(),
    status: 'documented',
    extensibilityRoute: route,
    originalRecommendation: route,
    legacyCode: 'REPORT z_claims.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n',
    analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
    cleanCoreScore: 62,
    solutionDesign: '# Target architecture\n\nOne paragraph.\n',
    generatedCode,
    testCases: [{ id: 't1', name: 'Case', category: 'Unit', status: 'Passed' }],
    coverageEstimate: { percentage: 73 },
    documentation: JSON.stringify({
      l3_flow: [{ id: 'Task_1', name: 'Check stock', type: 'task', role: 'Clerk' }],
    }),
    activeRunId: `${id}-run`,
  });
  await adminSetDoc(`projects/${id}/runs`, `${id}-run`, {
    runId: `${id}-run`,
    projectId: id,
    userId: uid,
    createdAt: new Date().toISOString(),
    status: 'completed',
    cleanCoreScore: 62,
    extensibilityRoute: route,
  });
}

test.describe('a signed-in account reading its own project', () => {
  const EMAIL = `claims-${STAMP}@cleancore-test.io`;
  const RAP = `claims-rap-${STAMP}`;
  const BTP = `claims-btp-${STAMP}`;

  test.beforeAll(async () => {
    const cred = await createUserWithEmailAndPassword(emulatorAuth(), EMAIL, PASSWORD);
    const uid = cred.user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Claims',
      lastName: 'Honesty',
      email: EMAIL,
      tier: 'pilot',
      status: 'approved',
      transformationsUsed: 0,
      transformationsLimit: 5,
      createdAt: new Date(),
    });
    // The RAP fixture carries ABAP, so the words "Node.js" can only reach that
    // screen from the stage's own copy — which is the thing under test.
    await seedProject(
      uid,
      RAP,
      'In-App (ABAP Cloud)',
      JSON.stringify([
        { path: 'src/zcl_demo_rap_behavior.clas.abap', content: 'CLASS zcl_demo DEFINITION.\nENDCLASS.\n' },
      ]),
    );
    await seedProject(
      uid,
      BTP,
      'Side-by-Side (SAP BTP)',
      JSON.stringify([{ path: 'srv/service.ts', content: 'export const ok = true;\n' }]),
    );
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(180 * 1000);
    await signIn(page, EMAIL);
  });

  test('UX-037 · the Transformation stage names the track it generates for', async ({ page }) => {
    await page.goto(`/project/${RAP}/transformation`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-track-lead]', { timeout: 60000 });
    await expect(page.locator('[data-track-lead]')).toHaveText('Legacy ABAP to ABAP Cloud (RAP) Conversion');
    await expect(page.locator('[data-track-pane]')).toHaveText('Modernized Target (ABAP Cloud/RAP)');
    // The whole stage, not just the lead: the promise stood in three places and
    // correcting one of them is not the fix.
    const rapText = await page.locator('body').innerText();
    expect(rapText, 'the RAP track must not be promised Node.js anywhere on the stage').not.toContain('Node.js');

    await page.goto(`/project/${BTP}/transformation`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-track-lead]', { timeout: 60000 });
    await expect(page.locator('[data-track-lead]')).toHaveText('Legacy ABAP to Modern Node.js (TypeScript) Conversion');
    await expect(page.locator('[data-track-pane]')).toHaveText('Modernized Target (Node.js/TS)');
  });

  test('UX-038 · no control offers to switch code that never changes', async ({ page }) => {
    await page.goto(`/project/${BTP}/transformation`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-track-lead]', { timeout: 60000 });
    // The toggle lived in the compliance drawer, so the drawer is opened first:
    // asserting against a closed drawer would pass on an empty DOM.
    await page.click('text=View Grounding Audit');
    await page.waitForSelector('text=Sign-off Checklist', { timeout: 30000 });
    const text = await page.locator('body').innerText();
    for (const gone of ['Quirk Remediation Mode', 'Strict Legacy Mode', 'Clean Core Refactored']) {
      expect(text, `${gone} came back`).not.toContain(gone);
    }
  });

  test('UX-040 · no static insight card claims to describe this code', async ({ page }) => {
    await page.goto(`/project/${BTP}/transformation`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-track-lead]', { timeout: 60000 });
    const text = await page.locator('body').innerText();
    for (const gone of [
      'Transformation Insights',
      'Event-driven Microservices',
      'TypeORM & HDI Integration',
      'XSUAA Security Pattern',
    ]) {
      expect(text, `${gone} came back`).not.toContain(gone);
    }
  });

  test('UX-027 · generated code is reported, not celebrated', async ({ page }) => {
    await page.goto(`/project/${BTP}/delivery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-integrity-icon]', { timeout: 60000 });
    const icon = page.locator('[data-integrity-icon="present"]');
    await expect(icon).toHaveCount(1);
    // Computed colour, not a class name: the point is what a reader sees beside
    // "not compiled or tested". Green is what a passed check earns. Tailwind v4
    // reports `oklch(...)`, so the browser resolves it to sRGB for us rather
    // than this spec re-implementing a colour space.
    const rgb = (el: Element) => {
      const colour = getComputedStyle(el).color;
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = Array.from(ctx.getImageData(0, 0, 1, 1).data);
      return { colour, r, g, b };
    };
    const readsAsSuccess = (p: { r: number; g: number; b: number }) => p.g > p.r + 24 && p.g > p.b + 24;
    const paint = await icon.evaluate(rgb);
    expect(
      readsAsSuccess(paint),
      `the unverified-code row is drawn in ${paint.colour}, which reads as success`,
    ).toBe(false);
    // The same reading for the other rows that only say "present": a coverage
    // figure the generator estimated and a blueprint nobody verified were still
    // drawn in the green of a passed check beside the neutral code row (UX
    // review of b88c77b, fc15ffd1018a). One vocabulary for the whole list.
    for (const kind of ['estimate', 'blueprint'] as const) {
      const row = page.locator(`[data-integrity-icon="${kind}"]`);
      await expect(row, `the ${kind} row is not on the page`).toHaveCount(1);
      const p = await row.evaluate(rgb);
      expect(readsAsSuccess(p), `the ${kind} row is drawn in ${p.colour}, which reads as success`).toBe(false);
    }
    // The sentence that states the limit stays where it was.
    await expect(page.locator('text=not compiled or tested').first()).toBeVisible();
  });

  test('UX-029 · the export says what it is, and the caveat is not on hover', async ({ page }) => {
    await page.goto(`/project/${BTP}/documentation`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-export-caveat]', { timeout: 60000 });
    const caveat = page.locator('[data-export-caveat]');
    await expect(caveat).toBeVisible();
    // Visible without a pointer: the old qualification lived in a tooltip, and
    // a phone or a tablet has no hover to give it.
    const opacity = await caveat.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeGreaterThan(0.5);
    await expect(caveat).toHaveText(/has not been verified yet/i);
    const text = await page.locator('body').innerText();
    for (const gone of ['BPMN-Compatible', 'SAP Build-Compatible']) {
      expect(text, `${gone} came back`).not.toContain(gone);
    }
  });

  test('UX-059 · the board does not offer to publish anything', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Open announcements', { timeout: 60000 });
    await page.click('text=Open announcements');
    await page.waitForSelector('[data-forum-readonly]', { timeout: 30000 });
    await expect(page.locator('[data-forum-readonly]')).toContainText('read-only');
    const text = await page.locator('body').innerText();
    for (const gone of [
      'Post to Forum',
      'Start Discussion',
      'Thread Posted Successfully',
      'it posts publicly to the board',
      'Like Post',
    ]) {
      expect(text, `${gone} came back`).not.toContain(gone);
    }
    // And no control that would take a post.
    await expect(page.locator('input[placeholder*="Transforming BAPI"]')).toHaveCount(0);
  });

  test('0613631545b2 · the routing panel does not invent checkpoints it never ran', async ({ page }) => {
    /*
     * The seeded analysis has no `extensibilityRouting` at all — the ordinary case
     * when the model returns none. Both this panel and the Confluence export used
     * to fill the gap with four complete checkpoints and a two-track comparison
     * written out in the source and selected by one boolean: whether the route
     * contains "BTP". The reader was shown a "Custom Technical Assessment" of
     * their own code that nothing had assessed.
     */
    await page.goto(`/project/${BTP}/analyze`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Modernization Strategy' }).click({ timeout: 60000 });
    await page.waitForSelector('text=Extensibility Decision Matrix', { timeout: 60000 });

    // One for the checkpoints, one for the track comparison: the panel says twice
    // that it has nothing, where it used to say twice that it had everything.
    await expect(page.locator('[data-not-determined]').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-not-determined]')).toHaveCount(2);

    const text = await page.locator('body').innerText();
    for (const invented of [
      'Transactional Coupling',
      'UI Paradigm & Customization',
      'Data & DB Proximity',
      'Lifecycle & Resource Scaling',
      'Zero latency database reads on core S/4HANA standard tables',
      'Highly Compatible',
      'Partially Compatible',
    ]) {
      expect(text, `"${invented}" was written out for an analysis that produced nothing`).not.toContain(invented);
    }
  });

  test('UX-084 · the first-run guide quotes the header it is describing', async ({ page }) => {
    // What the header actually renders for this account, read from the app.
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    const quota = page.locator('text=/\\d+ of \\d+ left/i').first();
    await quota.waitFor({ timeout: 60000 });
    const header = (await quota.innerText()).trim();
    expect(header.toLowerCase(), 'a fresh account has spent nothing').toBe('5 of 5 left');

    await page.goto('/first-run', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Sign in with the account you registered', { timeout: 60000 });
    const guide = (await page.locator('body').innerText()).toLowerCase();
    // Same direction, same words. "0 / 5 Transformations" was used-of-total,
    // against a header that has counted down since the dashboard and the
    // transformation stage were reconciled.
    expect(guide, 'the guide still quotes the quota the other way round').not.toContain('0 / 5 transformations');
    expect(guide, 'the guide must quote the header it describes').toContain(header.toLowerCase());
  });
});

test.describe('an account that has not finished signing up', () => {
  const EMAIL = `claims-onboarding-${STAMP}@cleancore-test.io`;

  test.beforeAll(async () => {
    // Deliberately no users/{uid} document: that is what makes UserOnboarding
    // render, and the cancel dialog is two clicks inside it.
    await createUserWithEmailAndPassword(emulatorAuth(), EMAIL, PASSWORD);
  });

  test('UX-076 · leaving the sign-up is not made a failure', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await signIn(page, EMAIL);
    await page.waitForSelector('text=Join the platform', { timeout: 60000 });
    // Two controls carry that name: the X in the header (title="Cancel")
    // and the button under the form. The finding cites the button.
    await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
    await page.waitForSelector('text=Leave the sign-up?', { timeout: 30000 });

    const text = await page.locator('body').innerText();
    for (const gone of [
      'fail to modernise',
      'What you will miss',
      'Developer Community Forum',
      'Stay & Claim Access',
    ]) {
      expect(text, `${gone} came back`).not.toContain(gone);
    }
    // And it says what actually happens instead.
    expect(text).toContain('Nothing is saved');
    // Backing out of the dialog returns to the form rather than only offering a
    // sign-out.
    await page.getByRole('button', { name: 'Back to sign-up' }).click();
    await expect(page.locator('text=Join the platform')).toBeVisible();
  });
});

test.describe('UX-026 · the Jira modal promises only what it can do', () => {
  /*
   * This one is read from source on purpose. `JiraIntegrationModal` is imported
   * by nothing — `grep -rn JiraIntegrationModal app components lib` finds only
   * its own definition — so no route renders it and a browser cannot reach it.
   * A finding about a screen nobody can open is still worth closing, because
   * the copy is a trap for whoever wires it up; it simply cannot be closed with
   * a rendered assertion. If it is ever mounted, replace this with a test that
   * opens it.
   */
  const visible = () => withoutComments(read('components/JiraIntegrationModal.tsx'));

  test('nothing promises issues it cannot create', () => {
    const s = visible();
    for (const gone of [
      'create Epics and User Stories in your Jira instance automatically',
      'Will create 1 Master Epic',
      'Sync Complete!',
      'transformed into detailed Epics and User stories in Jira',
      'Synchronizing Work Packages',
    ]) {
      expect(s, `${gone} came back`).not.toContain(gone);
    }
  });

  test('no invented board stands in for one it never read', () => {
    const s = visible();
    for (const gone of ['S/4HANA Core Team (S4CT)', 'BTP Innovation Hub (BTP)', 'Legacy Decommissioning (LEG)']) {
      expect(s, `${gone} came back`).not.toContain(gone);
    }
  });

  test('and it still says why the sync cannot run', () => {
    expect(read('components/JiraIntegrationModal.tsx')).toContain('not available yet');
  });
});

test.describe('UX-107 — a button does what it says', () => {
  // The approval panel shows "Access Denied" to anyone who is not a platform
  // administrator. Its only button used to read "Sign In as Admin" and sign the
  // reader out — the opposite of its label, on the page an operator reaches
  // exactly when they are in the wrong account. Asserted on the rendered page:
  // a source check would pass for a button whose label and handler live in two
  // components that disagree.
  const EMAIL = `claims-107-${STAMP}@cleancore-test.io`;

  test.beforeAll(async () => {
    const cred = await createUserWithEmailAndPassword(emulatorAuth(), EMAIL, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Not',
      lastName: 'Admin',
      email: EMAIL,
      tier: 'pilot',
      status: 'approved',
      transformationsUsed: 0,
      transformationsLimit: 5,
      createdAt: new Date(),
    });
  });

  test('the switch-account button signs out and opens sign-in, and says so', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, EMAIL);
    await page.goto('/admin/approve-tenant');

    const button = page.getByTestId('approve-tenant-switch-account');
    await expect(button, 'a non-administrator sees the switch-account button').toBeVisible({ timeout: 20_000 });

    const label = (await button.innerText()).toLowerCase();
    expect(label, 'the label names the sign-out it performs').toContain('sign out');
    expect(label, 'no label promises a sign-in the click does not perform').not.toMatch(/^\s*sign in\b/);

    await button.click();
    await page.waitForURL(/[?&]auth=signin/, { timeout: 20_000 });
    await expect(page.locator('input[type="email"]'), 'the sign-in dialog is open').toBeVisible({ timeout: 20_000 });
  });
});

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Roadmap 0.2, second pass — the QA full review of a19945ef01dc.
 *
 * Four more sentences and one mapping that said more than the product does.
 * Where a claim had no mechanism behind it the claim went, rather than its
 * wording: `/how-to` deleted its July screenshots for that reason, and the
 * showroom's green ticks follow them.
 * ─────────────────────────────────────────────────────────────────────────────
 */

test.describe('the public pages claim only what the product does', () => {
  test('fa9e39148077 · the showroom does not call its examples compiled, tested or verified', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const showroom = page.locator('#showroom');
    await expect(showroom).toBeVisible({ timeout: 60_000 });
    const text = await showroom.innerText();

    for (const gone of [
      'verified, compiled and tested',
      'CDS test environment created',
      '1 of 1 unit tests passed',
      'Service definition compiled',
      'Schema validated',
      'Verified against Clean-Core Engine',
    ]) {
      expect(text, `"${gone}" came back`).not.toContain(gone);
    }

    // And it says what these examples are instead.
    expect(text).toContain('nothing on this page was compiled or run');

    /*
     * The mechanism, not the six strings: no green success mark may stand beside
     * a word about compiling, testing or validating. That is what UX-027 took off
     * the delivery stage, and the same badge pattern had three copies here.
     * Computed colour, resolved to sRGB by the browser — Tailwind v4 reports
     * `oklch(...)`.
     */
    const greenClaims = await showroom.evaluate((root) => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      const green = (colour: string) => {
        ctx.fillStyle = colour;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = Array.from(ctx.getImageData(0, 0, 1, 1).data);
        return a > 0 && g > r + 24 && g > b + 24;
      };
      const claim = /\bcompiled\b|\bvalidated\b|\btests? passed\b|\bverified against\b/i;
      const negated = /\bnot\b[^.]{0,40}(compiled|run|tested|verified)|\bunverified\b/i;
      const out: string[] = [];
      for (const el of Array.from(root.querySelectorAll('*'))) {
        if (el.children.length > 0) continue;
        const t = (el.textContent || '').trim();
        if (!t || !claim.test(t) || negated.test(t)) continue;
        const style = getComputedStyle(el);
        if (green(style.color) || green(style.backgroundColor)) out.push(t.slice(0, 80));
      }
      return out;
    });
    expect(greenClaims, 'a green mark stands beside work the product never did').toEqual([]);
  });

  test('ce41dce9ccd5 · the whitepaper does not promise a compiled package', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/whitepaper', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#benefits-evidence')).toBeVisible({ timeout: 60_000 });
    const text = await page.locator('body').innerText();
    expect(text, 'there is no ABAP compiler in this product').not.toContain('compiled package');
    expect(text).toContain('to compile, activate and test in your own system');
  });
});

test.describe('0613631545b2 · the export writes no evidence the analysis never produced', () => {
test('0613631545b2 · and the Confluence export carries no invented evidence either', () => {
  /*
   * The export is a string built in a click handler and handed to the browser as
   * a download; there is no rendered surface to measure. So it is read from
   * source — but not for the sentences: for the four checkpoint names and the
   * pros and cons that only ever existed as a fallback. If the fallback comes
   * back, these strings come back with it.
   */
  for (const rel of [
    'app/(app)/project/[projectId]/analyze/page.tsx',
    'components/analyze/ExtensibilityDecisionMatrix.tsx',
  ]) {
    const s = withoutComments(read(rel));
    for (const invented of [
      'Transactional Coupling',
      'UI Paradigm & Customization',
      'Data & DB Proximity',
      'Lifecycle & Resource Scaling',
      'Zero latency database reads on core S/4HANA standard tables',
      'Absolute lifecycle isolation',
      "Perfect technical fit.",
    ]) {
      expect(s, `${rel} still writes "${invented}" where the analysis produced nothing`).not.toContain(invented);
    }
    // And the optional fields are read as optional, with no `||` standing by.
    expect(s, `${rel} fills in decisionTreeCheckpoints`).not.toMatch(/decisionTreeCheckpoints\s*\|\|/);
    expect(s, `${rel} fills in comparativeAnalysis`).not.toMatch(/comparativeAnalysis\s*\|\|/);
  }
  expect(withoutComments(read('app/(app)/project/[projectId]/analyze/page.tsx')), 'the export says so instead').toContain(
    'Not determined for this run',
  );
});
});

test.describe('62c08912d745 · a service guide names the client that service speaks', () => {
  /*
   * One rule matched `postgres || hana || database` and returned the PostgreSQL
   * record for all three, so "SAP HANA Cloud Database" handed an architect the
   * `pg` package and a PostgreSQL connection string. The guide is copyable; it
   * cannot connect. This is the routing function itself, which is what decides
   * the drawer's contents.
   */
  test('a HANA service gets HANA guidance, not the PostgreSQL package', () => {
    for (const name of ['SAP HANA Cloud Database', 'HANA Cloud', 'SAP HANA Cloud, HDI container']) {
      const d = getCloudServiceDetails(name);
      expect(d.npmPackages, `${name} was handed a PostgreSQL driver`).not.toContain('pg');
      expect(d.npmPackages, `${name} needs the SAP HANA client`).toContain('@sap/hana-client');
      expect(d.codeSnippet).not.toContain("require('pg')");
    }
  });

  test('PostgreSQL still gets PostgreSQL', () => {
    const d = getCloudServiceDetails('PostgreSQL on SAP BTP');
    expect(d.npmPackages).toContain('pg');
  });

  test('a service that only says "database" is not given a driver by guesswork', () => {
    const d = getCloudServiceDetails('Managed Database Service');
    expect(d.npmPackages, 'naming the wrong client is worse than naming none').toEqual(['@sap/xsenv']);
    expect(d.title).toBe('Cloud Service Binding Integration');
  });

  test('"S/4HANA" is the ERP system and never routes to a database guide', () => {
    for (const name of ['SAP S/4HANA Cloud', 'S/4HANA OData Service', 'S4HANA Extension']) {
      const d = getCloudServiceDetails(name);
      expect(d.npmPackages, `${name} was read as a database`).not.toContain('@sap/hana-client');
      expect(d.npmPackages, `${name} was read as a database`).not.toContain('pg');
    }
  });
});

test.describe('64a43c210f49 · the read-only board does not promise a discussion', () => {
  test('no topic of the board is called Q&A, and the lead says the posts are read-only', () => {
    // QA review of 4b4586aff273: the list is headed "Announcements" on a
    // read-only board, yet a "Technical Q&A" topic still filtered and badged a
    // post there — an offer of questions and answers nobody can join.
    const src = read('app/(app)/dashboard/page.tsx');
    expect(src).not.toMatch(/label: 'Technical Q&A'/);
    expect(src).not.toMatch(/⚙️ Technical Q&A/);
    expect(src).toContain('Read-only posts from the Clean-Core team, filed by topic.');
  });
});
