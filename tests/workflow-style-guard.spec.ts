import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { stageBackLink, workspaceBackHref } from '../lib/workspace-back-href';

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
 *
 * Block D (D.9, E-3, ADR-050) moved the one header from the landing scale
 * (30–36 px / 900) to the workspace's: a stage title stands like the project
 * title — `DESIGN.md` §2.3, 22 px / 800, `-0.02em`, `--cc-ink`, as the `h1` —
 * with "Back to workspace" above it and any icon neutral, without the green
 * bubble. "All seven equal" alone would stay green if all seven drifted
 * together, so the rendered test also pins the values themselves.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

// All seven, including Economics: the rendered comparison used to visit six and
// the test was still called "on all seven", so a TCO-specific ancestor or
// stylesheet could move that title's colour, size, case or spacing unnoticed
// (QA review of 33471220d6e9, bcbe2c770c8a).
const STAGES = ['analyze', 'design', 'transformation', 'documentation', 'testing', 'tco', 'delivery'];

test.describe('one stage header, defined once', () => {
  test('no stage writes its own title', () => {
    const offenders: string[] = [];
    for (const stage of STAGES) {
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
    // The title role of §1.2 and the ink, on the h1 — not a size of its own.
    expect(header).toMatch(/<h1\s+data-stage-title\s+className="[^"]*\bcc-text-title\b[^"]*\btext-cc-ink\b/);
    // Code only: the doc comment keeps the measured history, class names included.
    const code = header.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code, 'StageHeader writes a size, weight or ink of its own').not.toMatch(
      /\bfont-black\b|\btext-(?:[2-9]xl|gray-\d+|slate-\d+)\b|\bbg-green-/,
    );
    // The way back, above the title (§2.3).
    expect(header).toContain('Back to workspace');
    expect(code.indexOf('data-stage-back')).toBeGreaterThan(-1);
    expect(code.indexOf('data-stage-back')).toBeLessThan(code.indexOf('data-stage-title'));
  });

  test('the cc-text-title role is 22 px / 800 / -0.02em (DESIGN.md §1.2, §2.3)', () => {
    const css = read('app/globals.css');
    const role = css.match(/@utility cc-text-title\s*\{([^}]*)\}/);
    expect(role, 'app/globals.css has no cc-text-title role').not.toBeNull();
    expect(role![1]).toMatch(/font-size:\s*22px/);
    expect(role![1]).toMatch(/font-weight:\s*800/);
    expect(role![1]).toMatch(/letter-spacing:\s*-0\.02em/);
  });

  test('the documentation stage has one name (UX-169)', () => {
    // The stepper's label is the title: `stage=` reads it from `PHASES`.
    const src = read('app/(app)/project/[projectId]/documentation/page.tsx');
    expect(src).toContain('<StageHeader stage="documentation"');
    expect(src).not.toContain('Process Blueprint &amp; Mapping');
    expect(read('lib/workflow-steps.ts')).toContain("{ n: 4, key: 'documentation', label: 'Documentation' }");
  });
});

