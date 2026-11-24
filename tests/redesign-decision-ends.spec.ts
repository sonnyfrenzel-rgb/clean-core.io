import { test, expect } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';

/**
 * 3.5.1 (decision-flow S1), rendered: after a decision that builds nothing the Re-design walk ends. Before, Retire,
 * Keep and Move to SAP standard marked only Transformation to Delivery "Not needed" while Design stayed "Not started",
 * so the page's one primary action read "Open Design" for ever. The step model is covered server-free in
 * `redesign-way-on.spec.ts`; this walks the real page: choose Retire, confirm it, and read what the page says then.
 *
 * Needs the emulators and a server (`npx playwright test` as in CI).
 */
const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'DecisionEnds123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SOURCE = `REPORT z_decision_ends.
DATA: lt_ekpo TYPE TABLE OF ekpo.
SELECT * FROM ekpo INTO TABLE lt_ekpo.
UPDATE ekpo SET loekz = 'L' WHERE ebeln = '1'.
CALL FUNCTION 'BAPI_PO_CREATE1'.
`;

test.describe('S1 rendered: a confirmed Retire ends the Re-design walk', () => {
  const OWNER = `${unique('decision-ends')}@cleancore-test.io`;
  const ID = unique('decision-ends');

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, OWNER, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Decision', lastName: 'Ends', email: OWNER,
      tier: 'pilot', status: 'approved', activatedAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', ID, {
      name: 'Decision ends', userId: cred.user.uid, createdAt: new Date(), status: 'analyzed',
      legacyCode: SOURCE, s4Deployment: 'private', activeRunId: 'run-1',
    });
    await adminSetDoc(`projects/${ID}/runs`, 'run-1', {
      runId: 'run-1', userId: cred.user.uid, createdAt: '2026-10-01T10:00:00.000Z', cleanCoreScore: 58,
      rulesetVersion: 'rules-v1.0', analyzerVersion: '2.9.0', sapApiCatalogVersion: 'cat-2026-08',
    });
  });

  test('choose Retire, confirm it: Design to Delivery read "Not needed", the action opens the decision', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, OWNER, PASSWORD);
    await page.goto(`/project/${ID}/redesign`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-decision-options]')).toBeVisible({ timeout: 90000 });

    // Choose Retire (the reason is asked because it is not the indicated option).
    await page.locator('[data-option-choose="retire"]').click();
    const choose = page.getByRole('dialog');
    await choose.getByRole('textbox').fill('Nobody has run it since the plant closed; we switch it off.');
    await choose.getByRole('button', { name: 'Choose this option' }).click();
    await expect(page.locator('[data-decision-option="retire"][data-option-chosen]')).toBeVisible({ timeout: 60000 });

    // Chosen, not confirmed: the decision is still the step that waits, and the walk has not ended.
    await expect(page.locator('[data-redesign-step="design"] [data-redesign-step-words]')).toHaveText('Not needed once Retire is confirmed');
    await expect(page.locator('[data-redesign-done]')).toHaveCount(0);

    // Confirm it.
    const confirm = page.locator('[data-decision-confirm]');
    await expect(confirm).toBeEnabled({ timeout: 60000 });
    await confirm.click();
    const box = page.getByRole('dialog');
    await box.getByRole('button', { name: 'Confirm decision', exact: true }).click();
    await expect(page.locator('[data-decision-withdraw]')).toBeVisible({ timeout: 60000 });

    // The walk ends: nothing after the decision waits, and the one action is never "Open Design".
    for (const key of ['design', 'transformation', 'documentation', 'testing', 'delivery']) {
      const row = page.locator(`[data-redesign-step="${key}"]`);
      await expect(row, key).toHaveAttribute('data-redesign-step-state', 'not-needed', { timeout: 60000 });
      await expect(row.locator('[data-redesign-step-words]'), key).toHaveText('Not needed: Retire builds nothing');
    }
    await expect(page.locator('[data-redesign-step="decide"]')).toHaveAttribute('data-redesign-step-state', 'done');
    const next = page.locator('[data-redesign-next]');
    await expect(next).toHaveAttribute('data-redesign-next', 'decide');
    await expect(next).toHaveAttribute('data-redesign-done', '');
    await expect(next).toHaveText('Open the decision');
    await expect(next).toHaveAttribute('href', '#decide');
    await expect(page.locator('#redesign-answer')).toContainText('Decided: Retire. Nothing is built, so Re-design is done.');
    await expect(page.locator('#redesign-answer')).toContainText('Done. Retire builds nothing, so no step is waiting.');
    // The answer card's action is the decision, not Design (an option card may still link to Design as a place).
    await expect(page.locator('#redesign-answer').getByRole('link', { name: 'Open Design' })).toHaveCount(0);

    // A reload reads the same from the record: nothing here is held in the page.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-redesign-next]')).toHaveAttribute('data-redesign-done', '', { timeout: 90000 });
    await expect(page.locator('[data-redesign-step="design"]')).toHaveAttribute('data-redesign-step-state', 'not-needed');
  });
});
