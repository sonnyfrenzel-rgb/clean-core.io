import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID, TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';
import { STARTER_EXAMPLES } from '../lib/starter-examples';
import { sha256Hex, artefactDigest, buildSourceChangeRecord } from '../lib/artefact-digest';
import { projectTarget, targetChangeImpact, targetChangeNotice, targetWords } from '../lib/target-change';
import { describeRunCost } from '../lib/run-cost';
import type { Project } from '../lib/types';

/**
 * The owner's target change in the IT view's profile box (owner, 06.10.2026):
 * edition and release can be changed after the first choice; the change is
 * asked, said before the click, and made as a new signed run.
 *
 * Three halves: the pure preview and notice (`lib/target-change.ts`), the
 * source rule that the profile box still writes no field itself, and the
 * rendered path — an example started as Private, changed to Public in the IT
 * view, with the run, the box, the Management view and the account's quota
 * checked afterwards.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/* ------------------------------------------------------------ the pure half */

const SOURCE = 'REPORT z_target.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';
const signedProject = (over: Partial<Project> & Record<string, unknown> = {}): Project =>
  ({
    userId: 'u1',
    name: 'Target',
    legacyCode: SOURCE,
    activeRunId: 'run-1',
    s4Deployment: 'private',
    assessmentTarget: { release: '2023 FPS03', components: [], languageVersions: [] },
    auditMetadata: { inputFingerprint: { sha256: sha256Hex(SOURCE) } },
    ...over,
  }) as unknown as Project;

test.describe('what a target change does, said before the click', () => {
  test('the target in words', () => {
    expect(targetWords(projectTarget(signedProject()))).toBe('Private Edition 2023 FPS03');
    expect(targetWords({ edition: 'public', release: '' })).toBe('Public Edition');
    // Absent means the Public Edition, as the route has always read it.
    expect(projectTarget({}).edition).toBe('public');
  });

  test('nothing built: nothing becomes outdated', () => {
    expect(targetChangeImpact(signedProject())).toEqual({ outdated: [], decision: null });
  });

  test('a design and a sign-off become outdated, and the decision is named', () => {
    const impact = targetChangeImpact(
      signedProject({
        solutionDesign: '# Design\nRebuild as RAP.',
        approvedByArchitect: true,
        architectSignOffAt: '2026-10-01T10:00:00.000Z',
        targetArchitecture: 'rap',
        decision: { status: 'confirmed', decisionId: 'DEC-1', boundRunId: 'run-1' },
      }),
    );
    expect(impact.outdated.map((t) => t.key)).toContain('design');
    expect(impact.decision).toEqual({ status: 'confirmed', id: 'DEC-1' });
  });

  test('a decision already bound to an earlier run is not named as made outdated', () => {
    // QA review of 1c402c400e05: it was already outdated before the change.
    const impact = targetChangeImpact(
      signedProject({ decision: { status: 'confirmed', decisionId: 'DEC-1', boundRunId: 'run-0' } }),
    );
    expect(impact.decision).toBeNull();
  });

  test('the cost: free for an example, free as re-analysis for own code', () => {
    const profile = { tier: 'pilot', transformationsUsed: 2, transformationsLimit: 5, starterExamplesUsed: { Z_X: true } };
    expect(describeRunCost({ profile, metered: true, callsModel: false, starterExample: 'Z_X', targetChange: true }).quota).toBe(
      'Free — changing the target of an example',
    );
    expect(describeRunCost({ profile, metered: true, callsModel: false, sameSourceAgain: true }).quota).toMatch(/^Free/);
    // Without the target change, a further start of an example costs a run, as before.
    expect(describeRunCost({ profile, metered: true, callsModel: false, starterExample: 'Z_X' }).quota).toMatch(/^Uses 1/);
  });
});

