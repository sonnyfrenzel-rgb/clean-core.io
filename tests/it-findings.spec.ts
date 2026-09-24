import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import {
  CHAIN_LINKS,
  chainOf,
  itFindingsView,
  levelDistribution,
  type ItFindingRow,
  type ItFindingsSource,
} from '../lib/it-findings';
import { findingsOf } from '../lib/it-findings-build';
import { isProvenanceValue } from '../lib/provenance';
import { LEVEL_OVERLAY_NOTE } from '../lib/process-overlays';

/**
 * Roadmap 8.1 — the IT view.
 *
 * The row names three things and every one of them has a cheap, wrong version:
 *
 *   - **„Findings mit beiden Katalogsichten"** — one letter is the merge of two
 *     SAP files answering two different questions. Printing the letter alone is
 *     how two independent reviews came to file `notToBeReleased → D` as a
 *     priority-zero bug (`lib/abap/abcd-classification.ts`). Both halves are
 *     shown, and a finding with no object says the catalog was never asked
 *     rather than showing an Unknown.
 *   - **„Level-Verteilung"** — a distribution whose denominator is the graded
 *     subset is a bar that always reaches 100 %. So every figure carries its
 *     coverage, Unknown is a slice of its own, and the findings that name no
 *     object are an exclusion with their own sentence.
 *   - **„Spur Anforderung → Anker → Finding → Zielentwurf"** with ADR-029: the
 *     chain belongs to a *chosen* finding and has to say how far it holds. The
 *     requirement link is the one that is genuinely not determined today, and
 *     the test below pins that it stays not determined rather than borrowing the
 *     rule standing in the same routine.
 *
 * The derivation is driven, not read: the fixtures below are rows the components
 * could not produce, and the one real measurement runs `findingsOf` — the
 * server-side derivation the route calls — over the product's 1.000-line example.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/** The import lines of a module — what it reaches, as opposed to what it talks about. */
const importsOf = (rel: string) =>
  read(rel)
    .split(/\r?\n/)
    .filter((line) => /^import\b/.test(line.trim()))
    .join('\n');

/* ------------------------------------------------------------- fixtures */

const row = (over: Partial<ItFindingRow> = {}): ItFindingRow => ({
  id: 'CC-001',
  kind: 'standard-table-read',
  title: 'Direct read of an SAP table',
  severity: 'Medium',
  objectName: 'VBAK',
  objectType: 'Database Table',
  lineStart: 228,
  lineEnd: null,
  routine: 'READ_ORDERS',
  level: 'C',
  releaseView: 'Not to be released',
  classificationView: 'Not listed',
  successor: 'API_SALES_ORDER_SRV',
  targetOptions: ['Developer Extensibility / RAP'],
  rulesCoveringLine: [],
  rulesInRoutine: [],
  ...over,
});

const source = (rows: ItFindingRow[]): ItFindingsSource => ({
  rows,
  sourceSha256: 'a'.repeat(64),
  rulesDerived: rows.length,
});

/* ------------------------------------------- 1. the chain and its coverage */

