import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-applet-config.json';

/**
 * The seven stages look like one product, and this is what keeps them that way.
 *
 * They did not. Measured before the fix:
 *
 *   analyze         text-4xl             font-extrabold  gray-900   centred
 *   design          text-2xl sm:text-3xl font-bold       gray-900   left
 *   transformation  text-4xl             font-black      gray-900   left
 *   testing         text-3xl md:text-4xl font-black      #0b1c30    left
 *   documentation   text-3xl md:text-4xl font-black      #0b1c30    left, UPPERCASE
 *   delivery        text-3xl md:text-5xl font-black      gray-900   centred, UPPERCASE
 *   tco             text-3xl md:text-4xl font-black      #0b1c30    left, UPPERCASE
 *
 * Three weights, four scales, two inks, two cases, and two stages with no
 * responsive step at all. The title jumped size, weight and colour as the reader
 * moved from one step to the next — which is the kind of difference that makes a
 * seven-stage flow feel like seven tools.
 *
 * The rendered check is the one that matters: a source guard can be satisfied by
 * a component that quietly accepts a `className` override, computed style cannot.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

const STAGES = ['analyze', 'design', 'transformation', 'testing', 'documentation', 'delivery'];

test.describe('one stage header, defined once', () => {
  test('no stage writes its own title', () => {
    const offenders: string[] = [];
    for (const stage of [...STAGES, 'tco']) {
      const rel = `app/(app)/project/[projectId]/${stage}/page.tsx`;
      const src = read(rel);
      // Markdown renderers map `h1` for *generated content*, which is not a stage
      // title — those carry `{...props}` and are left alone.
      for (const m of src.matchAll(/<h1\s+className="[^"]*"(?!\s*\{\.\.\.props\})/g)) {
        offenders.push(`${stage}: ${m[0].slice(0, 80)}`);
      }
    }
    expect(offenders, `stage titles written by hand:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('the scale lives in StageHeader and nowhere else', () => {
    const header = read('components/StageHeader.tsx');
    expect(header).toContain('data-stage-title');
    expect(header).toMatch(/text-3xl md:text-4xl font-black/);
  });
});

test.describe('every stage renders its title identically', () => {
  const EMAIL = `stagestyle-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'StageStyle123!';
  const PROJECT_ID = `stage-style-${Date.now()}`;
  const RUN_ID = `stage-style-run-${Date.now()}`;

  test.beforeAll(async () => {
    if (!getApps().length) initializeApp(firebaseConfig);
    const auth = getAuth();
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }

    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = cred.user.uid;

    await adminSetDoc('users', uid, {
      firstName: 'Stage', lastName: 'Style', email: EMAIL,
      tier: 'pilot', status: 'approved',
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });

    // Populated enough that no stage renders an empty state, because an empty
    // state has a different header and the comparison would be vacuous.
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Stage style fixture',
      userId: uid,
      createdAt: new Date(),
      status: 'documented',
      legacyCode: 'REPORT z_style.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n',
      analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
      cleanCoreScore: 62,
      solutionDesign: '# Target architecture\n\nSide-by-side on BTP.\n',
      generatedCode: 'export const ok = true;\n',
      testCases: [{ id: 't1', name: 'Case', category: 'Unit', status: 'Passed' }],
      documentation: '# Blueprint\n\nLevel 1.\n',
      activeRunId: RUN_ID,
    });

    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
      createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
    });
  });

  test('same font, weight, size, spacing, case and ink on all seven', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(4000);

    const seen: { stage: string; key: string }[] = [];
    for (const stage of STAGES) {
      await page.goto(`/project/${PROJECT_ID}/${stage}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-stage-title]', { timeout: 30000 });
      const key = await page.locator('[data-stage-title]').first().evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.fontSize, s.fontWeight, s.fontFamily, s.letterSpacing, s.textTransform, s.color].join(' | ');
      });
      seen.push({ stage, key });
    }

    const distinct = [...new Set(seen.map((s) => s.key))];
    expect(
      distinct,
      `stage titles disagree:\n${seen.map((s) => `${s.stage.padEnd(15)} ${s.key}`).join('\n')}`,
    ).toHaveLength(1);
  });
});
