import { test, expect, type Page } from '@playwright/test';
import { pathToFileURL } from 'url';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { adminMergeDoc, adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';

/**
 * Not a test — a capture run for design work.
 *
 * Proposing UX changes from reading JSX is guesswork. This seeds one fully
 * populated project, signs in, and photographs every screen a user passes
 * through, at desktop and phone width, so the proposals rest on what is actually
 * rendered.
 *
 * Skipped by default: it writes files and costs a couple of minutes. Run it with
 *   CAPTURE_SCREENS=1 npx playwright test tests/capture-screens.spec.ts
 * Output lands in `design-capture/`, which is gitignored.
 *
 * The UX review agent (docs/UX-REVIEW-AGENT.md) runs the same capture with
 *   CAPTURE_OUT=<dir>        where the pictures go
 *   CAPTURE_SEGMENTS=3       screen-height pictures from the top instead of one full-page picture —
 *                            a 12,000-pixel page scaled down for a model is unreadable
 *   CAPTURE_DARK=1           the signed-in overview screens once more in the dark theme
 *   CAPTURE_MOCKUPS=1        the six views of the 3.0 target mockups (docs/roadmap)
 * File names are the contract with scripts/ux/lib/config.mjs (SHOT_NAME).
 */
const ENABLED = process.env.CAPTURE_SCREENS === '1';

const OUT = process.env.CAPTURE_OUT ? path.resolve(process.env.CAPTURE_OUT) : path.resolve(__dirname, '..', 'design-capture');
const SEGMENTS = Math.max(0, Math.min(3, Number(process.env.CAPTURE_SEGMENTS || 0)));
const DARK = process.env.CAPTURE_DARK === '1';
const MOCKUPS = process.env.CAPTURE_MOCKUPS === '1';
const DARK_SCREENS = ['02-dashboard', '03-analyze', '08-delivery'];
const EMAIL = `capture-${Date.now()}@cleancore-test.io`;
const PASSWORD = 'CapturePassword123!';
const PROJECT_ID = `capture-project-${Date.now()}`;
const RUN_ID = `capture-run-${Date.now()}`;

/** A realistic-looking analysis payload — the shape the pages parse. */
const ANALYSIS = JSON.stringify({
  cleanCoreScore: 62,
  extensibilityRouting: 'Side-by-Side (SAP BTP)',
  standardFit: {
    potential: 'Medium',
    targetStandardProcess: 'SAP S/4HANA Sales — Credit Management (FSCM)',
    rationale:
      'Most of the custom credit check duplicates Advanced Credit Management. The residual scoring rule has no standard equivalent and belongs side-by-side on BTP.',
  },
  gaps: [
    { title: 'Custom credit scoring rule', detail: 'No released equivalent; candidate for a BTP microservice.' },
    { title: 'Direct VBAK/VBAP reads', detail: 'Re-point to released CDS views.' },
  ],
  plainEnglishActionPlan: [
    'Confirm with the business whether SAP FSCM covers the credit case.',
    'Re-point the three direct table reads to released views.',
    'Move the residual scoring rule side-by-side.',
  ],
});

const WORKLIST = [
  { id: 'w1', title: 'Re-point VBAK read to I_SalesDocument', status: 'open', severity: 'High' },
  { id: 'w2', title: 'Re-point VBAP read to I_SalesDocumentItem', status: 'open', severity: 'High' },
  { id: 'w3', title: 'Credit scoring rule — architect decision', status: 'open', severity: 'Medium' },
];

const LEGACY = `REPORT zcredit_check.
DATA: ls_order TYPE vbak,
      lt_items TYPE STANDARD TABLE OF vbap.

SELECT SINGLE * FROM vbak INTO ls_order WHERE vbeln = p_vbeln.
SELECT * FROM vbap INTO TABLE lt_items WHERE vbeln = p_vbeln.

CALL FUNCTION 'CREDIT_LIMIT_CHECK'
  EXPORTING kunnr = ls_order-kunnr.

WRITE: / 'Credit check complete.'.
`;

const SCREENS: { name: string; url: string; wait?: string }[] = [
  { name: '01-landing', url: '/' },
  { name: '02-dashboard', url: '/dashboard' },
  { name: '03-analyze', url: `/project/${PROJECT_ID}/analyze` },
  { name: '04-design', url: `/project/${PROJECT_ID}/design` },
  { name: '05-transformation', url: `/project/${PROJECT_ID}/transformation` },
  { name: '06-testing', url: `/project/${PROJECT_ID}/testing` },
  { name: '07-documentation', url: `/project/${PROJECT_ID}/documentation` },
  { name: '08-delivery', url: `/project/${PROJECT_ID}/delivery` },
  { name: '09-tco', url: `/project/${PROJECT_ID}/tco` },
  { name: '10-knowledge', url: '/knowledge' },
  { name: '11-settings', url: '/settings' },
  { name: '12-catalog', url: '/catalog' },
  { name: '13-whitepaper', url: '/whitepaper' },
  { name: '14-how-to', url: '/how-to' },
  { name: '15-trust', url: '/trust' },
];

/**
 * One full-page picture, or up to SEGMENTS screen-height pictures from the top.
 * App pages scroll inside a container rather than the document, so the largest
 * scrollable element is what gets scrolled.
 */
async function shoot(page: Page, base: string): Promise<string[]> {
  if (!SEGMENTS) {
    await page.screenshot({ path: `${base}.jpg`, fullPage: true, type: 'jpeg', quality: 72 });
    return [`${base}.jpg`];
  }
  const scrollTo = (y: number) =>
    page.evaluate((top) => {
      const root = document.scrollingElement as HTMLElement;
      const scrollables = [root, ...Array.from(document.querySelectorAll<HTMLElement>('main, div, section'))].filter(
        (el) => el && el.scrollHeight > el.clientHeight + 20 && (el === root || /(auto|scroll)/.test(getComputedStyle(el).overflowY)),
      );
      const target = scrollables.sort((a, b) => b.clientHeight - a.clientHeight)[0];
      if (!target) return { height: 0, view: window.innerHeight };
      target.scrollTop = top;
      return { height: target.scrollHeight, view: target.clientHeight };
    }, y);
  const files: string[] = [];
  const { height, view } = await scrollTo(0);
  for (let i = 0; i < SEGMENTS && (i === 0 || i * view < height); i++) {
    if (i) {
      await scrollTo(i * view);
      await page.waitForTimeout(500);
    }
    const file = `${base}-s${i + 1}.jpg`;
    await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
    files.push(file);
  }
  await scrollTo(0);
  return files;
}

test.describe('capture', () => {
  test.skip(!ENABLED, 'set CAPTURE_SCREENS=1 to run');
  test.describe.configure({ mode: 'serial' });

  test('photograph every screen a user passes through', async ({ page }) => {
    test.setTimeout(600 * 1000);
    fs.mkdirSync(OUT, { recursive: true });

    // ── seed ──────────────────────────────────────────────────────────────
    if (!getApps().length) initializeApp(firebaseConfig);
    const auth = getAuth();
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }

    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = cred.user.uid;

    await adminSetDoc('users', uid, {
      firstName: 'Design',
      lastName: 'Capture',
      email: EMAIL,
      tier: 'pilot',
      status: 'approved',
      transformationsUsed: 1,
      transformationsLimit: 5,
      authMethod: 'password',
      createdAt: new Date(),
    });

    await adminSetDoc('projects', PROJECT_ID, {
      name: 'ZCREDIT_CHECK — Credit Management',
      userId: uid,
      createdAt: new Date(),
      status: 'documented',
      legacyCode: LEGACY,
      analysis: ANALYSIS,
      cleanCoreScore: 62,
      complexityScore: 48,
      criticalityScore: 71,
      extensibilityRoute: 'Side-by-Side (SAP BTP)',
      s4Deployment: 'private',
      worklist: WORKLIST,
      activeRunId: RUN_ID,
      generatedCode: JSON.stringify({
        'srv/credit-check.ts': "export async function checkCredit(customerId: string) {\n  // …\n}\n",
        'db/schema.cds': 'entity CreditDecision { key ID : UUID; customer : String; }\n',
      }),
      testCases: [
        { id: 't1', name: 'Credit limit within bounds', category: 'Unit', status: 'Passed' },
        { id: 't2', name: 'Credit limit exceeded', category: 'Unit', status: 'Passed' },
        { id: 't3', name: 'Missing customer master', category: 'Edge', status: 'Failed' },
      ],
      documentation: '# Credit Check — Solution Blueprint\n\n## Level 1 — Business context\n\nThe custom credit check runs before order confirmation…\n',
      updatedAt: new Date(),
    });

    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      runId: RUN_ID,
      projectId: PROJECT_ID,
      userId: uid,
      createdAt: new Date().toISOString(),
      status: 'completed',
      cleanCoreScore: 62,
      extensibilityRoute: 'Side-by-Side (SAP BTP)',
      analysis: ANALYSIS,
      worklist: WORKLIST,
      legacyCode: LEGACY,
    });

    // ── sign in ───────────────────────────────────────────────────────────
    const notes: string[] = [];
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    // The access dialog is the first thing a new user fills in.
    await page.waitForTimeout(800);
    // One picture only: scrolling would move the page behind the dialog, not the dialog.
    const access = path.join(OUT, '00-access-desktop.jpg');
    await page.screenshot({ path: access, type: 'jpeg', quality: 72 });
    notes.push(`00-access-desktop.jpg  ${Math.round(fs.statSync(access).size / 1024)} KB  access dialog`);
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(4000);

    // ── capture ───────────────────────────────────────────────────────────
    const capture = async (screens: typeof SCREENS, label: string) => {
      for (const screen of screens) {
        try {
          await page.goto(screen.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
          // Let motion/react settle and any client fetch land.
          await page.waitForTimeout(3500);
          for (const file of await shoot(page, path.join(OUT, `${screen.name}-${label}`))) {
            notes.push(`${path.basename(file)}  ${Math.round(fs.statSync(file).size / 1024)} KB  ${page.url()}`);
          }
        } catch (err) {
          notes.push(`${screen.name}-${label}  FAILED  ${String(err instanceof Error ? err.message : err).slice(0, 120)}`);
        }
      }
    };
    for (const viewport of [
      { label: 'desktop', width: 1440, height: 1000 },
      { label: 'phone', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await capture(SCREENS, viewport.label);
    }

    if (DARK) {
      // The theme comes from the profile, so the profile is what changes.
      await adminMergeDoc('users', uid, { theme: 'dark' });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await capture(SCREENS.filter((s) => DARK_SCREENS.includes(s.name)), 'dark');
    }

    if (MOCKUPS) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(pathToFileURL(path.resolve(__dirname, '..', 'docs', 'roadmap', 'clean-core-mockups-v2_7.html')).href);
      for (let view = 1; view <= 6; view++) {
        try {
          await page.click(`button[data-s="s${view}"]`);
          await page.waitForTimeout(600);
          const file = path.join(OUT, `m${view}-mockup-desktop.jpg`);
          await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
          notes.push(`${path.basename(file)}  ${Math.round(fs.statSync(file).size / 1024)} KB  mockup view ${view}`);
        } catch (err) {
          notes.push(`m${view}-mockup-desktop  FAILED  ${String(err instanceof Error ? err.message : err).slice(0, 120)}`);
        }
      }
    }

    fs.writeFileSync(path.join(OUT, 'index.txt'), notes.join('\n') + '\n');
    console.log('\n' + notes.join('\n') + '\n');

    // The capture is only useful if the workflow screens actually rendered.
    const captured = fs.readdirSync(OUT).filter((f) => f.endsWith('.jpg'));
    expect(captured.length).toBeGreaterThan(SCREENS.length);
  });
});
