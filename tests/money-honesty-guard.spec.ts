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
  for (const money of ['Projected annual savings: €5,000', 'about $3.2k per year', '15.000 EUR maintenance', 'USD 40,000 saved', '1,5 Mio. € budget', 'costs 3 000 € yearly', '€3,000–€8,000/yr', '12€ per user', 'saves 5,000 dollars', 'about 3 million euros a year', '$ 5,000 once', '40 pounds sterling']) {
    const out = withoutUnapprovedMoney(money);
    expect(containsAmount(out), `${money} → ${out}`).toBe(false);
    expect(out).toContain(NO_AMOUNT);
  }
  for (const plain of ['CC-001 at line 907', 'Release 2023, 95% coverage', 'S/4HANA 2023 FPS01', 'price field NETWR', 'v2.10.4', 'wrote 2 000 000 records', 'It checks the limit [L12-40].', 'the euro field WAERS']) {
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

test('no text claims that a model estimates costs', () => {
  // The chatbot glossary still said "Clean-Core.io provides AI-powered TCO estimation" (QA review of bd0f38078c40):
  // Economics prices only the user's own figures, and no model puts a cost on anything.
  const CLAIMS = [/(AI|model|Gemini|LLM)[- ]?(powered|driven|based|generated)?\s+(TCO|cost|ROI|savings?)\s+(estimat|forecast|calculat|predict)/i, /provides\s+[\w-]*\s*TCO estimation/i, /(estimates|forecasts|predicts)\s+(your\s+)?(TCO|ROI|savings|maintenance costs?)/i];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.resolve(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'generated') walk(rel); }
      else if (/\.(ts|tsx|html|md)$/.test(e.name)) for (const re of CLAIMS) if (re.test(read(rel))) offenders.push(`${rel} ${re}`);
    }
  };
  for (const dir of ['app', 'components', 'lib', 'hooks']) walk(dir);
  for (const f of ['README.md', 'public/linkedin-whitepaper-template.html']) for (const re of CLAIMS) if (re.test(read(f))) offenders.push(`${f} ${re}`);
  expect(offenders).toEqual([]);
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

/**
 * Roadmap 0.3: the promises that carry no currency symbol.
 *
 * The check above catches an amount — `style: 'currency'`, `€${…}`, `/yr`. It
 * cannot catch a promise written in words, and that is where the last ones were
 * hiding: "predict your TCO savings" in the hero of /clean-core-score, "A high
 * score dramatically minimizes this testing effort" in an answer that shipped as
 * schema.org markup, "Calculates the reduction in testing and development costs"
 * as a pillar of the score itself, "saving days of manual mapping" on /about and
 * in the LinkedIn whitepaper, "80% faster code assessment" in a sidebar. Not one
 * of them contains a number the product computes.
 *
 * `tests/benefit-card-guard.spec.ts` has had the right regexes since the release
 * that removed this genre from the cards — scoped to one component file. This is
 * the same rule applied where the traffic is.
 *
 * Two deliberate softenings, both to keep the guard from banning honesty:
 *   - a sentence that negates the claim passes ("we do not claim it saves you
 *     days" is the disavowal, not the promise);
 *   - the Economics stage is allowed, because it is the one screen that states
 *     its assumptions before its figures and is pinned by four other specs.
 */