test.describe('the chain belongs to a chosen finding', () => {
  test('a finding whose line no derived rule covers ends at Requirement, not at a neighbour', () => {
    const chain = chainOf(row({ rulesCoveringLine: [], rulesInRoutine: ['BR-011'] }));

    expect(chain.complete, 'a chain with an undetermined link was called complete').toBe(false);
    expect(chain.endsAt).toBe('requirement');

    const requirement = chain.links.find((l) => l.id === 'requirement');
    // The neighbour is named — and it is named in the *reason*, beside the
    // words that say what it is worth. It is never the link's value.
    expect(requirement?.value, 'a rule in the same routine became the requirement').toBeNull();
    expect(requirement?.reason).toContain('BR-011');
    expect(requirement?.reason).toContain('not the requirement');
    expect(requirement?.provenance).toBe('not-determined');
  });

  test('a rule whose own anchor covers the line is the requirement, and the chain closes', () => {
    const chain = chainOf(row({ rulesCoveringLine: ['BR-005'], rulesInRoutine: [] }));
    expect(chain.links.find((l) => l.id === 'requirement')?.value).toBe('BR-005');
    expect(chain.endsAt).toBeNull();
    expect(chain.complete).toBe(true);
  });

  test('the four links are always four, undetermined ones included', () => {
    const chain = chainOf(row({ rulesCoveringLine: [], successor: null, targetOptions: [] }));
    expect(chain.links.map((l) => l.id)).toEqual([...CHAIN_LINKS]);
    // A chain shortened to its determined part is a chain that hides where it
    // stops — which is the defect ADR-029 was written against.
    expect(chain.links.filter((l) => l.value === null).length).toBe(2);
    expect(chain.endsAt, 'the first open link, not the last').toBe('requirement');
  });

  test('every undetermined link carries a reason and every determined one a provenance', () => {
    for (const fixture of [
      row(),
      row({ rulesCoveringLine: ['BR-005'] }),
      row({ successor: null, targetOptions: [] }),
      row({ routine: null, rulesInRoutine: [] }),
    ]) {
      for (const link of chainOf(fixture).links) {
        expect(isProvenanceValue(link.provenance), `${link.id} carries a made-up provenance`).toBe(true);
        expect(link.detail.length, `${link.id} has no detail`).toBeGreaterThan(0);
        if (link.value === null) {
          expect(link.reason, `${link.id} is absent without a reason`).toBeTruthy();
        }
      }
    }
  });

  test('the coverage says how many findings the chain is complete for, and names each stop', () => {
    const view = itFindingsView(
      source([
        row({ id: 'CC-001', rulesCoveringLine: ['BR-005'] }),
        row({ id: 'CC-002' }),
        row({ id: 'CC-003' }),
        row({ id: 'CC-004', rulesCoveringLine: ['BR-006'], successor: null, targetOptions: [] }),
      ]),
    );

    expect(view.chainCoverage.counted).toBe(1);
    expect(view.chainCoverage.of).toBe(4);
    // Exclusions are named one by one — never a "other" bucket.
    expect(view.chainCoverage.sentence).toContain('1 of 4');
    expect(view.chainCoverage.sentence).toContain('2 end at Requirement');
    expect(view.chainCoverage.sentence).toContain('1 end at Target draft');
    expect(view.chainCoverage.sentence).not.toContain('other');

    const ends = Object.fromEntries(view.chainEnds.map((e) => [e.link, e.count]));
    expect(ends).toMatchObject({ requirement: 2, anchor: 0, finding: 0, target: 1 });
  });

  test('the chain is the chosen finding’s, and an unknown choice falls back to the first row', () => {
    const rows = [row({ id: 'CC-001' }), row({ id: 'CC-002' })];
    expect(itFindingsView(source(rows), 'CC-002').chain?.findingId).toBe('CC-002');
    expect(itFindingsView(source(rows), 'CC-404').chain?.findingId).toBe('CC-001');
    expect(itFindingsView(source(rows)).chainTitle).toContain('Chain for CC-001');
  });
});

/* ------------------------------------------------ 2. the level distribution */

test.describe('the level distribution names what it did not count', () => {
  test('Unknown is a slice of its own, never folded into a letter', () => {
    const dist = levelDistribution([
      row({ id: 'CC-001', level: 'C' }),
      row({ id: 'CC-002', level: 'Unknown' }),
      row({ id: 'CC-003', level: 'B' }),
    ]);
    expect(dist.slices.map((s) => s.grade)).toEqual(['A', 'B', 'C', 'D', 'Unknown']);
    expect(dist.slices.find((s) => s.grade === 'Unknown')?.count).toBe(1);
    expect(dist.sentence).toContain('not a D');
  });

  test('a finding with no object is an exclusion with its own sentence, not an Unknown', () => {
    const dist = levelDistribution([
      row({ id: 'CC-001', level: 'C' }),
      row({ id: 'CC-002', objectName: null, level: null, releaseView: null, classificationView: null }),
    ]);
    expect(dist.graded).toBe(1);
    expect(dist.slices.find((s) => s.grade === 'Unknown')?.count).toBe(0);
    expect(dist.coverage.sentence).toContain('1 of 2');
    expect(dist.coverage.sentence).toContain('naming no object');
  });

  test('nothing graded is a sentence, never a bar of zeros', () => {
    const dist = levelDistribution([
      row({ objectName: null, level: null, releaseView: null, classificationView: null }),
    ]);
    expect(dist.graded).toBe(0);
    expect(dist.sentence).toContain('no level is shown');
  });

  test('the snapshot that answered is named, in roadmap 6.3’s own words', () => {
    // Not a second wording of the same caveat: the identical constant.
    expect(levelDistribution([row()]).note).toBe(LEVEL_OVERLAY_NOTE);
    expect(LEVEL_OVERLAY_NOTE).toContain('abap-atc-cr-cv-s4hc');
    expect(LEVEL_OVERLAY_NOTE).toContain('Public Edition');
  });
});

/* ---------------------------------------------- 3. absence is not a zero */

