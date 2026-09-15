import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { buildAnalysisPrompt } from '../lib/analysis-prompt';
import { containsAmount, NO_AMOUNT, readStoredAnalysis, withoutUnapprovedMoney } from '../lib/money-honesty';
import { formatAnalysisToMarkdown } from '../lib/markdownFormatter';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';

/**
 * Roadmap step 0.4 (`UX-E13-F01:R0`): no module shows an amount that no approved
 * assumption carries.
 *
 * Acceptance (docs/roadmap/SCHNITT-0-UMFANG.md §4, V25-A06): "Analyze, Brief und
 * Export ohne Annahmenrevision zeigen keinen Geldwert; der Prompt enthält keine
 * monetären Felder."
 *
 * Before: the analysis prompt asked the model for `estimatedMaintenanceCostRange`
 * and a `cloudRoiSummary` with "projected savings of approximately $Y–$Z per
 * year"; the Analyze stage showed them as "Est. Maint. Cost: 3.000 €–8.000 €/yr"
 * and "Estimated Cloud ROI", and the Confluence export carried them to a
 * customer. Nothing behind those numbers was an assumption anyone had approved.
 *
 * The one place that prices anything is the Economics stage, and only from the
 * figures the user enters (tests/tco-cost-inputs-guard.spec.ts).
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');
const ANALYZE = 'app/(app)/project/[projectId]/analyze/page.tsx';

const PROGRAM = "REPORT zcredit.\nSELECT SINGLE * FROM vbak INTO ls_order WHERE vbeln = p_vbeln.\nUPDATE vbak SET cmgst = 'B' WHERE vbeln = p_vbeln.\n";

test('the analysis prompt asks for no money', () => {
  // The prompt as the Analyze stage sends it, not a slice of the page source.
  const report = buildAbapEvidence(PROGRAM, 'ZCREDIT', 'private');
  const src = buildAnalysisPrompt({ targetDeployment: 'private', evidenceReport: report, routeReport: routeExtensibility(report, 'private'), code: PROGRAM });
  const start = src.indexOf('businessValueAnalysis: {');
  const block = src.slice(start, src.indexOf('};', start));
  expect(start).toBeGreaterThan(0);
  expect(block).not.toMatch(/estimatedMaintenanceCost|cloudRoiSummary/);
  // The field list itself: no cost, saving, ROI, price or currency — the one comment saying "no money" aside.
  const fields = block.replace(/\/\/.*$/gm, '');
  expect(fields).not.toMatch(/cost|saving|\broi\b|price|currency|€|\$\s?\d/i);
  expect(src).toMatch(/No field of this output states an amount of money/);
});

test('an amount of money in prose is removed, and nothing that only looks like a number is', () => {
  for (const money of ['Projected annual savings: €5,000', 'about $3.2k per year', '15.000 EUR maintenance', 'USD 40,000 saved', '1,5 Mio. € budget', 'costs 3 000 € yearly', '€3,000–€8,000/yr', '12€ per user']) {
    const out = withoutUnapprovedMoney(money);
    expect(containsAmount(out), `${money} → ${out}`).toBe(false);
    expect(out).toContain(NO_AMOUNT);
  }
  for (const plain of ['CC-001 at line 907', 'Release 2023, 95% coverage', 'S/4HANA 2023 FPS01', 'price field NETWR', 'v2.10.4', 'wrote 2 000 000 records', 'It checks the limit [L12-40].']) {
    expect(withoutUnapprovedMoney(plain)).toBe(plain);
  }
});

test('every reader of a stored analysis masks amounts — in every stored shape', () => {
  const analysis = {
    projectTitle: 'Credit check',
    summary: 'It saves €5,000 a year [CC-001].',
    asIsContext: 'Blocks orders above USD 40,000.',
    strategicNextSteps: ['Budget 15.000 EUR for the rewrite'],
    businessValueAnalysis: { legacyAssetScore: 62, technicalDebtLevel: 'High', valueDrivers: ['Projected annual savings: €5,000'], plainEnglishActionPlan: ['Save $3.2k per quarter'] },
  };
  for (const stored of [analysis, JSON.stringify(analysis), '```json\n' + JSON.stringify(analysis) + '\n```', JSON.stringify([analysis])]) {
    const read = readStoredAnalysis<typeof analysis>(stored);
    expect(read?.businessValueAnalysis.legacyAssetScore).toBe(62);
    expect(containsAmount(JSON.stringify(read))).toBe(false);
  }
  expect(containsAmount(formatAnalysisToMarkdown(JSON.stringify(analysis)))).toBe(false);
  expect(containsAmount(formatAnalysisToMarkdown('# Legacy markdown analysis\n\nSaves €5,000.'))).toBe(false);

  // The Analyze stage, its export and the design prompt read through the shared reader, never a parse of their own.
  const page = read(ANALYZE);
  expect(page.match(/readStoredAnalysis<AnalysisData>\(project\.analysis\)/g)).toHaveLength(2);
  expect(page).not.toMatch(/project\.analysis\.replace\(\/\^```json/);
  expect(page.match(/renderMarkdownSafe\(withoutUnapprovedMoney\(project\.analysis\)\)/g)).toHaveLength(2);
  expect(read('app/(app)/project/[projectId]/design/page.tsx')).toMatch(/JSON\.stringify\(withoutUnapprovedMoneyDeep\(designContext\)\)/);
});

// ── Observed, not read: a stored analysis with amounts in its prose, opened and exported (needs the emulators) ──
test.describe('a stored analysis with amounts in its prose', () => {
  const EMAIL = `money-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'MoneyGuard123!';
  const PROJECT_ID = `money-${Date.now()}`;
  const RUN_ID = `money-run-${Date.now()}`;
  const AMOUNTS = ['€5,000', 'USD 40,000', '$3.2k'];

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Money', lastName: 'Guard', email: EMAIL, tier: 'pilot', status: 'approved',
      transformationsUsed: 1, transformationsLimit: 5, termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    // What a model or an analysis stored before step 0.4 can hold: amounts in the prose, not in a field.
    const analysis = {
      projectTitle: 'Credit check', cleanCoreScore: 62,
      summary: 'The program saves €5,000 a year.',
      asIsContext: 'It blocks orders above USD 40,000.',
      standardFit: { potential: 'Medium', targetStandardProcess: 'Credit management', rationale: 'Standard covers it.' },
      gaps: [], strategicNextSteps: ['Plan the rewrite'],
      businessValueAnalysis: { legacyAssetScore: 62, technicalDebtLevel: 'High', valueDrivers: ['Projected annual savings: €5,000'], plainEnglishActionPlan: ['Save $3.2k per quarter by retiring it'] },
    };
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Money fixture', userId: cred.user.uid, createdAt: new Date(), status: 'analyzed',
      legacyCode: PROGRAM, analysis: JSON.stringify(analysis), cleanCoreScore: 62, activeRunId: RUN_ID,
    });
    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: PROJECT_ID, userId: cred.user.uid, createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
    });
  });

  test('the Analyze stage and its Confluence export show none of them', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(4000);

    await page.goto(`/project/${PROJECT_ID}/analyze`, { waitUntil: 'domcontentloaded' });
    const exportButton = page.getByRole('button', { name: /Export Confluence/ });
    await expect(exportButton).toBeVisible({ timeout: 60000 });
    const text = await page.locator('body').innerText();
    for (const amount of AMOUNTS) expect(text, `the stage shows ${amount}`).not.toContain(amount);
    // Not vacuous: the prose is on the page, with its amount replaced.
    expect(text).toContain(NO_AMOUNT);

    const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
    const html = fs.readFileSync(await download.path(), 'utf8');
    expect(html).toContain('Business Analysis Report');
    for (const amount of AMOUNTS) expect(html, `the export carries ${amount}`).not.toContain(amount);
    expect(html).toContain(NO_AMOUNT);
  });
});

test('an analysis type carries no money field', () => {
  const src = read('lib/types.ts');
  const start = src.indexOf('businessValueAnalysis?: {');
  const block = src.slice(start, src.indexOf('};', start));
  expect(block).not.toMatch(/estimatedMaintenanceCost|cloudRoiSummary|:\s*number;\s*\/\/.*(€|EUR|cost)/i);
});

test('the Analyze stage and its export say "not determined" instead of an amount', () => {
  const audit = read('components/analyze/BusinessValueAudit.tsx');
  expect((audit.match(/data-money-not-determined/g) || []).length).toBe(2);
  expect(audit).not.toMatch(/style: 'currency'|toLocaleString\(/);
  expect(audit).not.toMatch(/Estimated Cloud ROI|ROI Calculator/);
  const page = read(ANALYZE);
  expect(page).toContain('<strong>Annual maintenance cost:</strong> not determined');
  expect(page).not.toMatch(/Expected Cloud ROI|bizFallback\.cloudRoiSummary|bizFallback\.estimatedMaintenanceCost/);
});

test('no screen outside Economics formats an amount of money', () => {
  const ALLOWED = new Set(['app/(app)/project/[projectId]/tco/page.tsx']);
  const MONEY = [/style:\s*'currency'/, /€\s?\$?\{/, /\$\{[^}]+\}\s?€/, /EUR\/yr|€\/yr|\/yr`/, /\bprojected savings\b/i];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.resolve(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(e.name) && !ALLOWED.has(rel)) {
        // Comments may tell the history of a removed figure; code and copy may not show one.
        const text = read(rel)
          .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        for (const re of MONEY) if (re.test(text)) offenders.push(`${rel} ${re}`);
      }
    }
  };
  for (const dir of ['app', 'components', 'lib']) walk(dir);
  expect(offenders).toEqual([]);
});
