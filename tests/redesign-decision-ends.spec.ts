import { test, expect } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';

/**
 * ADR-145 (decide in one go), rendered: the Decide page (`/project/[id]/redesign`, was Re-design). Nothing is
 * pre-selected and the one button cannot be clicked to no effect; one choice, one reason where it departs from the
 * indication, one dialog that lists what is recorded, one `decide` command; then the result, which ends for an option
 * that builds nothing. The step model is covered server-free in `redesign-way-on.spec.ts`, the command in
 * `decide-command.spec.ts`.
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

test.describe('Decide rendered: one choice, one dialog, and a Retire that ends the walk', () => {
  // One owner and one project for both tests, in order: the second reads what the first left.
  test.describe.configure({ mode: 'serial' });
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

  test('nothing pre-selected, no button without effect; choose Retire with a reason, one dialog, and the walk ends', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, OWNER, PASSWORD);
    await page.goto(`/project/${ID}/redesign`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-decide-state="choosing"]')).toBeVisible({ timeout: 90000 });

    // Nothing is pre-selected, and the one button is disabled until a click would record something.
    await expect(page.locator('[data-decide-option][aria-checked="true"]')).toHaveCount(0);
    const record = page.locator('[data-decide-record]');
    await expect(record).toBeDisabled({ timeout: 60000 });
    await expect(page.locator('[data-decide-bar-summary]')).toContainText('Choose one of the four options.');
    // The cost line is a simulation, priced before any figure is entered.
    await expect(page.locator('[data-decide-cost] [data-family-chip="simulation"]')).toBeVisible();

    // Retire is not the indication here, so the reason is required before the button records anything.
    await page.locator('[data-decide-option="retire"]').click();
    await expect(page.locator('[data-decide-option="retire"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-decide-needs="nothing-built"] [data-decide-follows]')).toContainText('Nothing is built.');
    await expect(record).toBeDisabled();
    await page.locator('[data-decide-reason] textarea').fill('Nobody has run it since the plant closed; we switch it off.');
    await expect(record).toBeEnabled({ timeout: 60000 });

    // One dialog, listing what is recorded; nothing is written until it is confirmed.
    await record.click();
    const box = page.getByRole('dialog');
    await expect(box).toContainText('Record: Retire?');
    await expect(box.locator('[data-decide-dialog-lines]')).toContainText('Retire: nothing is built');
    await expect(box.locator('[data-decide-dialog-lines]')).toContainText('Bound to the signed run');
    await expect(box.locator('[data-decide-dialog-lines]')).toContainText('Your reason: “Nobody has run it since the plant closed; we switch it off.”');
    await expect(box).toContainText('A self-declaration by the signed-in account, not an organisational mandate.');
    await box.getByRole('button', { name: 'Record the decision', exact: true }).click();

    // The result: decided, nothing built, Design optional, nothing waiting.
    await expect(page.locator('[data-decide-state="decided"][data-decide-result-option="retire"]')).toBeVisible({ timeout: 90000 });
    await expect(page.locator('#decide-answer')).toContainText('Decided: Retire. Nothing is built.');
    await expect(page.locator('#decide-answer')).toContainText('Nothing is waiting.');
    const next = page.locator('[data-decide-next="design-optional"]');
    await expect(next).toHaveText('Read the switch-off list in Design');
    await expect(page.locator('#decide-answer').getByRole('link', { name: 'Open Design' })).toHaveCount(0);

    // A reload reads the same from the record: nothing here is held in the page.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-decide-state="decided"][data-decide-result-option="retire"]')).toBeVisible({ timeout: 90000 });

    // Withdraw: back to choosing, and the earlier choice is named, never pre-selected.
    await page.locator('[data-decide-withdraw]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Withdraw the decision', exact: true }).click();
    await expect(page.locator('[data-decide-state="choosing"]')).toBeVisible({ timeout: 90000 });
    await expect(page.locator('[data-decide-earlier]')).toContainText('Retire was chosen earlier and never recorded.');
    await expect(page.locator('[data-decide-option][aria-checked="true"]')).toHaveCount(0);
  });

  test('Rebuild: the route and the business questions come with the decision; a contract that blocks it is said before a click', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, OWNER, PASSWORD);
    await page.goto(`/project/${ID}/redesign`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-decide-state="choosing"]')).toBeVisible({ timeout: 90000 });
    await page.locator('[data-decide-option="rebuild"]').click();
    await expect(page.locator('[data-decide-needs="rebuild"] [data-decide-route]')).toBeVisible();
    await expect(page.locator('[data-decide-needs="rebuild"] [data-decide-questions]')).toBeVisible();
    // This source writes EKPO directly: its architecture contract carries a blocking limit, so a Rebuild on the
    // contract's route cannot be confirmed. The bar says so and the button stays closed: no click without effect, and
    // no click the server refuses. (The Rebuild dialog's lines are held server-free in decide-page.spec.ts.)
    const record = page.locator('[data-decide-record]');
    await expect(page.locator('[data-decide-bar-summary]')).toContainText('A limit of the architecture contract blocks a Rebuild on this route', { timeout: 60000 });
    await expect(record).toBeDisabled();
    await expect(page.locator('[data-decide-state="choosing"]')).toBeVisible();
  });
});
