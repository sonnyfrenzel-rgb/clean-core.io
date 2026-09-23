import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import {
  STAND_COOLDOWN_MS,
  createStandProbe,
  revisionBadge,
  standMoved,
  type RevisionStand,
} from '../lib/workspace-revision';

/**
 * Roadmap 6.9 — the Revisionshinweis (CR-15) and the fragment across a view
 * switch (CR-14).
 *
 * Three halves, and they are not interchangeable:
 *
 *   - **the bound, run.** `createStandProbe` is exercised with a deferred read,
 *     because "one read per window under concurrency" cannot be observed by
 *     reading source. This is the lesson of `tests/single-flight.spec.ts`: the
 *     first fix for the health probe kept its three characters and still
 *     performed two reads, and the guard that read those characters stayed
 *     green.
 *   - **the wiring, read.** Which component asks, and whether the ask happens
 *     *before* the write rather than after it, is a question about the source,
 *     and one a rendered test cannot reach without a second browser writing a
 *     revision underneath the first.
 *   - **the two promises, rendered.** That the badge is actually on the screen,
 *     and that the `#fragment` survives a view switch, are claims about the
 *     shipped page and are made against it.
 */

const REPO = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

/* --------------------------------------------- the bound, run */

test.describe('the Stand probe costs one read per window (CR-15)', () => {
  test('twenty checks arriving together are one read', async () => {
    const gate = deferred<RevisionStand | null>();
    let reads = 0;
    const probe = createStandProbe(
      () => {
        reads++;
        return gate.promise;
      },
      () => 0,
    );

    const waiting = Array.from({ length: 20 }, () => probe());
    expect(reads, 'each concurrent check issued its own read').toBe(1);

    gate.resolve({ revision: 7 });
    expect(await Promise.all(waiting)).toEqual(Array(20).fill({ revision: 7 }));
    expect(reads).toBe(1);
  });

  test('a check inside the window issues no read at all — it is answered from the last verdict', async () => {
    let reads = 0;
    let clock = 1_000;
    const probe = createStandProbe(
      async () => {
        reads++;
        return { revision: 3 };
      },
      () => clock,
    );

    expect(await probe()).toEqual({ revision: 3 });
    expect(reads).toBe(1);

    // Focus, focus, focus, and a writing action — the three triggers of the
    // roadmap line, all inside one window.
    clock += STAND_COOLDOWN_MS - 1;
    for (let i = 0; i < 50; i++) expect(await probe()).toEqual({ revision: 3 });
    expect(reads, 'the three triggers turned into a read each').toBe(1);
  });

  test('and once the window is over, the next check does reach the server', async () => {
    let reads = 0;
    let clock = 0;
    const probe = createStandProbe(
      async () => ({ revision: ++reads }),
      () => clock,
    );

    await probe();
    clock += STAND_COOLDOWN_MS;
    expect(await probe(), 'the verdict froze in — the Stand could never move again').toEqual({ revision: 2 });
    expect(reads).toBe(2);
  });

  test('a read that fails leaves the last verdict standing and does not wedge the probe', async () => {
    let clock = 0;
    let fail = true;
    const probe = createStandProbe(
      async () => {
        if (fail) return null;
        return { revision: 5 };
      },
      () => clock,
    );

    expect(await probe()).toBeNull();
    fail = false;
    clock += STAND_COOLDOWN_MS;
    expect(await probe()).toEqual({ revision: 5 });
  });

  test('the window is claimed before the read is awaited — read out of the source', () => {
    // The one thing the tests above cannot show: that a later edit does not
    // move the two lines below the `await`, which leaves the concurrent burst
    // unbounded while every sequential test stays green.
    const src = read('lib/workspace-revision.ts');
    const body = src.slice(src.indexOf('return share(async () => {'));
    const claim = body.indexOf('claimedAt = now();');
    const awaited = body.indexOf('await read()');
    expect(claim, 'nothing claims the window inside the shared run').toBeGreaterThan(-1);
    expect(awaited).toBeGreaterThan(-1);
    expect(claim, 'the window is claimed after the read returns — the burst is unbounded').toBeLessThan(awaited);
    expect(src, 'the probe no longer shares its run, so concurrent checks each read').toContain('singleFlight');
  });
});

test.describe('what counts as a move (CR-15)', () => {
  test('a screen that has not checked yet never claims a change', () => {
    expect(standMoved(undefined, 4)).toBe(false);
    expect(standMoved(4, undefined)).toBe(false);
  });

  test('but gaining the first revision is a change, and null is a Stand of its own', () => {
    expect(standMoved(null, 1), 'going from no revision to revision 1 went unnoticed').toBe(true);
    expect(standMoved(2, 3)).toBe(true);
    expect(standMoved(3, 3)).toBe(false);
    expect(standMoved(null, null)).toBe(false);
  });

  test('one wording for the Stand, and no invented revision 0', () => {
    expect(revisionBadge(4)).toBe('Revision 4');
    expect(revisionBadge(null)).toBe('No revision yet');
    expect(revisionBadge(null)).not.toMatch(/0/);
  });
});

/* --------------------------------------------- the wiring, read */

