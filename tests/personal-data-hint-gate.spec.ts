import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { PERSONAL_DATA_HINT_TITLE } from '../components/PersonalDataHints';

/**
 * The personal-data hint on the upload screen: it says nothing it cannot say,
 * and nothing goes past it without a deliberate act.
 *
 * Two halves, and the second one is the one that cannot be talked out of a
 * failure. The first is a negative source guard, built the way
 * `tests/terms-duties-guard.spec.ts` is: the Terms and the Privacy Policy both
 * state that not uploading personal data is *"a rule we ask you to keep, not a
 * control we exercise"*, and that *"the Platform does not detect, screen,
 * filter or block personal data in an upload"*. A panel that claimed otherwise
 * would make both documents false the moment it rendered, so the sentences that
 * would claim it are listed here and must not appear.
 *
 * The second half opens the page. A control can be present in the source and
 * wired to nothing; the gate is only real if the button is actually shut until
 * the box is ticked — and opens when it is. The last test is the one that was
 * easiest to get wrong: the tick belongs to the lines it was made for, so
 * editing the source afterwards has to take it back rather than let an
 * acknowledgement of the old text stand for the new.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

const PANEL = 'components/PersonalDataHints.tsx';
const MODULE = 'lib/personal-data-hints.ts';
const ANALYZE = 'app/(app)/project/[projectId]/analyze/page.tsx';
const NEW_PROJECT = 'components/workspace/NewProject.tsx';
const USAGE_UPLOAD = 'components/analyze/UsageUpload.tsx';

/* ==================================================================== *
 * It claims no control it does not have.
 * ==================================================================== */

/**
 * Every phrase below would turn the rule into a control. They are written so
 * that they only fire near the words "personal data": the same screen says
 * "the staged code was scanned for command injections and plaintext secrets",
 * which is a different claim about a different thing and is true.
 */
const FORBIDDEN: RegExp[] = [
  /\b(?:we|it|this|the platform|clean-core\.io)\s+(?:detects?|checks?|scans?|screens?|filters?|blocks?|removes?|redacts?|strips?)[^.]{0,60}personal data/i,
  /(?:detects?|checks?|scans?|screens?|filters?|blocks?|removes?|redacts?|strips?)\s+(?:your |the |any |all )?personal data/i,
  /personal data (?:is|are|was|were|gets?|has been|have been)\s+(?:automatically\s+)?(?:detected|found|checked|scanned|screened|filtered|blocked|removed|redacted|stripped)/i,
  /\bpersonal data (?:detection|detector|scanner|screening|filtering|check)\b/i,
  /\b(?:we|it) found personal data\b/i,
  /\bthis (?:is|contains) personal data\b/i,
  /\bno personal data (?:was |were )?(?:found|detected)\b/i,
  // Completeness is the other claim it must not make.
  /\b(?:all|every|any) personal data (?:is|are|will be)\b/i,
];

