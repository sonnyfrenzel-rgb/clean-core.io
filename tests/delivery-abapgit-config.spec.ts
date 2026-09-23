import { test, expect, type Page } from '@playwright/test';
import os from 'os';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';

/**
 * The ABAP Cloud delivery bundle has to survive the one thing it exists for.
 *
 * A customer downloads this ZIP in order to import it. abapGit reads its
 * repository configuration from `.abapgit.xml` — with the leading dot — and the
 * documented element set is MASTER_LANGUAGE, STARTING_FOLDER and FOLDER_LOGIC
 * (plus the optional IGNORE list):
 * https://docs.abapgit.org/user-guide/repo-settings/dot-abapgit.html
 *
 * The bundle used to ship `abapgit.xml`, which abapGit does not read, carrying
 * `START_CLASS`/`VERSION`, which are not fields of that file — and `START_CLASS`
 * was hard-wired to `ZCL_DEMO_RAP_TEST`, a class out of an unrelated demo, in
 * every customer's package. The README called the result "fully
 * abapGit-compliant".
 *
 * This guard runs the real download in the real application and opens the
 * archive that came out, because the interesting failure — a name that is one
 * character off — looks exactly like success from the source.
 */

const STAMP = Date.now();
const EMAIL = `abapgit-${STAMP}@cleancore-test.io`;
const PASSWORD = 'AbapGitCfg123!';
const PROJECT_ID = `abapgit-cfg-${STAMP}`;

function emulatorAuth() {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch {
    /* already connected in this worker */
  }
  return auth;
}

async function signIn(page: Page) {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

test.describe('the ABAP Cloud bundle a customer imports', () => {
  test.beforeAll(async () => {
    const cred = await createUserWithEmailAndPassword(emulatorAuth(), EMAIL, PASSWORD);
    const uid = cred.user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'AbapGit',
      lastName: 'Config',
      email: EMAIL,
      tier: 'pilot',
      status: 'approved',
      transformationsUsed: 0,
      transformationsLimit: 5,
      createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'abapGit configuration',
      userId: uid,
      createdAt: new Date(),
      status: 'documented',
      extensibilityRoute: 'In-App (ABAP Cloud)',
      originalRecommendation: 'In-App (ABAP Cloud)',
      legacyCode: 'REPORT z_abapgit_cfg.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n',
      analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
      cleanCoreScore: 62,
      solutionDesign: '# Target architecture\n\nOne paragraph.\n',
      generatedCode: JSON.stringify([
        { path: 'src/zcl_cfg_behavior.clas.abap', content: 'CLASS zcl_cfg DEFINITION.\nENDCLASS.\n' },
      ]),
      testCases: [{ id: 't1', name: 'Case', category: 'Unit', status: 'Passed' }],
      coverageEstimate: { percentage: 73 },
      documentation: JSON.stringify({
        l3_flow: [{ id: 'Task_1', name: 'Check stock', type: 'task', role: 'Clerk' }],
      }),
      activeRunId: `${PROJECT_ID}-run`,
    });
    await adminSetDoc(`projects/${PROJECT_ID}/runs`, `${PROJECT_ID}-run`, {
      runId: `${PROJECT_ID}-run`,
      projectId: PROJECT_ID,
      userId: uid,
      createdAt: new Date().toISOString(),
      status: 'completed',
      cleanCoreScore: 62,
      extensibilityRoute: 'In-App (ABAP Cloud)',
    });
  });

  test('ships .abapgit.xml, in the documented shape, with no demo class in it', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await signIn(page);

    await page.goto(`/project/${PROJECT_ID}/delivery`, { waitUntil: 'domcontentloaded' });
    const button = page.locator('button[data-handover-bundle]');
    await button.waitFor({ state: 'visible', timeout: 60000 });
    await expect(button, 'the handover is blocked, so this spec would prove nothing').toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      button.click(),
    ]);
    const produced = path.join(os.tmpdir(), `cc-abapgit-${STAMP}.zip`);
    await download.saveAs(produced);

    const zip = await JSZip.loadAsync(fs.readFileSync(produced));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

    // The name is the whole finding: abapGit reads the dotted one and ignores
    // the other, so a bundle carrying `abapgit.xml` fails at import.
    expect(names, 'the bundle does not carry .abapgit.xml').toContain('.abapgit.xml');
    expect(names, 'the undotted name abapGit never reads is back').not.toContain('abapgit.xml');

    const config = await zip.file('.abapgit.xml')!.async('string');

    // The documented element set.
    for (const element of ['MASTER_LANGUAGE', 'STARTING_FOLDER', 'FOLDER_LOGIC']) {
      expect(config, `.abapgit.xml has no <${element}>`).toContain(`<${element}>`);
    }
    // And the two that are not fields of this file at all.
    for (const invented of ['START_CLASS', '<VERSION>']) {
      expect(config, `.abapgit.xml still carries ${invented}`).not.toContain(invented);
    }
    // No class out of somebody else's demo inside a customer's package.
    expect(config, 'a demo class is shipped in every customer bundle').not.toContain('ZCL_DEMO_RAP_TEST');

    // The starting folder has to be the folder the sources are actually in,
    // otherwise abapGit links the repository and finds nothing.
    expect(config).toContain('<STARTING_FOLDER>/src/</STARTING_FOLDER>');
    expect(
      names.some((n) => n.startsWith('src/')),
      'nothing is under /src/, so the starting folder points at an empty tree',
    ).toBe(true);

    // The README is the other half of the promise, and it has to match.
    const readme = await zip.file('README.md')!.async('string');
    expect(readme, 'the README names a file the bundle does not contain').not.toMatch(/(?<!\.)\babapgit\.xml\b/);
    expect(readme, 'the README names .abapgit.xml nowhere').toContain('.abapgit.xml');
    expect(
      readme,
      'the README claims a compliance nobody verified — no import into SAP was ever run',
    ).not.toMatch(/fully abapGit-compliant/i);
    expect(
      readme,
      'the README does not say that the bundle was never import-verified',
    ).toMatch(/not been verified|not.*verified/i);
  });
});