test.describe('where the Stand is asked (CR-15)', () => {
  test('the shell renders the badge and hands the notice its two exits', () => {
    const shell = read('components/workspace/WorkspaceShell.tsx');
    expect(shell, 'the workspace does not ask for its Stand at all').toContain('useWorkspaceRevision');
    expect(shell).toContain('<WorkspaceRevisionStand');

    const stand = read('components/workspace/RevisionStand.tsx');
    expect(stand).toContain('data-workspace-revision=');
    expect(stand).toContain('data-workspace-revision-banner=');
    expect(stand, 'the notice lost "keep the old Stand"').toContain('data-workspace-revision-keep=');
    expect(stand, 'the notice lost "refresh"').toContain('data-workspace-revision-refresh=');
    // Neither exit is the primary: the screen must not choose for the reader.
    expect(stand, 'one of the two exits was promoted to the page\'s primary action').not.toMatch(
      /variant="primary"/,
    );
  });

  test('the check happens at focus, at mount and before the write — and the write waits for it', () => {
    const hook = read('hooks/useWorkspaceRevision.ts');
    expect(hook, 'the screen never rechecks when it comes back into focus').toContain(
      "addEventListener('focus'",
    );
    expect(hook).toContain("addEventListener('visibilitychange'");
    expect(hook, 'the probe is built per event, so every event is its own window').toContain('useMemo');

    const access = read('components/workspace/AccessList.tsx');
    const revoke = access.slice(access.indexOf('const revoke = useCallback'));
    const gate = revoke.indexOf('await beforeWrite()');
    const write = revoke.indexOf('await revokeProjectAccess(');
    expect(gate, 'the writing action asks nothing about the Stand').toBeGreaterThan(-1);
    expect(gate, 'the Stand is checked after the revocation was already sent').toBeLessThan(write);
  });

  test('nothing about the Stand is stored, and nothing about it calls a model', () => {
    // ROADMAP §8: a view is never an attribute on an artefact, and the Stand
    // notice must not become the first place that rule breaks.
    for (const rel of [
      'lib/workspace-revision.ts',
      'hooks/useWorkspaceRevision.ts',
      'components/workspace/RevisionStand.tsx',
    ]) {
      const src = read(rel);
      expect(src, `${rel} writes to Firestore`).not.toMatch(/setDoc|updateDoc|addDoc|method: 'POST'/);
      expect(src, `${rel} reaches for a model`).not.toMatch(/gemini|generateContent/i);
    }
  });

  test('the cheap read exists on the route it asks — one document, not the history', () => {
    const route = read('app/api/projects/[projectId]/process-revisions/route.ts');
    const stand = route.indexOf("searchParams.get('stand') === '1'");
    expect(stand, 'the Stand probe has no cheap answer and reads the whole history').toBeGreaterThan(-1);
    const branch = route.slice(stand, stand + 400);
    expect(branch, 'the cheap branch does not use the single-document read').toContain('latestRevision(');
    expect(branch).not.toContain('orderBy');
  });
});

/* --------------------------------------------- the two promises, rendered */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientDb = initializeFirestore(firebaseApp, {}, firebaseConfig.firestoreDatabaseId);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}
try {
  connectFirestoreEmulator(clientDb, '127.0.0.1', 8080);
} catch {
  /* already connected */
}

const PASSWORD = 'WorkspaceStand123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

test.describe('the workspace on the screen', () => {
  const ADMIN = `${unique('stand-admin')}@cleancore-test.io`;
  const PROJECT_ID = unique('stand-project');

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Stand', lastName: 'Admin', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true, workspaceShell: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Emergency purchase approval', userId: cred.user.uid,
      createdAt: new Date(), status: 'created',
      legacyCode: 'REPORT z_stand.\nWRITE 1.\n',
    });
  });

  test('says which Stand it is showing, beside the name of the case (CR-15)', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });

    const badge = page.locator('[data-workspace-revision]');
    await expect(badge, 'the workspace never says which revision it is showing').toBeVisible({
      timeout: 30000,
    });
    // This project has no reconstructed process, and the badge says exactly
    // that rather than inventing a revision 0.
    await expect(badge).toHaveText('No revision yet');
    await expect(badge).toHaveAttribute('data-workspace-revision', 'none');

    // Nothing has moved, so there is no notice. A banner on every load would be
    // the notice nobody reads.
    await expect(page.locator('[data-workspace-revision-banner]')).toHaveCount(0);
  });

  test('a view switch keeps the place the link pointed at (CR-14)', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    // A shared deep link: one subject, one place in the page.
    await page.goto(`/project/${PROJECT_ID}?view=business#L42`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });

    const itSegment = page.locator('[role="radiogroup"][aria-label="View"] button:has-text("IT")');
    await expect(itSegment).toBeVisible({ timeout: 30000 });
    await expect(itSegment).toHaveAttribute('aria-checked', 'false');
    await itSegment.click();
    await expect(page.locator('[data-workspace-shell]')).toHaveAttribute(
      'data-workspace-shell',
      'it',
      { timeout: 30000 },
    );
    expect(
      new URL(page.url()).hash,
      'the view switch dropped the fragment — same subject, other view, lost place',
    ).toBe('#L42');

    // And the focus switch, which only IT has, on the same terms. The control
    // is waited for rather than clicked at once: it appears with the IT view,
    // and a click that lands before React has attached its handler is a lost
    // click, which no amount of polling afterwards recovers.
    const solution = page.locator('[data-workspace-it-focus] button:has-text("Solution")');
    await expect(solution).toBeVisible({ timeout: 30000 });
    await expect(solution).toHaveAttribute('aria-checked', 'false');
    await solution.click();
    await expect(solution).toHaveAttribute('aria-checked', 'true', { timeout: 30000 });
    await expect
      .poll(() => new URL(page.url()).searchParams.get('focus'), { timeout: 30000 })
      .toBe('solution');
    expect(new URL(page.url()).hash, 'the focus switch dropped the fragment').toBe('#L42');
  });
});