/** JSX tags and entities flattened, so the check reads what a person reads. */
function prose(rel: string): string {
  return read(rel)
    .replace(/&apos;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/<[^<>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test.describe('the hint claims no control over uploads that the product does not have', () => {
  for (const rel of [PANEL, MODULE, ANALYZE, NEW_PROJECT, USAGE_UPLOAD]) {
    test(`${rel} says "looks like it may be", never "is"`, () => {
      const text = prose(rel);
      for (const claim of FORBIDDEN) {
        expect(
          text,
          `${rel} claims the Platform inspects an upload for personal data (${claim}). It does not — ` +
            'it knows a handful of shapes that often indicate it. The Terms and the Privacy Policy say ' +
            'so word for word, and tests/terms-duties-guard.spec.ts holds them to it.',
        ).not.toMatch(claim);
      }
    });
  }

  test('and the panel says out loud that it will miss things', () => {
    const text = prose(PANEL);
    expect(text, 'the panel no longer says it is a hint rather than a check').toContain(
      'This is a hint, not a check',
    );
    expect(text, 'the panel no longer admits it misses things').toMatch(/it will miss things/);
    expect(text, 'the panel no longer says the reader decides').toMatch(
      /decide for yourself|your call/,
    );
  });
});

test.describe('the hint is wired into every path a source takes into the product', () => {
  for (const rel of [ANALYZE, NEW_PROJECT, USAGE_UPLOAD]) {
    test(`${rel} asks before it sends`, () => {
      const src = read(rel);
      expect(src, `${rel} does not look at what it is about to upload`).toContain(
        'scanForPersonalDataHints',
      );
      expect(src, `${rel} renders no panel for what it found`).toContain('PersonalDataHints');
      // The tick is bound to the findings' key, not to a boolean somewhere. A
      // boolean survives an edit of the source; the key does not.
      expect(src, `${rel} holds the acknowledgement as a bare flag`).toContain(
        'personalDataHintKey',
      );
    });
  }
});

/* ==================================================================== *
 * And what the browser paints.
 * ==================================================================== */

const EMAIL = `pd-hint-${Date.now()}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `pd-hint-project-${Date.now()}`;

/** A real address in a real ABAP shape: a constant typed on `ADR6-SMTP_ADDR`. */
const SECRET_ADDRESS = 'hans.mueller@firma.de';
const LEGACY_CODE = [
  'REPORT z_personal_data_fixture.',
  '',
  `CONSTANTS c_mail TYPE adr6-smtp_addr VALUE '${SECRET_ADDRESS}'.`,
  '',
  'START-OF-SELECTION.',
  '  SELECT SINGLE * FROM vbak INTO @DATA(ls_vbak).',
  '  WRITE / c_mail.',
].join('\n');

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  const uid = cred.user.uid;
  await adminSetDoc('users', uid, {
    firstName: 'Personal', lastName: 'Data', email: EMAIL, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
  // Staged, not analysed: this is the upload screen, which is the only screen
  // where anything can still be taken back.
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Personal data hint fixture', userId: uid, createdAt: new Date(), status: 'uploaded',
    legacyCode: LEGACY_CODE,
  });
});

async function openUploadScreen(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', SIGN_IN);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(3500);
  await page.goto(`/project/${PROJECT_ID}/analyze`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-stage-title]', { timeout: 30000 });
}

/** The two things the upload screen already required before today. */
async function satisfyTheOlderGates(page: import('@playwright/test').Page) {
  await page.getByText('Public Cloud Edition').first().click();
  await page.locator('label:has-text("I agree to the") input[type="checkbox"]').check();
}

test('the lines are shown, and the address is not', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openUploadScreen(page);

  const panel = page.locator('[data-personal-data-hints="analyze-personal-data"]');
  await expect(panel, 'a staged source with an address in it produced no hint').toBeVisible({
    timeout: 30000,
  });
  await expect(panel).toContainText(PERSONAL_DATA_HINT_TITLE);
  await expect(panel.locator('[data-personal-data-hint="mail-address-field"]')).toHaveCount(1);
  await expect(panel).toContainText('Line 3');

  // The warning must not be a second copy of the thing it warns about.
  const shown = await panel.innerText();
  expect(shown, 'the hint printed the very address it is pointing at').not.toContain(SECRET_ADDRESS);
  expect(shown, 'nothing of the line is left to recognise it by').toContain('adr6-smtp_addr');

  // And the wording, as a reader meets it.
  for (const claim of FORBIDDEN) {
    expect(shown, `the rendered panel claims a control the product has not got (${claim})`).not.toMatch(
      claim,
    );
  }
});

test('the control is a real, labelled checkbox that the keyboard can reach', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openUploadScreen(page);

  const checkbox = page.locator('[data-personal-data-ack]');
  await expect(checkbox).toBeVisible({ timeout: 30000 });
  // An unlabelled control is the UX register's standing complaint; a `<label
  // htmlFor>` is what answers it, and the accessible name is what proves it.
  await expect(checkbox).toHaveAccessibleName(/I have checked these lines myself/);
  await checkbox.focus();
  await expect(checkbox).toBeFocused();
  // Nothing here traps focus: this is an inline panel, not a dialog, and Tab
  // leaves it the way it leaves any other part of the page.
  await page.keyboard.press('Tab');
  await expect(checkbox).not.toBeFocused();
});

test('the analysis does not start until somebody says they looked', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openUploadScreen(page);
  await expect(page.locator('[data-personal-data-ack]')).toBeVisible({ timeout: 30000 });
  await satisfyTheOlderGates(page);

  const start = page.getByRole('button', { name: /Start Analysis/ });
  await expect(
    start,
    'the target model and the Terms were both satisfied, so only the unacknowledged lines can be holding this shut',
  ).toBeDisabled();
  // And the screen says which step is missing rather than leaving a dead button.
  await expect(page.locator('body')).toContainText('look as though they may hold personal data');

  await page.locator('[data-personal-data-ack]').check();
  await expect(start, 'the acknowledgement did not open the way through').toBeEnabled();
});

test('the usage import asks the same question, and it matters more there', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openUploadScreen(page);

  // An SCMON export names the user who ran each object by construction. This
  // one does, in a column the parser is about to throw away — which is exactly
  // why the person has to see it before the file is handed over rather than
  // after.
  await page.locator('[data-usage-file]').setInputFiles({
    name: 'scmon.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('OBJECT_NAME;CALLS;LAST_USED;USER\nZSD_ORDERS;12;2026-04-05;MUELLERH\n'),
  });

  const panel = page.locator('[data-personal-data-hints="usage-personal-data"]');
  await expect(panel, 'a usage export with a user column produced no hint').toBeVisible({
    timeout: 30000,
  });
  await expect(panel.locator('[data-personal-data-hint="table-column"]')).toHaveCount(1);
  await expect(panel).toContainText('Column “USER”');
  // The heading is metadata; the value under it is not shown.
  expect(await panel.innerText(), 'the hint printed a user id out of the file').not.toContain(
    'MUELLERH',
  );

  const confirm = page.locator('[data-usage-confirm]');
  await expect(confirm, 'the import was open although nobody had looked').toBeDisabled();
  await panel.locator('[data-personal-data-ack]').check();
  await expect(confirm, 'the acknowledgement did not open the import').toBeEnabled();
});

test('editing the source afterwards takes the acknowledgement back', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openUploadScreen(page);
  await expect(page.locator('[data-personal-data-ack]')).toBeVisible({ timeout: 30000 });
  await satisfyTheOlderGates(page);
  await page.locator('[data-personal-data-ack]').check();

  const start = page.getByRole('button', { name: /Start Analysis/ });
  await expect(start).toBeEnabled();

  // A tick made for one set of lines must not cover a different set. The
  // textarea is editable after the file was dropped, which is exactly how a
  // personnel number gets pasted in after the box was ticked.
  await page.locator('textarea').fill(`${LEGACY_CODE}\nlv_pernr = '00010234'.`);

  await expect(
    page.locator('[data-personal-data-hint="personnel-number"]'),
    'the new line produced no hint of its own',
  ).toHaveCount(1);
  await expect(
    page.locator('[data-personal-data-ack]'),
    'the tick made for the old text still stood for the new text',
  ).not.toBeChecked();
  await expect(start, 'the analysis was still open after the source changed under the tick').toBeDisabled();
});
