import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { signInViaLanding } from './helpers/sign-in';
import {
  SHIPPED_CATALOG_SNAPSHOTS,
  canonicalAssessmentProfile,
  expectedCatalogKey,
  pinnedReleaseOptions,
  pinnedSnapshotForRelease,
  type AssessmentProfile,
} from '../lib/assessment-profile';
import { buildAssessmentProfile, declaredTargetOf, normaliseAssessmentTarget } from '../lib/assessment-target';
import { clearStartRelease, leaveStartRelease, startReleaseFor } from '../lib/start-release-handoff';
import { catalogProfile } from '../lib/it-view';
import { wt } from '../lib/workspace-messages';

/**
 * The release of a Private Edition project, asked where the project starts
 * (Sonny, 10.10.2026: "Release is never asked, so it is always 'not declared'.
 * Either we ask for it at the start, or it has no influence on the scores.").
 *
 * It has influence: a named Private Edition release selects SAP's
 * release-pinned list (`pinnedSnapshotForRelease`), which drives the levels and
 * the findings. So the start screens ask for it — optional, one select — and
 * the first signed run carries it as its `targetProfile`, the same field and
 * route "Change target" uses. For the Public Edition the release changes
 * nothing, and the target profile card says why instead of "not declared".
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

test.describe('the releases a start screen offers', () => {
  test('exactly the pinned lists this build ships, newest first, each reading back to its own list', () => {
    const options = pinnedReleaseOptions();
    const pinned = Array.from(SHIPPED_CATALOG_SNAPSHOTS).filter((k) => /^pce-\d{4}-\d+$/.test(k));
    expect(options.map((o) => o.snapshot).sort()).toEqual([...pinned].sort());
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      expect(pinnedSnapshotForRelease('private', o.value), o.value).toBe(o.snapshot);
      expect(expectedCatalogKey('private', o.value), o.value).toBe(o.snapshot);
      // A value the route accepts as a release, unchanged.
      const parsed = normaliseAssessmentTarget({ release: o.value });
      expect(parsed.ok && parsed.target.release).toBe(o.value);
    }
    expect(options.map((o) => o.value)).toContain('2023 FPS03');
    // Newest first.
    const order = options.map((o) => o.snapshot);
    expect(order[0]).toBe('pce-2025-1');
    expect(order[order.length - 1]).toBe('pce-2023-3');
  });

  test('"not sure" reads the moving list, and for the Public Edition no release pins anything', () => {
    expect(expectedCatalogKey('private', '')).toBe('pce-latest');
    expect(expectedCatalogKey('public', '2023 FPS03')).toBe('latest');
    expect(wt('tgt.releaseLatest')).toMatch(/^Not sure/);
  });

  test('both start screens ask for it, and hand it to the first run before the workspace opens', () => {
    expect(read('components/TargetEditionChoice.tsx')).toContain('pinnedReleaseOptions()');
    for (const file of ['components/StarterExamples.tsx', 'components/workspace/OwnCodeImport.tsx']) {
      const src = read(file);
      expect(src, file).toContain('onReleaseChange={setRelease}');
      expect(src, file).toContain("leaveStartRelease(docRef.id, edition === 'private' ? release : '')");
      expect(src.indexOf('leaveStartRelease(docRef.id'), file).toBeLessThan(src.indexOf('?first=1'));
      // Never a client write of the declared target: only the run route writes it.
      expect(src, file).not.toMatch(/assessmentTarget/);
    }
    const hook = read('hooks/useStartRun.ts');
    expect(hook).toContain('startReleaseFor(projectId)');
    expect(hook).toContain('clearStartRelease(projectId)');
  });
});

test.describe('the release left by the start', () => {
  test('is the one project\'s, survives a failed start and is gone once the run is signed', () => {
    leaveStartRelease('p1', ' 2023 FPS03 ');
    expect(startReleaseFor('p2')).toBe('');
    expect(startReleaseFor('p1')).toBe('2023 FPS03');
    expect(startReleaseFor('p1'), 'read, not taken — a failed start can try again').toBe('2023 FPS03');
    clearStartRelease('p2');
    expect(startReleaseFor('p1')).toBe('2023 FPS03');
    clearStartRelease('p1');
    expect(startReleaseFor('p1')).toBe('');
    leaveStartRelease('p3', '');
    expect(startReleaseFor('p3')).toBe('');
  });

  test('builds the same profile as the release set with Change target', () => {
    // The start sends { ...declaredTargetOf(project), release }; Change target
    // sends the dialog's parsed target. Both reach the route as `targetProfile`
    // and are normalised by the same function.
    const fromStart = normaliseAssessmentTarget({ ...declaredTargetOf({}), release: '2023 FPS03' });
    const fromChange = normaliseAssessmentTarget({ release: '2023 FPS03', components: [], languageVersions: [] });
    expect(fromStart).toEqual(fromChange);
    if (!fromStart.ok) throw new Error('not parsed');
    const profile = buildAssessmentProfile({
      edition: 'private',
      target: fromStart.target,
      objects: ['Z_X'],
      catalogSnapshot: { registryKey: expectedCatalogKey('private', fromStart.target.release)!, sourceSha256: 'abc' },
      ruleVersion: 'rules-v1.0',
    });
    expect(profile.release).toBe('2023 FPS03');
    expect(profile.catalogSnapshot.registryKey).toBe('pce-2023-3');
  });

  test('the canonical form of a profile without a release is unchanged', () => {
    // The card's wording changed; the signed form did not.
    const p: AssessmentProfile = {
      profileVersion: 1,
      edition: 'private',
      release: '',
      components: [],
      catalogSnapshot: { registryKey: 'pce-latest', sourceSha256: '8c703dc8' },
      ruleVersion: 'rules-v1.0',
      languageVersions: [{ object: 'Z_X', languageVersion: 'unknown' }],
    };
    expect(canonicalAssessmentProfile(p)).toBe(
      'v1|edition=private|release=|catalog=pce-latest@8c703dc8|rule=rules-v1.0|components=|languages=Z_X:unknown',
    );
  });
});

test.describe('the target profile card no longer says "not declared"', () => {
  test('Public Edition: the release does not matter, and the card says why', () => {
    const p = catalogProfile({ edition: 'public', release: '' }, true, { registryKey: 'latest', sourceSha256: 'abc' });
    expect(p.release).toBeNull();
    expect(p.releaseMatters).toBe(false);
    expect(wt('it.releasePublic')).toContain('SAP upgrades every Public Cloud tenant');
  });

  test('Private Edition without a release: what is read instead, and the way to set it', () => {
    const p = catalogProfile({ edition: 'private', release: '' }, true, { registryKey: 'pce-latest', sourceSha256: 'abc' });
    expect(p.releaseMatters).toBe(true);
    expect(wt('it.releaseLatest')).toBe('Not set — SAP’s latest list is used.');
    const rail = read('components/workspace/ItRail.tsx');
    expect(rail).not.toContain("'it.notDeclared'");
    expect(rail).toContain('placement="release"');
    expect(read('lib/workspace-messages.ts') + read('lib/messages/workspace-answers.ts')).not.toContain("'it.notDeclared'");
  });
});

/* ------------------------------------------------------- rendered (needs the server) */

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const auth = getAuth(app);
try {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'StartRelease123!';

test.describe('an example started for Private Edition 2023 FPS03', () => {
  test('is signed against the pinned 2023 FPS03 list, and the card names the release', async ({ page }) => {
    test.setTimeout(360 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    const email = `start-release-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Start', lastName: 'Release', email,
      tier: 'pilot', status: 'approved', activatedAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
      transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
      modelStages: { analyze: false, naming: false, statements: false },
    });
    await signInViaLanding(page, email, PASSWORD);

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 90000 });
    const list = page.locator('[data-cc-workspace]');
    await expect(list).toBeVisible({ timeout: 90000 });
    const choice = list.locator('[data-target-edition-choice]');
    await expect(choice).toHaveAttribute('data-target-edition', 'private');
    const releaseChoice = choice.locator('[data-target-release-choice]');
    await expect(releaseChoice, 'asked for the Private Edition').toBeVisible();
    await expect(releaseChoice.locator('select')).toHaveValue('');
    await releaseChoice.locator('select').selectOption('2023 FPS03');
    await expect(releaseChoice).toHaveAttribute('data-target-release', '2023 FPS03');
    // Not asked for the Public Edition — it changes nothing there.
    await choice.locator('[data-target-edition-option="public"]').click();
    await expect(choice.locator('[data-target-release-choice]')).toHaveCount(0);
    await choice.locator('[data-target-edition-option="private"]').click();
    await expect(releaseChoice).toHaveAttribute('data-target-release', '2023 FPS03');

    const start = list.locator('[data-example-start="Z_MATERIAL_STOCK_CALC"]').first();
    if (!(await start.isVisible().catch(() => false))) {
      await list.locator('[data-examples-more] button').first().click({ timeout: 60000 });
    }
    await start.click({ timeout: 60000 });

    await page.waitForURL(/\/project\/[^/?]+\?first=1/, { timeout: 120000 });
    const projectId = new URL(page.url()).pathname.split('/')[2];
    await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 120000 });

    await expect
      .poll(async () => {
        const p = await adminGetDoc('projects', projectId);
        return p?.activeRunId ? (p.assessmentTarget as { release?: string } | undefined)?.release ?? '' : null;
      }, { timeout: 90000 })
      .toBe('2023 FPS03');
    const project = (await adminGetDoc('projects', projectId))!;
    const run = await adminGetDoc(`projects/${projectId}/runs`, project.activeRunId as string);
    const profile = run?.assessmentProfile as { release?: string; catalogSnapshot?: { registryKey?: string } } | undefined;
    expect(profile?.release).toBe('2023 FPS03');
    expect(profile?.catalogSnapshot?.registryKey).toBe('pce-2023-3');

    await page.goto(`/project/${projectId}?view=it`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const row = page.locator('[data-it-profile-release]');
    await expect(row).toHaveAttribute('data-it-profile-release', 'set', { timeout: 90000 });
    await expect(row).toHaveText('2023 FPS03');
  });
});

// QA review of d939fb5b056b (2e9381bd0cbd, 4b0d3c0f1b32): the own-code start was
// held by source text only. The same walk as above, from the upload screen.
test.describe('own code imported for Private Edition 2023 FPS03', () => {
  test('is signed against the pinned 2023 FPS03 list', async ({ page }) => {
    test.setTimeout(360 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    const email = `start-release-own-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Own', lastName: 'Release', email,
      tier: 'pilot', status: 'approved', isAdmin: true, activatedAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
      transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
      modelStages: { analyze: false, naming: false, statements: false },
    });
    await signInViaLanding(page, email, PASSWORD);

    await page.goto('/admin/new-project/upload', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await expect(page.locator('[data-cc-own-code]')).toBeVisible({ timeout: 60000 });
    await page.locator('[data-own-code-input]').setInputFiles([
      { name: 'Z_MM_PO_APPROVAL.abap', mimeType: 'text/plain', buffer: Buffer.from(read('public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8') },
    ]);
    await expect(page.locator('[data-own-code-file]')).toHaveCount(1);

    const choice = page.locator('[data-cc-own-code] [data-target-edition-choice]');
    await expect(choice).toHaveAttribute('data-target-edition', 'private');
    const releaseChoice = choice.locator('[data-target-release-choice]');
    await expect(releaseChoice, 'asked for the Private Edition').toBeVisible();
    await releaseChoice.locator('select').selectOption('2023 FPS03');
    await expect(releaseChoice).toHaveAttribute('data-target-release', '2023 FPS03');

    const ack = page.locator('[data-personal-data-hints] input[type="checkbox"]');
    if (await ack.count()) await ack.check();
    await expect(page.locator('[data-own-code-start]')).toBeEnabled({ timeout: 30000 });
    await page.click('[data-own-code-start]');

    await page.waitForURL(/\/project\/[^/?]+\?first=1/, { timeout: 120000 });
    const projectId = new URL(page.url()).pathname.split('/')[2];
    await expect
      .poll(async () => {
        const p = await adminGetDoc('projects', projectId);
        return p?.activeRunId ? (p.assessmentTarget as { release?: string } | undefined)?.release ?? '' : null;
      }, { timeout: 120000 })
      .toBe('2023 FPS03');
    const project = (await adminGetDoc('projects', projectId))!;
    const run = await adminGetDoc(`projects/${projectId}/runs`, project.activeRunId as string);
    const profile = run?.assessmentProfile as { release?: string; catalogSnapshot?: { registryKey?: string } } | undefined;
    expect(profile?.release).toBe('2023 FPS03');
    expect(profile?.catalogSnapshot?.registryKey).toBe('pce-2023-3');
    expect(run?.runHash, 'the run is signed').toBeTruthy();
  });
});