test.describe('after the change, the profile box says what changed', () => {
  const changed = (over: Record<string, unknown> = {}) =>
    signedProject({
      activeRunId: 'run-2',
      s4Deployment: 'public',
      assessmentTarget: { release: '', components: [], languageVersions: [] },
      auditMetadata: {
        inputFingerprint: { sha256: sha256Hex(SOURCE) },
        sourceChange: {
          at: '2026-10-06T09:00:00.000Z',
          runId: 'run-2',
          previousSha256: sha256Hex(SOURCE),
          artefacts: {},
          reason: 'profile',
          previousTarget: { edition: 'private', release: '2023 FPS03' },
        },
      } as never,
      ...over,
    });

  test('from, to and the day, while it is recent', () => {
    const notice = targetChangeNotice(changed(), Date.parse('2026-10-06T12:00:00.000Z'));
    expect(notice).toMatchObject({ day: '2026-10-06', from: 'Private Edition 2023 FPS03', to: 'Public Edition' });
  });

  test('a decision read from the earlier run is named as outdated', () => {
    const notice = targetChangeNotice(
      changed({ decision: { status: 'confirmed', decisionId: 'DEC-1', boundRunId: 'run-1' } }),
      Date.parse('2026-10-20T12:00:00.000Z'),
    );
    expect(notice?.decisionOutdated).toBe(true);
  });

  test('nothing once another run is the project’s, or when nothing is left outdated and it is old', () => {
    const later = changed();
    (later as unknown as { activeRunId: string }).activeRunId = 'run-3';
    expect(targetChangeNotice(later, Date.parse('2026-10-06T12:00:00.000Z'))).toBeNull();
    expect(targetChangeNotice(changed(), Date.parse('2026-10-20T12:00:00.000Z'))).toBeNull();
  });
});

test.describe('the profile box still writes no field itself', () => {
  test('the change goes through the signed run and nothing else', () => {
    const change = read('components/workspace/TargetChange.tsx');
    expect(change).toContain('signEngineRun(');
    for (const forbidden of ['setDoc', 'updateDoc', 'addDoc', "'/api/runs/create'", 'runProjectCommand']) {
      expect(change, `TargetChange.tsx reaches ${forbidden}`).not.toContain(forbidden);
    }
    // Offered to the owner only, never in the demo.
    expect(change).toMatch(/project\.userId === uid/);
    expect(read('components/workspace/ItRail.tsx')).toMatch(/demo \? null : <TargetChangeButton/);
  });
});

/* ------------------------------------------------------------ the rendered half */

const clientApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const clientAuth = getAuth(clientApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const db = () => {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
};

const PASSWORD = 'TargetChange123!';
const EXAMPLE = STARTER_EXAMPLES.find((e) => e.name === 'Z_MATERIAL_STOCK_CALC')!;
const SHOTS = path.resolve(ROOT, 'test-results', 'target-change');

async function goto(page: Page, url: string) {
  await page.evaluate(() => window.stop()).catch(() => {});
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  } catch {
    await page.waitForTimeout(1500);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  }
}

