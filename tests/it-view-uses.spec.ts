import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { EXAMPLE_SNIPPETS } from '../lib/example-snippets';
import { findingsOf } from '../lib/it-findings-build';
// Registers the Private Edition snapshots, as the findings route's import does.
import '../lib/abap/catalog-snapshots';
import { notDetermined } from '../lib/workspace-model';
import { itOpening, itState, usesSummary } from '../lib/it-state';
import { availableCoachMarks } from '../lib/coach-marks';
import type { Project } from '../lib/types';
import { signInViaLanding } from './helpers/sign-in';
import { itvUsesCoverage } from '../lib/messages/workspace-it';
import type { ItUseRow } from '../lib/it-findings';

/**
 * The IT view after the v3.0.1 rework — the owner's review of 3.0: *"so empty
 * and nested … it must be clear why there is still such emptiness."*
 *
 * `Z_SALES_ORDER_CREATOR` is the case that made it visible. It calls three
 * BAPIs and branches on `sy-subrc`, and the 3.0 IT view said "No findings in
 * the staged source", "Places in the code 0" and "Not determined 0" — while the
 * first look below it said "5 not determined". Both halves were true to their
 * own question and the page as a whole was not: the detectors judge violations
 * and do not look at a local `CALL FUNCTION`, and the tile called "Not
 * determined" counted findings without a level, a different thing from the
 * engine's list of what it did not judge.
 *
 * Held here: the calls are shown with their lines and levels, the Not
 * determined count is one number everywhere, a project with content draws no
 * dashed empty box, the tour starts at the top, and a phone does not scroll
 * sideways.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const SALES_ORDER = EXAMPLE_SNIPPETS.find((s) => s.id === 'static-sales-order')!.code;
const BAPIS = ['BAPI_SALESORDER_CREATEFROMDAT2', 'BAPI_TRANSACTION_ROLLBACK', 'BAPI_TRANSACTION_COMMIT'] as const;

test.describe('what the code uses, derived on the server', () => {
  test('the three BAPI calls are uses with their lines and levels, though no detector raised a finding', () => {
    const built = findingsOf(SALES_ORDER, 'Z_SALES_ORDER_CREATOR.abap', 'private', 'pce-latest');
    expect(built.rows).toHaveLength(0);
    const uses = built.uses ?? [];
    for (const name of BAPIS) {
      const use = uses.find((u) => u.object === name);
      expect(use, `${name} is not listed as a use`).toBeDefined();
      expect(use!.use).toBe('call');
      expect(use!.kind).toBe('bapi');
      expect(use!.lines.length).toBeGreaterThan(0);
      // Every line is the line of the CALL FUNCTION that names it.
      for (const line of use!.lines) {
        expect(SALES_ORDER.split('\n')[line - 1]).toContain(`'${name}'`);
      }
      expect(use!.level).not.toBeNull();
    }
    // The create BAPI is a classic API in SAP's classification: level B.
    expect(uses.find((u) => u.object === 'BAPI_SALESORDER_CREATEFROMDAT2')!.level).toBe('B');
    // No table is read or written directly — and the summary says exactly that.
    expect(uses.filter((u) => u.kind === 'table')).toHaveLength(0);
    expect(usesSummary(uses)!.sentence).toContain('reads and writes no database table directly');
  });

  test('the uses figure adds up: its parts count the rows a finding named and no reader reached (QA 0435d9724549)', () => {
    const row = (object: string, use: ItUseRow['use']) => ({ object, use, kind: 'object', lines: [1], level: null }) as unknown as ItUseRow;
    // One object called, and the same object named by a finding at a line the call reader did not reach.
    const uses = [row('Z_FM', 'call'), row('Z_FM', 'use'), row('CL_X', 'use')];
    const summary = usesSummary(uses)!;
    expect(summary.calls + summary.reads + summary.writes + summary.others).toBe(uses.length);
    expect(itvUsesCoverage(summary.calls, summary.reads, summary.writes, summary.others)).toBe('1 call · 0 read · 0 written · 2 other uses');
    expect(itvUsesCoverage(3, 0, 0)).toBe('3 calls · 0 read · 0 written');
  });

  test('a type reference is not a use, a table read is, and a finding keeps its own level', () => {
    const src = read('public/starter-examples/Z_MM_PO_APPROVAL.abap');
    const built = findingsOf(src, 'Z_MM_PO_APPROVAL.abap', 'private', 'pce-latest');
    const uses = built.uses ?? [];
    // EBAN is declared as a type and read and written; the uses are the read and the write.
    expect(uses.filter((u) => u.object === 'EBAN').map((u) => u.use).sort()).toEqual(['read', 'write']);
    // One level per place: a use that a finding stands on carries that finding's level.
    for (const use of uses.filter((u) => u.findingIds.length > 0)) {
      const levels = built.rows.filter((r) => use.findingIds.includes(r.id)).map((r) => r.level);
      expect(levels, `${use.object}@${use.use}`).toContain(use.level);
    }
  });

  test('one Not determined: the engine’s gaps and the page’s list are the same number', () => {
    const built = findingsOf(SALES_ORDER, 'Z_SALES_ORDER_CREATOR.abap', 'private', 'pce-latest');
    const gaps = (built.coverage?.gaps ?? []).reduce((sum, g) => sum + g.count, 0);
    const open = notDetermined({ legacyCode: SALES_ORDER } as Project);
    // The browser reads without SAP's catalog; the server says how many local
    // calls the catalog answered (3.0.6), and the page subtracts them.
    const shown = open.count - (built.coverage?.answered ?? 0);
    expect(shown).toBe(gaps);
    expect(shown).toBeGreaterThan(0);
    // The reason under a clean headline names that count rather than hiding it.
    const opening = itOpening('clean', built, shown);
    expect(opening.reason).toContain(`${shown} constructs`);
  });

  test('one state per situation, and "no findings" never stands alone beside SAP calls', () => {
    const built = findingsOf(SALES_ORDER, 'Z_SALES_ORDER_CREATOR.abap', 'private', 'pce-latest');
    expect(itState({ source: built, hasSource: false, signed: false })).toBe('no-source');
    expect(itState({ source: undefined, hasSource: true, signed: true })).toBeUndefined();
    expect(itState({ source: null, hasSource: true, signed: true })).toBe('unread');
    expect(itState({ source: built, hasSource: true, signed: false })).toBe('unsigned');
    expect(itState({ source: built, hasSource: true, signed: true })).toBe('clean');
    const clean = itOpening('clean', built, 5);
    expect(clean.title).not.toBe('No findings in the staged source');
    expect(clean.title).toContain('3 calls');
    expect(clean.reason).toContain('BAPI_SALESORDER_CREATEFROMDAT2 (level B)');
    // Unsigned gives the same answer, said to be unsigned first.
    expect(itOpening('unsigned', built, 5).title).toBe(clean.title);
    expect(itOpening('unsigned', built, 5).reason).toMatch(/^No signed run yet/);
  });

  test('in IT the tour starts at "Next step", then the figure in the answer; Business reads its own page', () => {
    // IT draws no process since ADR-086, so "Select the decision point" is
    // not offered there — it stands in Business, at the map.
    const it = availableCoachMarks({
      hasDecision: true,
      hasNextStep: true,
      order: ['next-step', 'not-determined'],
      only: ['next-step', 'not-determined'],
    });
    expect(it.map((m) => m.id)).toEqual(['next-step', 'not-determined']);
    expect(availableCoachMarks({ hasDecision: true, hasNextStep: true }).map((m) => m.id)).toEqual([
      'next-step',
      'decision',
      'not-determined',
    ]);
    const shell = read('components/workspace/WorkspaceShell.tsx');
    expect(shell).toMatch(/const IT_COACH_ORDER: readonly CoachMarkId\[\] = \['next-step', 'not-determined'\];/);
    expect(shell).toMatch(/order: view === 'it' \? IT_COACH_ORDER : undefined/);
    expect(shell).toMatch(/view === 'it' \? IT_COACH_ORDER : undefined,\s*\}\);/);
  });
});

/* ------------------------------------------------------- the rendered view */

const clientApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(clientApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'ItViewUses123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('the IT view after a signed run of Z_SALES_ORDER_CREATOR', () => {
  const ADMIN = `${unique('itu-admin')}@cleancore-test.io`;
  const PROJECT_ID = unique('it-uses');
  const RUN_ID = unique('it-uses-run');

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'IT', lastName: 'Uses', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Z_SALES_ORDER_CREATOR', userId: cred.user.uid,
      createdAt: new Date(), status: 'analyzed', s4Deployment: 'private',
      legacyCode: SALES_ORDER, activeRunId: RUN_ID, cleanCoreScore: 80,
    });
    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: PROJECT_ID, userId: cred.user.uid,
      createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 80, legacyCode: SALES_ORDER,
    });
  });

  async function openIt(page: Page): Promise<void> {
    await signInViaLanding(page, ADMIN, PASSWORD);
    await page.goto(`/project/${PROJECT_ID}?view=it`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-it-view=""]'), 'the IT answers never arrived').toBeVisible({ timeout: 90000 });
  }

  test('calls with anchors and levels, one Not determined, no empty box, the tour at the top', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await openIt(page);
    const view = page.locator('[data-it-view=""]');
    await expect(view).toHaveAttribute('data-it-state', 'clean');
    // The headline does not say "no findings" on its own beside a program that calls SAP.
    await expect(page.locator('[data-it-headline]')).not.toHaveText('No findings in the staged source');
    await expect(page.locator('[data-it-headline]')).toContainText('3 calls');

    // (1) The called BAPIs, each with its line anchor and its level.
    for (const name of BAPIS) {
      await expect(page.locator(`[data-it-use="${name}"]`)).toBeVisible();
      await expect(page.locator(`[data-it-use-lines="${name}"]`)).toContainText(/L\d+/);
      await expect(page.locator(`[data-it-use-level="${name}"] [data-cc-identifier="clean-core-level"]`)).toHaveCount(1);
    }
    await expect(
      page.locator('[data-it-use-level="BAPI_SALESORDER_CREATEFROMDAT2"] [data-cc-identifier="clean-core-level"]'),
    ).toHaveAttribute('data-cc-value', 'B');
    await expect(page.locator('[data-it-figure="uses"] [data-figure-value]')).toHaveText('3');

    // (2) The open questions are one number (ADR-081): the figure says what the
    // list counts, and the list keeps every line the engine stepped over that
    // anyone can answer, one click deeper in its group.
    const engine = notDetermined({ legacyCode: SALES_ORDER } as Project).count;
    const list = page.locator('#not-determined [data-open-questions]');
    await expect(list).toBeVisible({ timeout: 30000 });
    const open = await list.getAttribute('data-open-questions');
    await expect(page.locator('[data-it-figure="not-determined"] [data-figure-value]')).toHaveText(String(open));
    expect(await page.locator('#not-determined [data-not-determined-item]').count()).toBeLessThanOrEqual(engine);

    // (3) Evidence with content draws no dashed empty box in the IT view.
    await expect(view.locator('[data-cc-empty-state]')).toHaveCount(0);

    // (4) The explanation starts at the top: the first tip of the tour stands at
    // "Next step" under the answer, the second at the Not determined figure in
    // it — never at the foot of the page.
    const mark = page.locator('[data-coach-mark]').first();
    await expect(mark).toBeVisible({ timeout: 30000 });
    await expect(mark).toHaveAttribute('data-coach-mark', 'next-step');
    await page.click('[data-coach-mark-dismiss="next-step"]');
    await expect(mark).toHaveAttribute('data-coach-mark', 'not-determined');
    const markBox = await mark.boundingBox();
    const answerBox = await page.locator('[data-it-answer]').boundingBox();
    const usesBox = await page.locator('#it-objects').boundingBox();
    expect(markBox && answerBox && usesBox).toBeTruthy();
    // Above the first section under the answer — where the reader is.
    expect(markBox!.y).toBeLessThan(usesBox!.y + usesBox!.height);
    expect(markBox!.y).toBeGreaterThanOrEqual(answerBox!.y);
    // Every section says what it is in its first sentence, visible without a click.
    await expect(page.locator('[data-it-lead="objects"]')).toBeVisible();
    await expect(page.locator('#not-determined [data-open-questions-line]')).toBeVisible();
  });

  test('(5) on a phone nothing scrolls sideways', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openIt(page);
    await expect(page.locator('[data-it-use="BAPI_SALESORDER_CREATEFROMDAT2"]').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
