import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { adminMergeDoc, adminSetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { STARTER_EXAMPLES } from '../lib/starter-examples';
import { deriveDecisionDraft, type DecisionDraftFacts } from '../lib/decision-draft';
import { buildArchitectureContract } from '../lib/architecture-contract';
import { analysisRunInputs, buildInputManifest } from '../lib/input-manifest';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { evidenceDigest } from '../lib/run-evidence-digest';
import { runHistoryEntry, type RunHistoryEntry } from '../lib/management-answers';
import type { ProjectDecision } from '../lib/project-decision';
import type { StandardFit } from '../lib/standard-fit';
import type { Project } from '../lib/types';
import { steeringOnePager, steeringPrintTitle, STEERING_RISKS_MAX, type SteeringSource } from '../lib/steering-one-pager';

/**
 * The steering one-pager on paper — owner, 10.10.2026: *"In print the
 * one-pager must really be ONE page — in colour and perfectly formatted, to
 * put in front of a 'real' management."* He had printed it from Chrome and got
 * two sheets (the legend and the version line alone on the second), the
 * browser's date, title and address on both, and no colour.
 *
 * The first two blocks are pure and need no server. The last one prints the
 * page through Chromium's PDF engine and counts the sheets — it needs the
 * emulators and a server (`npx playwright test` as in CI).
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/* ------------------------------------------------------------- fixtures */

const SOURCE = 'REPORT z_mm_po_approval.\nWRITE 1.\n';
const OWNER = 'owner@example.invalid';

const signed: Project = {
  name: 'Emergency purchase approval',
  legacyCode: SOURCE,
  activeRunId: 'run-1',
  cleanCoreScore: 62,
};

const run = (): RunHistoryEntry => {
  const parsed = runHistoryEntry({
    runId: 'run-1',
    createdAt: '2026-09-01T10:00:00.000Z',
    cleanCoreScore: 62,
    rulesetVersion: 'rules-v1.0',
    analyzerVersion: '2.9.0',
    sapApiCatalogVersion: 'cat-2026-08',
  });
  if (!parsed) throw new Error('fixture is not a run');
  return parsed;
};

function decisionFixture(): ProjectDecision {
  const src = 'REPORT z_mm_report.\nDATA: lv_c TYPE i.\nSELECT COUNT(*) FROM ekpo INTO lv_c.\nWRITE lv_c.\n';
  const evidence = buildAbapEvidence(src, 'Z_TEST.abap', 'public');
  const route = routeExtensibility(evidence, 'public');
  const contract = buildArchitectureContract({
    contractId: 'AC-1',
    runId: 'run-1',
    inputManifest: buildInputManifest(
      analysisRunInputs({
        sourceSha256: 'a'.repeat(64),
        deploymentTarget: 'public',
        catalogVersion: '2026.FPS01',
        rulesetVersion: 'rules-v1.0',
        engineVersion: '2.15.0',
        model: null,
      }),
      null,
    ),
    evidence,
    route,
  });
  const facts: DecisionDraftFacts = {
    runId: 'run-1',
    evidenceDigest: evidenceDigest({
      inputFingerprint: { sha256: 'a'.repeat(64), lineCount: 4 },
      evidenceReport: [{ id: 'f1' }],
      originalRecommendation: 'In-App (ABAP Cloud)',
      rulesetVersion: 'rules-v1.0',
      sapApiCatalogVersion: 'catalog-1',
      analyzerVersion: 'engine-1',
      runHash: 'b'.repeat(64),
    }),
    runSignedAt: '2026-09-20T08:00:00.000Z',
    contract,
    signedOffArchitecture: 'rap',
    signOff: { by: OWNER, at: '2026-09-21T08:00:00.000Z', reason: '', notCurrent: null },
    need: { revision: 4, confirmedDrops: 0, undecided: 0 },
    handedOver: false,
    stored: undefined,
    now: '2026-09-24T10:00:00.000Z',
  };
  return deriveDecisionDraft(facts).draft;
}

const blocker = (objectName: string, line: number) => ({
  objectName,
  bucket: 'rebuild' as const,
  level: 'D' as const,
  line,
  why: 'The code writes directly to this SAP table.',
  provenance: 'reconstructed' as const,
  use: 'object' as const,
});

const FIT: StandardFit = {
  state: 'ready',
  basis: 'signed-run',
  platform: 'public',
  platformLabel: 'Public Edition',
  fits: 1,
  counted: 6,
  percent: 17,
  released: 1,
  successor: 0,
  blocking: 5,
  notSorted: 0,
  retire: 0,
  sentence: '1 of 6 SAP objects this code uses have a released path on Public Edition.',
  coverage: '',
  blockers: [blocker('EKKO', 40), blocker('EKPO', 52), blocker('EBAN', 77), blocker('T16FS', 90), blocker('BAPI_PO_CHANGE', 120)],
  clear: [],
  groups: [],
};

const full = (over: Partial<SteeringSource> = {}): SteeringSource => ({
  mode: 'project',
  base: '/project/p-1',
  program: 'Emergency purchase approval',
  subject: 'Z_MM_PO_APPROVAL',
  date: '2026-10-10',
  project: signed,
  hasRun: true,
  history: [run()],
  open: null,
  findings: null,
  fit: FIT,
  decision: decisionFixture(),
  signOff: { code: 'rap', by: OWNER, at: '2026-09-21T08:00:00.000Z' },
  process: { steps: 8, decisions: 2 },
  ...over,
});

/** Every sentence of the page outside the footer's reference line. */
function sentencesOf(page: ReturnType<typeof steeringOnePager>): string[] {
  const d = page.decision;
  return [
    page.question,
    page.header.program,
    page.header.purpose,
    page.header.status,
    ...(d.state === 'ready'
      ? [d.answer, d.who ?? '', d.proposal, d.readiness, ...d.pillars.map((p) => p.title), ...d.options.map((o) => o.reason)]
      : [d.reason]),
    ...page.figures.flatMap((f) => [f.label, f.value ?? '', f.absentReason ?? '', f.meaning]),
    ...page.risks.map((r) => r.why),
    ...page.nextSteps.map((s) => s.text),
    page.footnote.legend,
    page.footnote.scope,
  ];
}

/* ---------------------------------------------- 1. what the paper says */

test.describe('one-pager on paper — title, who decided, ids, lists', () => {
  test('the printed document is named after the program and the day', () => {
    expect(steeringPrintTitle('Z_MM_PO_APPROVAL', '2026-10-10')).toBe('Steering one-pager — Z_MM_PO_APPROVAL — 10 Oct 2026');
    const page = steeringOnePager(full());
    expect(page.printTitle).toBe('Steering one-pager — Z_MM_PO_APPROVAL — 10 Oct 2026');
    expect(page.header).toMatchObject({ subject: 'Z_MM_PO_APPROVAL', dateText: '10 Oct 2026' });
  });

  test('who decided is the account’s name where it is known, else its e-mail (ADR-083 (b))', () => {
    const named = steeringOnePager(full({ accountNames: { [OWNER]: 'Sonny Frenzel' } }));
    if (named.decision.state !== 'ready') throw new Error('not ready');
    expect(named.decision.decidedBy).toEqual({ verb: 'Chosen', by: 'Sonny Frenzel', at: '21 Sep 2026' });
    expect(named.decision.who).toBe('Chosen by Sonny Frenzel on 2026-09-21.');
    for (const line of sentencesOf(named)) expect(line, 'an e-mail where the name is known').not.toContain(OWNER);

    const unnamed = steeringOnePager(full());
    if (unnamed.decision.state !== 'ready') throw new Error('not ready');
    expect(unnamed.decision.decidedBy).toEqual({ verb: 'Chosen', by: OWNER, at: '21 Sep 2026' });
    // A name only for the account it belongs to — case of the address does not matter.
    const other = steeringOnePager(full({ accountNames: { 'someone@example.invalid': 'Someone Else' } }));
    if (other.decision.state !== 'ready') throw new Error('not ready');
    expect(other.decision.decidedBy?.by).toBe(OWNER);
    const upper = steeringOnePager(full({ accountNames: { [OWNER]: 'Sonny Frenzel' }, signOff: { code: 'rap', by: OWNER.toUpperCase(), at: null } }));
    if (upper.decision.state !== 'ready') throw new Error('not ready');
    expect(upper.decision.decidedBy).toEqual({ verb: 'Chosen', by: 'Sonny Frenzel', at: null });
  });

  test('raw ids stand in one reference line of the footer, and in no sentence', () => {
    const src = full();
    const page = steeringOnePager(src);
    const id = src.decision!.decisionId;
    for (const line of sentencesOf(page)) {
      expect(line, 'a decision id in a sentence').not.toContain(id);
      expect(line, 'a run id in a sentence').not.toContain('run-1');
    }
    expect(page.header.status).toBe('Analysis signed on 2026-09-01 · decision draft');
    expect(page.footnote.reference).toBe(`decision ${id} · revision ${src.decision!.revision} · run run-1`);
    const component = read('components/workspace/SteeringOnePager.tsx');
    // The identity is not printed beside the decision any more.
    expect(component).not.toContain('{pager.decision.identity}');
    expect(component).toMatch(/data-steering-reference=""[\s\S]{0,200}pager\.footnote\.reference/);
  });

  test('a long list ends in "+n more" on paper, never runs over', () => {
    const page = steeringOnePager(full());
    expect(page.risks).toHaveLength(STEERING_RISKS_MAX);
    expect(page.risksMore).toBe(FIT.state === 'ready' ? FIT.blockers.length - STEERING_RISKS_MAX : 0);
    expect(page.nextStepsMore).toBeGreaterThanOrEqual(0);
    const component = read('components/workspace/SteeringOnePager.tsx');
    expect(component).toContain('steeringMore(pager.risksMore)');
    expect(component).toContain('steeringMore(pager.nextStepsMore)');
  });
});

/* ------------------------------------------------ 2. the print sheet */

test.describe('one-pager on paper — one A4 landscape sheet, in colour', () => {
  const css = read('app/globals.css');
  const print = css.slice(css.indexOf('@media print'));
  const steering = print.slice(print.indexOf('[data-steering-print] {'), print.indexOf('[data-workspace-print]'));

  test('the sheet has no page margin, so Chrome has no room for its date, title and address', () => {
    expect(css).toMatch(/@page steering \{\s*size: A4 landscape;\s*margin: 0;\s*\}/);
    // The sheet brings its own white border instead.
    expect(steering).toMatch(/\[data-steering-print\] \{[^}]*padding: \d+mm \d+mm \d+mm !important;/);
  });

  test('colour is kept: exact colour adjustment, and only token colours', () => {
    expect(steering).toMatch(/print-color-adjust: exact;/);
    expect(steering).toMatch(/-webkit-print-color-adjust: exact;/);
    for (const cls of ['text-cc-information', 'text-cc-warning', 'bg-cc-information-bg', 'bg-cc-warning-mark', 'bg-cc-error', 'border-l-cc-ink']) {
      expect(steering, `${cls} is not given back on paper`).toContain(`[data-steering-print] .${cls}`);
    }
    expect(steering, 'a colour of its own on the one-pager’s paper').not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });

  test('the rows stand as on a wide screen, links print as words, long sentences are clamped', () => {
    expect(steering).toMatch(/\[data-steering-options\] \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\) !important;/);
    expect(steering).toMatch(/\[data-steering-lists\] \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;/);
    expect(steering).toMatch(/\[data-steering-print\] a \{\s*color: inherit !important;\s*text-decoration: none !important;/);
    expect(steering).toMatch(/\[data-steering-print\] \[data-print-clamp\] \{/);
    const sizes = [...steering.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    for (const size of sizes) expect(size, `a ${size}px size on the one-pager's paper`).toBeGreaterThanOrEqual(9);
  });

  test('the component names the document while it prints and tells how to drop the browser’s lines', () => {
    const component = read('components/workspace/SteeringOnePager.tsx');
    expect(component).toMatch(/addEventListener\('beforeprint'/);
    expect(component).toMatch(/addEventListener\('afterprint'/);
    expect(component).toContain("usePrintTitle(pager?.printTitle ?? null)");
    expect(component).toContain("wt('steering.printHint')");
    expect(read('lib/messages/workspace.ts')).toMatch(/'steering\.printHint': '[^']*Headers and footers[^']*'/);
  });
});

/* ------------------------------------------------- 3. printed, counted */
/* Needs the emulators and a server (`npx playwright test` as in CI). */

const A4_LANDSCAPE = { width: 1123, height: 794 }; // 297 × 210 mm at 96 px per inch

function pdfPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

/** Opens nothing; prints what is open, checks it, and returns the sheet count. */
async function printAndCount(page: Page, label: string): Promise<number> {
  const pager = page.locator('[data-steering-one-pager="open"]');
  await page.setViewportSize(A4_LANDSCAPE);
  await page.emulateMedia({ media: 'print' });
  // The content fits the paper: the sheet is no taller than one A4 landscape page.
  const height = await pager.evaluate((el) => el.getBoundingClientRect().height);
  expect(height, `${label}: the one-pager is ${Math.round(height)} px tall on paper`).toBeLessThanOrEqual(A4_LANDSCAPE.height);
  // In colour: a bar segment keeps its fill.
  const segment = pager.locator('[data-steering-segment]').first();
  if ((await segment.count()) > 0) {
    const fill = await segment.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(fill, `${label}: a bar lost its colour on paper`).not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/);
  }
  // No link underline and no address on paper.
  for (const deco of await pager.locator('a').evaluateAll((els) =>
    els.filter((a) => getComputedStyle(a).display !== 'none').map((a) => getComputedStyle(a).textDecorationLine),
  )) {
    expect(deco).toBe('none');
  }
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  // A4 landscape: 842 × 595 points.
  const box = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  expect(box, `${label}: no page box in the PDF`).not.toBeNull();
  expect(Math.abs(Number(box![1]) - 842), `${label}: not A4 landscape wide`).toBeLessThan(3);
  expect(Math.abs(Number(box![2]) - 595), `${label}: not A4 landscape high`).toBeLessThan(3);
  await page.emulateMedia({ media: 'screen' });
  return pdfPages(pdf);
}

/**
 * In a project the one-pager opens from the decision card or the Export menu,
 * or on arrival at `#steering-one-pager` (`lib/steering-open.ts`) — the last is
 * the one that does not depend on where the Management view puts its button.
 * The demo keeps its own toggle.
 */
async function openOnePager(page: Page, projectId: string | null) {
  if (projectId) {
    await page.goto(`/project/${projectId}?view=management#steering-one-pager`, { waitUntil: 'domcontentloaded' });
  } else {
    await page.goto('/demo/workspace?view=management', { waitUntil: 'domcontentloaded' });
    const button = page.locator('[data-steering-one-pager="closed"] button');
    await expect(button).toBeVisible({ timeout: 120_000 });
    await button.click();
  }
  await expect(page.locator('[data-steering-one-pager="open"] [data-steering-summary]')).toBeVisible({ timeout: 120_000 });
}

async function analysedProject(request: import('@playwright/test').APIRequestContext, file: string) {
  const source = fs.readFileSync(path.resolve(ROOT, 'public', 'starter-examples', file), 'utf8');
  const name = file.replace(/\.(abap|txt)$/i, '');
  const seeded = await seedStageProject({ prefix: 'steer-print', acceptTerms: true });
  await adminSetDoc('projects', seeded.projectId, {
    name, userId: seeded.uid, createdAt: new Date(), status: 'uploaded',
    legacyCode: source, s4Deployment: 'public',
  });
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = connectAuthToEmulator(getAuth(app));
  const cred = await signInWithEmailAndPassword(auth, seeded.email, seeded.password);
  const token = await cred.user.getIdToken(true);
  const res = await request.post('/api/runs/create', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { projectId: seeded.projectId, legacyCode: source, s4Deployment: 'public', analysis: '{}', uploadedFileName: file },
    timeout: 240_000,
  });
  expect(res.status(), await res.text()).toBe(200);
  // The option chosen by this account, so the title block says who decided.
  await adminMergeDoc('projects', seeded.projectId, {
    approvedByArchitect: true,
    approvedBy: seeded.email,
    architectSignOffAt: new Date(),
    targetArchitecture: 'rap',
  });
  return { ...seeded, name };
}

test.describe('one-pager printed — one sheet for every starter example', () => {
  // Every starter example, so the worst case among them is covered by
  // construction rather than by a guess at which one prints the most.
  for (const example of STARTER_EXAMPLES) {
    test(`${example.name} prints on one A4 landscape sheet`, async ({ page, request }) => {
      test.setTimeout(420_000);
      const seeded = await analysedProject(request, example.file);
      await signInThroughForm(page, seeded);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await openOnePager(page, seeded.projectId);
      const pager = page.locator('[data-steering-one-pager="open"]');

      // Who decided is a name where the account has one (ADR-083 (b)).
      const who = pager.locator('[data-steering-decision-who]');
      if ((await who.count()) > 0) {
        await expect(who).toContainText('Stage Style');
        await expect(who).not.toContainText('@');
      }

      // The document carries the page's name while it prints, and gets its own back.
      const before = await page.title();
      const printing = await page.evaluate(() => {
        window.dispatchEvent(new Event('beforeprint'));
        const t = document.title;
        window.dispatchEvent(new Event('afterprint'));
        return t;
      });
      expect(printing).toMatch(/^Steering one-pager — \S.* — \d{1,2} [A-Z][a-z]{2} \d{4}$/);
      expect(await page.title()).toBe(before);

      expect(await printAndCount(page, example.name), `${example.name} prints on more than one sheet`).toBe(1);

      if (example.name === 'Z_MM_PO_APPROVAL') {
        // Stress: every sentence that is clamped on paper made three times as
        // long. The clamps hold the sheet to one page whatever the wording.
        await pager.evaluate((root) => {
          for (const el of root.querySelectorAll<HTMLElement>('[data-print-clamp]')) {
            const t = el.textContent ?? '';
            el.textContent = `${t} ${t} ${t}`;
          }
        });
        expect(await printAndCount(page, `${example.name} (stressed)`), 'long sentences push the one-pager onto a second sheet').toBe(1);
      }
    });
  }

  test('the demo’s one-pager prints on one sheet too', async ({ page }) => {
    test.setTimeout(300_000);
    const seeded = await seedStageProject({ prefix: 'steer-print-demo', acceptTerms: true });
    await signInThroughForm(page, seeded);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openOnePager(page, null);
    expect(await printAndCount(page, 'demo'), 'the demo one-pager prints on more than one sheet').toBe(1);
  });
});