test.describe('what could not be read says so', () => {
  test('findings that could not be read are not "no findings"', () => {
    const view = itFindingsView(null);
    expect(view.unreadable).toBe(true);
    expect(view.headline).toContain('could not be read');
    for (const figure of view.figures) {
      expect(figure.value, `${figure.key} invented a value`).toBeNull();
      expect(figure.absentReason, `${figure.key} is absent without a reason`).toBeTruthy();
    }
  });

  test('a run with no findings is a different sentence again', () => {
    const view = itFindingsView(source([]));
    expect(view.unreadable).toBe(false);
    expect(view.headline).toContain('reported no finding');
    expect(view.figures.find((f) => f.key === 'findings')?.value).toBe('0');
    expect(view.figures.find((f) => f.key === 'chain-complete')?.value).toBeNull();
  });

  test('every figure carries its coverage, on every state', () => {
    for (const view of [itFindingsView(null), itFindingsView(source([])), itFindingsView(source([row()]))]) {
      for (const figure of view.figures) {
        expect(figure.coverage.sentence.length, `${figure.key} has no coverage`).toBeGreaterThan(0);
        expect(isProvenanceValue(figure.provenance)).toBe(true);
      }
    }
  });
});

/* ------------------------------------- 4. the measurement, on the real engine */

test.describe('the route’s own derivation, on the product’s largest example', () => {
  const EXAMPLE = 'public/starter-examples/ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';

  test('42 findings, 25 with an object, and not one requirement borrowed from a neighbour', () => {
    const built = findingsOf(read(EXAMPLE), 'ZLEGACY_ORDER_FULFILLMENT_AUDIT.abap');
    const view = itFindingsView(built);

    // The premise, measured rather than assumed.
    expect(built.rows.length).toBe(42);
    expect(built.rows.filter((r) => r.objectName !== null).length).toBe(25);
    expect(built.rulesDerived).toBe(16);

    // Both catalog views travel with every graded row, and only with those.
    for (const r of built.rows) {
      if (r.level === null) {
        expect(r.releaseView, `${r.id} has a view without a level`).toBeNull();
        expect(r.classificationView).toBeNull();
      } else {
        expect(r.releaseView, `${r.id} has a level without a release view`).toBeTruthy();
        expect(r.classificationView).toBeTruthy();
      }
    }

    // The access decides the letter: a table this program reads is C, and
    // grading every read as a write would publish D for 21 of these rows.
    const vbak = built.rows.find((r) => r.objectName === 'VBAK');
    expect(vbak?.level).toBe('C');
    expect(vbak?.releaseView).toBe('Not to be released');

    // The honest state of the chain today: nothing is complete, and every chain
    // stops at the requirement. 17 of them have a rule in the same routine, and
    // that is reported as a neighbourhood and counted nowhere else.
    expect(view.chainEnds.find((e) => e.link === 'requirement')?.count).toBe(42);
    expect(view.chainCoverage.counted).toBe(0);
    expect(view.requirementNote).toContain('17 of 42');
    expect(view.requirementNote).toContain('neighbourhood, not a cause');

    // C 22, B 2, Unknown 1 — measured 23.09.2026.
    const dist = Object.fromEntries(view.distribution.slices.map((s) => [s.grade, s.count]));
    expect(dist).toMatchObject({ A: 0, B: 2, C: 22, D: 0, Unknown: 1 });
    expect(view.distribution.coverage.sentence).toContain('25 of 42');
  });
});

/* -------------------------------------- 5. the level never becomes content */