test.describe('every stage renders its title identically', () => {
  const EMAIL = `stagestyle-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'StageStyle123!';
  const PROJECT_ID = `stage-style-${Date.now()}`;
  const RUN_ID = `stage-style-run-${Date.now()}`;

  test.beforeAll(async () => {
    // Look for the DEFAULT app rather than "any app", and hand it to getAuth
    // explicitly. `if (!getApps().length) initializeApp(...)` followed by a bare
    // `getAuth()` fails with "No Firebase App '[DEFAULT]' has been created" when
    // an earlier spec in the same worker left a *named* app in the registry: the
    // list is non-empty, so initialisation is skipped, and the default the
    // argument-less getAuth() looks for was never created. It only shows up when
    // this file runs late in a full suite, which is the worst way to find out.
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
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

    // DESIGN.md §2.3 — the values themselves, not only their agreement.
    // -0.02em of 22 px is -0.44px; rgb(11, 28, 48) is --cc-ink.
    const WANT: Record<string, string> = {
      tag: 'H1', fontSize: '22px', fontWeight: '800', letterSpacing: '-0.44px', textTransform: 'none', color: 'rgb(11, 28, 48)',
    };

    const seen: { stage: string; key: string }[] = [];
    const offSpec: string[] = [];
    for (const stage of STAGES) {
      await page.goto(`/project/${PROJECT_ID}/${stage}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-stage-title]', { timeout: 30000 });
      const title = page.locator('[data-stage-title]').first();
      const m = await title.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          key: [s.fontSize, s.fontWeight, s.fontFamily, s.letterSpacing, s.textTransform, s.color].join(' | '),
          values: {
            tag: el.tagName, fontSize: s.fontSize, fontWeight: s.fontWeight,
            letterSpacing: s.letterSpacing, textTransform: s.textTransform, color: s.color,
          } as Record<string, string>,
        };
      });
      seen.push({ stage, key: m.key });
      for (const [prop, value] of Object.entries(WANT)) {
        if (m.values[prop] !== value) offSpec.push(`${stage}: ${prop} ${m.values[prop]}, §2.3 wants ${value}`);
      }

      // "Back to workspace" above the title — a link, not a button.
      const back = page.locator('[data-stage-back]');
      await expect(back, `${stage} has no way back to the workspace`).toHaveCount(1);
      await expect(back).toHaveText(/Back to workspace/);
      expect(await back.evaluate((el) => el.tagName), `${stage}: the way back is not a link`).toBe('A');
      // …and it leads where its kind says (QA 472315d93455, e5483b2e4ca7).
      const kind = await back.getAttribute('data-stage-back');
      const href = await back.getAttribute('href');
      expect(href, `${stage}: "Back to workspace" leads to ${href}`).toBe(
        kind === 'workspace' ? `/project/${encodeURIComponent(PROJECT_ID)}` : '/dashboard',
      );
      const backBox = await back.boundingBox();
      const titleBox = await title.boundingBox();
      expect(
        Boolean(backBox && titleBox && backBox.y + backBox.height <= titleBox.y),
        `${stage}: "Back to workspace" is not above the title`,
      ).toBe(true);

      // An icon, where a stage has one, stands neutral: no surface, 20 px, --cc-ink-muted.
      const icon = page.locator('[data-stage-icon]');
      if (await icon.count()) {
        const look = await icon.first().evaluate((el) => {
          const svg = el.querySelector('svg');
          return {
            background: getComputedStyle(el).backgroundColor,
            width: svg ? getComputedStyle(svg).width : 'no svg',
            color: svg ? getComputedStyle(svg).color : 'no svg',
          };
        });
        if (look.background !== 'rgba(0, 0, 0, 0)') offSpec.push(`${stage}: the icon sits on a surface (${look.background})`);
        if (look.width !== '20px') offSpec.push(`${stage}: the icon is ${look.width} wide, §2.3 wants 20px`);
        if (look.color !== 'rgb(75, 85, 99)') offSpec.push(`${stage}: the icon is ${look.color}, §2.3 wants --cc-ink-muted`);
      }
    }

    const distinct = [...new Set(seen.map((s) => s.key))];
    expect(
      distinct,
      `stage titles disagree:\n${seen.map((s) => `${s.stage.padEnd(15)} ${s.key}`).join('\n')}`,
    ).toHaveLength(1);
    expect(offSpec, `stage headers off DESIGN.md §2.3:\n${offSpec.join('\n')}`).toEqual([]);
  });
});

test.describe('"Back to workspace" leads to the view and layer the stage was opened from (QA 472315d93455, e5483b2e4ca7)', () => {
  test('view and layer are kept, anything unknown is dropped, no workspace means the dashboard', () => {
    expect(workspaceBackHref({ projectId: 'p-1', shell: true, search: '?view=it&from=it-answers-heading' })).toBe(
      '/project/p-1?view=it#it-answers-heading',
    );
    expect(workspaceBackHref({ projectId: 'p-1', shell: true, search: '' })).toBe('/project/p-1');
    // A view the workspace does not know, and a layer id that is not an id, are dropped.
    expect(workspaceBackHref({ projectId: 'p-1', shell: true, search: '?view=admin&from=%3Cscript%3E' })).toBe('/project/p-1');
    expect(workspaceBackHref({ projectId: 'p 1', shell: true, search: '' })).toBe('/project/p%201');
    // Without the workspace switch /project/[id] is a 404 — the way back is the dashboard.
    expect(workspaceBackHref({ projectId: 'p-1', shell: false, search: '?view=it' })).toBe('/dashboard');
  });

  test('the link waits for the profile, so a workspace account is never sent to the dashboard (f8d5367e0a00, ba5d2cdeda03)', () => {
    // While the profile loads, every account reads as having no workspace: the
    // header must hold the place, not offer a way that may be the wrong one.
    expect(stageBackLink({ projectId: 'p-1', profileLoading: true, shell: false, search: '?view=it' })).toEqual({ kind: 'pending' });
    expect(stageBackLink({ projectId: 'p-1', profileLoading: false, shell: true, search: '?view=it' })).toEqual({
      kind: 'link', href: '/project/p-1?view=it', to: 'workspace',
    });
    expect(stageBackLink({ projectId: 'p-1', profileLoading: false, shell: false, search: '' })).toEqual({
      kind: 'link', href: '/dashboard', to: 'dashboard',
    });
    expect(stageBackLink({ projectId: '', profileLoading: false, shell: true, search: '' })).toEqual({ kind: 'none' });
    // …and the header renders from that decision, not from a second copy of it.
    const src = fs.readFileSync(path.join(process.cwd(), 'components/StageHeader.tsx'), 'utf8');
    expect(src).toContain('const back = stageBackLink({ projectId, profileLoading, shell, search });');
    expect(src).not.toContain('workspaceBackHref(');
  });
});