/** An account with an example project, signed once as Private 2023 FPS03 — free, its first run. */
async function seedExample(prefix: string, request: import('@playwright/test').APIRequestContext) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;
  const cred = await createUserWithEmailAndPassword(clientAuth, email, PASSWORD);
  const uid = cred.user.uid;
  await adminSetDoc('users', uid, {
    firstName: 'Target', lastName: 'Change', email,
    tier: 'pilot', status: 'approved', activatedAt: new Date(),
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
    transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
    // Engine-only, as a start with the model off (owner default 3).
    modelStages: { analyze: false, naming: false, statements: false },
  });
  const projectId = `target-change-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const legacyCode = read(`public/starter-examples/${EXAMPLE.file}`).replace(/^﻿/, '');
  await adminSetDoc('projects', projectId, {
    userId: uid, name: EXAMPLE.name, fromExample: true, status: 'created', createdAt: new Date(), legacyCode,
  });
  const token = await cred.user.getIdToken();
  const res = await request.post('/api/runs/create', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { projectId, s4Deployment: 'private', targetProfile: { release: '2023 FPS03' }, analysis: '', uploadedFileName: EXAMPLE.file },
  });
  expect(res.status(), await res.text()).toBe(200);
  return { email, uid, projectId };
}

test.describe('changing the target in the IT view', () => {
  test('Private → Public: asked, said, signed, and free for an example', async ({ page, request }) => {
    test.setTimeout(300 * 1000);
    const { email, uid, projectId } = await seedExample('tgt', request);
    const before = (await db().collection('users').doc(uid).get()).data()!;
    expect(before.starterExamplesUsed?.[EXAMPLE.name], 'the first run was the free one').toBe(true);

    await signInViaLanding(page, email, PASSWORD);
    await goto(page, `/project/${projectId}?view=it`);
    const open = page.locator('[data-target-change-open]');
    await expect(open, 'the owner is offered the change').toBeVisible({ timeout: 90000 });
    await expect(page.locator('[data-it-profile]')).toContainText('Private Edition');

    await open.click();
    const dialog = page.locator('[data-target-change-dialog] [role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator('[data-target-change-current]')).toHaveText('Private Edition 2023 FPS03');
    // Unchanged, the dialog does not continue.
    await expect(page.locator('[data-target-change-next]')).toBeDisabled();
    await page.locator('[data-target-edition-option="public"]').click();
    await expect(page.locator('[data-target-change-next]')).toBeEnabled();
    await page.locator('[data-target-change-next]').click();

    // Step 2 — what the change does, before the click.
    await expect(page.locator('[data-target-change-next-target]')).toHaveText('Public Edition');
    await expect(page.locator('[data-target-change-moves]')).toContainText('Private Edition 2023 FPS03 → Public Edition', { timeout: 60000 });
    await expect(page.locator('[data-target-change-cost]')).toContainText('Free — changing the target of an example');
    // The confirmation waits for the account's model answer: analysis stage off, so no model call.
    await expect(page.locator('[data-target-change-confirm]')).toBeEnabled({ timeout: 30000 });
    await expect(page.locator('[data-target-change-cost]')).toContainText('No model call');

    fs.mkdirSync(SHOTS, { recursive: true });
    await dialog.screenshot({ path: path.join(SHOTS, 'dialog-desktop.png') });

    await page.locator('[data-target-change-confirm]').click();
    // The page reloads onto the new run, and the box says what changed.
    const notice = page.locator('[data-target-change-notice]');
    await expect(notice).toContainText('Target changed from Private Edition 2023 FPS03 to Public Edition', { timeout: 120000 });
    await expect(page.locator('[data-it-profile]')).toContainText('Public Edition');
    // The Public Edition has no release to choose, and the row says why instead of "not declared".
    await expect(page.locator('[data-it-profile-release]')).toHaveAttribute('data-it-profile-release', 'current');
    await expect(page.locator('[data-it-profile-release]')).toContainText('SAP upgrades every Public Cloud tenant');

    const project = (await db().collection('projects').doc(projectId).get()).data()!;
    expect(project.s4Deployment).toBe('public');
    const run = (await db().collection('projects').doc(projectId).collection('runs').doc(project.activeRunId).get()).data()!;
    expect(run.assessmentProfile?.edition).toBe('public');
    expect(run.metering).toBe('target-change');
    // The account's analysis stage is off: the run is the engine's reading alone.
    expect(run.modelParticipation).toBe('none');
    expect(project.auditMetadata?.sourceChange?.reason).toBe('profile');

    const after = (await db().collection('users').doc(uid).get()).data()!;
    expect(after.transformationsUsed ?? 0, 'the change spent no analysis run').toBe(before.transformationsUsed ?? 0);

    // Management reads the new target.
    await goto(page, `/project/${projectId}?view=management`);
    // The distance to SAP standard is read on the target edition (its title
    // names it); the second bucket card that used to say it went (ADR-087).
    await expect(page.locator('#standard-fit[data-standard-fit="ready"] h3')).toContainText('Public Edition', { timeout: 90000 });
  });

  test('on a phone the dialog fits and cancel changes nothing', async ({ page, request }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 390, height: 844 });
    const { email, projectId } = await seedExample('tgt-phone', request);
    const runBefore = (await db().collection('projects').doc(projectId).get()).data()!.activeRunId;

    await signInViaLanding(page, email, PASSWORD);
    await goto(page, `/project/${projectId}?view=it`);
    await page.locator('[data-target-change-open]').click({ timeout: 90000 });
    await page.locator('[data-target-edition-option="public"]').click();
    await page.locator('[data-target-change-next]').click();
    await expect(page.locator('[data-target-change-cost]')).toContainText('Free');
    await expect(page.locator('[data-target-change-moves]')).toBeVisible({ timeout: 60000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'dialog-phone.png') });

    await page.locator('[data-target-change-cancel]').click();
    await expect(page.locator('[data-target-change-dialog]')).toHaveCount(0);
    const project = (await db().collection('projects').doc(projectId).get()).data()!;
    expect(project.activeRunId, 'cancel started no run').toBe(runBefore);
    expect(project.s4Deployment).toBe('private');
  });
});

/*
 * Roadmap 3.0.6, left open by the 3.0.5 QA loop: the notice after a target
 * change lists only the tools *that* change made outdated. A design already
 * outdated by an earlier change is not news of this one.
 */
test.describe('the notice names only what this change made outdated', () => {
  const DESIGN = '# Design\nRebuild as RAP.';
  const DOCS = '# Documentation\nWhat the report does.';
  const recordWith = (alreadyOutdated?: string[]) =>
    signedProject({
      activeRunId: 'run-2',
      s4Deployment: 'public',
      assessmentTarget: { release: '', components: [], languageVersions: [] },
      solutionDesign: DESIGN,
      documentation: DOCS,
      auditMetadata: {
        inputFingerprint: { sha256: sha256Hex(SOURCE) },
        sourceChange: {
          at: '2026-10-06T09:00:00.000Z',
          runId: 'run-2',
          previousSha256: sha256Hex(SOURCE),
          artefacts: {
            solutionDesign: artefactDigest('solutionDesign', DESIGN),
            documentation: artefactDigest('documentation', DOCS),
          },
          reason: 'profile',
          previousTarget: { edition: 'private', release: '2023 FPS03' },
          ...(alreadyOutdated ? { alreadyOutdated } : {}),
        },
      } as never,
    });
  const NOW = Date.parse('2026-10-06T12:00:00.000Z');

  test('a tool outdated before the change is left out, the one this change outdated is named', () => {
    const notice = targetChangeNotice(recordWith(['solutionDesign']), NOW);
    const keys = notice?.outdated.map((t) => t.key) ?? [];
    expect(keys).toContain('documentation');
    expect(keys).not.toContain('design');
  });

  test('an older record without the list names every outdated tool, as before', () => {
    const keys = targetChangeNotice(recordWith(), NOW)?.outdated.map((t) => t.key) ?? [];
    expect(keys).toEqual(expect.arrayContaining(['design', 'documentation']));
  });

  test('the record says which artefacts were already outdated: those still carrying the previous record\'s digest', () => {
    const project = {
      solutionDesign: DESIGN,
      documentation: DOCS,
      auditMetadata: {
        sourceChange: { artefacts: { solutionDesign: artefactDigest('solutionDesign', DESIGN), documentation: 'an-older-digest' } },
      },
    };
    const record = buildSourceChangeRecord(project, sha256Hex(SOURCE), 'run-2', '2026-10-06T09:00:00.000Z');
    expect(record.alreadyOutdated).toEqual(['solutionDesign']);
    // No previous record: nothing was outdated before, and the field is left out.
    expect(buildSourceChangeRecord({ solutionDesign: DESIGN }, sha256Hex(SOURCE), 'run-2', '2026-10-06T09:00:00.000Z').alreadyOutdated).toBeUndefined();
  });
});