test.describe('the level stays out of the signed record', () => {
  test('no module that builds the audit pack reaches the IT view or the catalog', () => {
    for (const rel of ['lib/audit-pack-build.ts', 'lib/audit-pack-canonical.ts', 'lib/audit-pack.ts']) {
      const text = read(rel);
      expect(text, `${rel} imports the IT view`).not.toContain('it-findings');
      expect(text, `${rel} imports the level rule`).not.toContain('abcd-classification');
    }
  });

  test('the IT view writes nothing and calls no model', () => {
    const model = read('lib/it-findings.ts');
    const panel = read('components/workspace/ItAnswers.tsx');
    for (const forbidden of ['setDoc', 'updateDoc', 'addDoc', '/api/gemini']) {
      expect(model, `lib/it-findings.ts reaches ${forbidden}`).not.toContain(forbidden);
      expect(panel, `ItAnswers.tsx reaches ${forbidden}`).not.toContain(forbidden);
    }
    // The route it does read from is a GET, and the only one it knows.
    expect(panel).toContain('/findings');
    expect(read('app/api/projects/[projectId]/findings/route.ts')).not.toContain('export async function POST');
  });

  test('an imported level is never green: A information, B neutral (DESIGN.md §1.8)', () => {
    // QA review of 4b4586aff273: the panel drew an A with `success`.
    const panel = read('components/workspace/ItAnswers.tsx');
    const fn = panel.slice(panel.indexOf('function gradeState('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).not.toContain("'success'");
    expect(body).toMatch(/case 'A':\s*return 'information';/);
    expect(body).toMatch(/case 'B':\s*return 'neutral';/);
    expect(body).toMatch(/case 'C':\s*return 'warning';/);
    expect(body).toMatch(/case 'D':\s*return 'error';/);
  });

  test('an answer is shown only for the project it was read for', () => {
    // QA review of 4b4586aff273: a client navigation kept the previous
    // project's findings on screen until the new read resolved.
    const panel = read('components/workspace/ItAnswers.tsx');
    expect(panel).toMatch(/loaded && loaded\.projectId === projectId \? loaded\.source : undefined/);
    expect(panel).toMatch(/setLoaded\(\{ projectId, source: value \}\)/);
    expect(panel).not.toMatch(/useState<ItFindingsSource \| null \| undefined>/);
  });

  test('the panel does not pull the 4 MB catalog into the browser', () => {
    // Imports, not prose: the doc comment of this component *names* the two
    // things it must not reach, and a substring guard would forbid explaining
    // the rule in the file that keeps it.
    const imports = importsOf('components/workspace/ItAnswers.tsx');
    for (const forbidden of ['catalog-service', 'evidence-model', 'it-findings-build']) {
      expect(imports, `ItAnswers.tsx imports ${forbidden}, which reaches the catalog`).not.toContain(
        forbidden,
      );
    }
    // And the pure model it does import reaches none of them either.
    const modelImports = importsOf('lib/it-findings.ts');
    expect(modelImports).not.toContain('catalog-service');
    expect(modelImports).not.toContain('evidence-model');
  });
});

/* ------------------------------------------------- 6. the rendered screen */

const clientApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const clientAuth = getAuth(clientApp);
const clientDb = initializeFirestore(clientApp, {});
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

const PASSWORD = 'ItFindingsView123!';
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

test.describe('the IT view on a real project, in a browser', () => {
  const ADMIN = `${unique('it-admin')}@cleancore-test.io`;
  const PROJECT_ID = unique('it-findings');

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'IT', lastName: 'Admin', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true, workspaceShell: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Emergency purchase approval', userId: cred.user.uid,
      createdAt: new Date(), status: 'created',
      legacyCode: read('public/starter-examples/Z_MM_PO_APPROVAL.abap'),
    });
  });

  test('the chain, both catalog views and the level distribution are on the screen', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${PROJECT_ID}?view=it`, { waitUntil: 'domcontentloaded' });

    const view = page.locator('[data-it-view=""]');
    await expect(view, 'the IT answers never arrived').toBeVisible({ timeout: 60000 });

    // ADR-029: the chain names the finding it is for, and its coverage stands
    // beside it rather than in a popover.
    await expect(page.locator('[data-it-chain-coverage]')).toContainText('chain complete');
    const links = page.locator('[data-it-chain-link]');
    await expect(links).toHaveCount(4);
    await expect(page.locator('[data-it-chain-link="requirement"] [data-it-chain-absent]')).toHaveText(
      'Not determined',
    );

    // Both halves of the catalog, as columns, on the rendered table.
    await expect(page.locator('[data-cc-table] th', { hasText: 'Release view' })).toHaveCount(1);
    await expect(page.locator('[data-cc-table] th', { hasText: 'Classification' })).toHaveCount(1);

    // The distribution, and the snapshot that answered it.
    await expect(page.locator('[data-it-level-coverage]')).toContainText(' of ');
    await expect(page.locator('[data-it-catalog-note]')).toContainText('abap-atc-cr-cv-s4hc');

    // Every figure on the screen carries its coverage — the same promise the
    // Management view keeps, in the same words.
    const figures = page.locator('[data-it-figure]');
    const covers = page.locator('[data-it-figure] [data-figure-coverage]');
    await expect(figures).not.toHaveCount(0);
    expect(await covers.count()).toBe(await figures.count());

    // The table marks the chosen row, and choosing another moves the chain.
    const first = page.locator('[data-it-finding][data-it-finding-selected="yes"]').first();
    await expect(first).toHaveCount(1);
    const chosen = await first.getAttribute('data-it-finding');
    await expect(page.locator('[data-it-chain-title]')).toContainText(`Chain for ${chosen}`);

    const other = page.locator('[data-it-finding][data-it-finding-selected="no"]').first();
    const otherId = await other.getAttribute('data-it-finding');
    await other.click();
    await expect(page.locator('[data-it-chain-title]')).toContainText(`Chain for ${otherId}`);
  });

  test('the IT panel is IT’s, and does not appear in the other two views', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${PROJECT_ID}?view=business`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-it-view]')).toHaveCount(0);
  });
});