test('no page promises an outcome nobody measured', () => {
  const ALLOWED = new Set(['app/(app)/project/[projectId]/tco/page.tsx']);
  const PROMISES: { re: RegExp; why: string }[] = [
    { re: /\b\d+\s*%\s*(faster|quicker|cheaper|less|lower|fewer|reduction|savings?)\b/i, why: 'a percentage nothing measured' },
    { re: /\b(save|saves|saving)\s+(you\s+)?(days|weeks|hours|months)\b/i, why: 'a time saving nobody can check' },
    { re: /\bpredict(s|ing)?\s+(your\s+)?(tco|roi|savings?|costs?)\b/i, why: 'a forecast lib/tco-model.ts refuses to make' },
    { re: /\breduces?\s+(your\s+)?(tco|total cost of ownership)\b/i, why: 'a TCO reduction nothing computes' },
    { re: /\bcalculates?\s+the\s+reduction\s+in\b/i, why: 'a reduction nothing calculates' },
    { re: /\bpays?\s+for\s+itself\b/i, why: 'a payback nobody measured' },
    { re: /\bdramatically\s+(minimi|reduc|lower)/i, why: 'an intensifier standing in for a measurement' },
    { re: /\bTCO\s+by\s+\d/i, why: 'a TCO delta nothing computes' },
  ];
  // A sentence that says the claim is NOT made is the fix, not the offence —
  // but the negation has to be attached to the claim, not merely somewhere in
  // the same sentence. Testing the whole sentence let any unrelated negation
  // wave the promise through: "this is not a workshop — it saves you days of
  // manual mapping" would have passed (QA review of 5e27b10cac02). The
  // negation now has to stand in the run-up to the matched phrase, which is
  // where a disavowal of it actually stands.
  //
  // `no` and `without` stay out of the list on purpose: they appear all over
  // the copy for unrelated reasons, and letting them excuse a claim let the
  // LinkedIn whitepaper's "saving days of manual mapping and boilerplate,
  // without ever replacing the judgment of the expert" through on the first run.
  const NEGATION = /\b(not|never|neither)\b/i;
  // The clause the phrase sits in, and no further. A window of N characters is
  // not enough — "The score does not replace review, but it predicts your TCO
  // savings" puts the negation 32 characters from the claim and negates
  // something else entirely. A clause boundary is what ends a negation's reach.
  const CLAUSE_BREAK = /[,;:—–]|\b(?:but|however|yet|though|although|while|and)\b/gi;
  const disavowedAt = (sentence: string, at: number): boolean => {
    const runUp = sentence.slice(0, at);
    let start = 0;
    for (const m of runUp.matchAll(CLAUSE_BREAK)) start = (m.index ?? 0) + m[0].length;
    return NEGATION.test(runUp.slice(start));
  };

  const offencesIn = (rel: string, raw: string): string[] => {
    const text = raw
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    const found: string[] = [];
    for (const { re, why } of PROMISES) {
      for (const sentence of text.split(/(?<=[.!?])\s+|\n/)) {
        const hit = re.exec(sentence);
        if (!hit || disavowedAt(sentence, hit.index)) continue;
        found.push(`${rel}: ${why} — ${sentence.trim().slice(0, 120)}`);
      }
    }
    return found;
  };

  // The guard has to be shown to still catch things, because every change to it
  // so far has been a change that made it catch less. Left column: what it must
  // flag. Right column: what it must let through, all of them sentences that
  // are really in the product.
  const MUST_FLAG = [
    // The counter-example from the QA review of dbf74bbeaa13: a negation that
    // governs a different clause entirely.
    'The score does not replace review, but it predicts your TCO savings.',
    'This is not a workshop — it saves you days of manual mapping.',
    'Clean Core work pays for itself within a year.',
    'Teams report 40% fewer regressions after decoupling.',
  ];
  const MUST_PASS = [
    'We do not claim it saves you days: what takes time is the decisions, and those stay with you.',
    'No cost, saving or ROI figure is derived from the Clean Core Score anywhere in the product.',
    'First pass in minutes, not a workshop.',
  ];
  for (const sentence of MUST_FLAG) {
    expect(offencesIn('fixture', sentence), `the guard no longer catches: ${sentence}`).not.toEqual([]);
  }
  for (const sentence of MUST_PASS) {
    expect(offencesIn('fixture', sentence), `the guard now bans an honest sentence: ${sentence}`).toEqual([]);
  }

  const offenders: string[] = [];
  const inspect = (rel: string, raw: string) => { offenders.push(...offencesIn(rel, raw)); };

  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.resolve(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'generated') walk(rel); }
      else if (/\.(ts|tsx)$/.test(e.name) && !ALLOWED.has(rel)) inspect(rel, read(rel));
    }
  };
  for (const dir of ['app', 'components', 'lib', 'hooks']) walk(dir);
  for (const f of ['README.md', 'public/linkedin-whitepaper-template.html']) inspect(f, read(f));

  expect(offenders).toEqual([]);
});
