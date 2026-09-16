import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';

/**
 * The analysis export is a document, not a program (SEC-2026-014).
 *
 * The Analyze stage assembles a complete HTML file and hands it to the reader
 * to download. The project name in its title was typed by the account holder;
 * the summary, the gap rows, the recommendations and the rest were written by
 * the model out of the customer's own ABAP, which a third party may have
 * supplied. A reader opens that file in a browser or pastes it into Confluence.
 *
 * The guard runs the real export in the real application and then opens what
 * came out. It has to be the produced document: a check on the source can be
 * satisfied by an escaper that is imported and never called, and the interesting
 * failure — one field out of forty missed — looks exactly like success from the
 * source. The seeded project carries a marker in every narrative field the
 * document interpolates, so a missed field shows up as a live element rather
 * than as text.
 */

const RUN_TAG = Date.now();
const EMAIL = `exportinert-${RUN_TAG}@cleancore-test.io`;
const PASSWORD = 'ExportInert123!';
const PROJECT_ID = `export-inert-${RUN_TAG}`;
const RUN_ID = `export-inert-run-${RUN_TAG}`;

/**
 * One marker, in every field. It is written to be recognisable both ways: if the
 * document escaped it, the reader sees the characters; if it did not, the
 * element is in the tree and the flag it sets is on the window.
 */
const FLAG = '__exportBreach';
const active = (where: string) => `<img src=x onerror="window.${FLAG} = '${where}'">`;
/** The other half of the rule: a value that tries to leave the attribute it sits in. */
const attributeBreak = `" onmouseover="window.${FLAG} = 'attribute'" data-x="`;

const SEEDED_FIELDS = [
  'projectTitle', 'summary', 'asIs', 'targetProcess', 'rationale',
  'gapTitle', 'gapStrategy', 'gapRationale',
  'keepClean', 'decommission', 'cloudReady', 'nextStep', 'valueDriver',
  'actionPlan', 'checkpointName', 'checkpointQuestion', 'checkpointEvaluation',
  'inAppFit', 'inAppFitDetails', 'inAppPro', 'inAppCon',
  'btpFit', 'btpFitDetails', 'btpPro', 'btpCon',
  'inventoryObject', 'inventoryModule', 'couplingTable', 'couplingAdvice',
  'worklistTitle', 'worklistLocation', 'worklistAdvice',
] as const;

const analysisFixture = {
  projectTitle: `Report title ${active('projectTitle')}`,
  cleanCoreScore: 62,
  summary: `Summary body ${active('summary')} and a quote ${attributeBreak}`,
  asIsContext: `As-is body ${active('asIs')}`,
  standardFit: {
    potential: 'Medium',
    targetStandardProcess: `J60 ${active('targetProcess')}`,
    rationale: `Fit rationale ${active('rationale')}`,
  },
  gaps: [
    {
      title: `Gap title ${active('gapTitle')}`,
      severity: 'High',
      strategy: `Gap strategy ${active('gapStrategy')}`,
      rationale: `Gap rationale ${active('gapRationale')}`,
      complexity: 'High',
    },
  ],
  recommendations: {
    keepCoreClean: `Keep clean ${active('keepClean')}`,
    decommissioning: `Decommission ${active('decommission')}`,
    cloudReadiness: `Cloud ready ${active('cloudReady')}`,
  },
  strategicNextSteps: [`Next step ${active('nextStep')}`],
  extensibilityRouting: {
    recommendedRoute: 'Side-by-Side (SAP BTP)',
    confidenceScore: 70,
    rationale: 'Routing rationale',
    targetArtifact: 'CAP service',
    decisionTreeCheckpoints: [
      {
        checkpointName: `Checkpoint ${active('checkpointName')}`,
        question: `Checkpoint question ${active('checkpointQuestion')}`,
        evaluation: `Checkpoint evaluation ${active('checkpointEvaluation')}`,
        resultState: 'Side-by-Side Preferred',
        cleanCoreImpact: 'No impact on the core.',
      },
    ],
    comparativeAnalysis: {
      inAppABAPCloud: {
        technicalFeasibility: `Partially Compatible ${active('inAppFit')}`,
        fitDetails: `In-app detail ${active('inAppFitDetails')}`,
        pros: [`In-app pro ${active('inAppPro')}`],
        cons: [`In-app con ${active('inAppCon')}`],
      },
      sideBySideBTP: {
        technicalFeasibility: `Highly Compatible ${active('btpFit')}`,
        fitDetails: `BTP detail ${active('btpFitDetails')}`,
        pros: [`BTP pro ${active('btpPro')}`],
        cons: [`BTP con ${active('btpCon')}`],
      },
    },
  },
  businessValueAnalysis: {
    legacyAssetScore: 55,
    technicalDebtLevel: 'High',
    valueDrivers: [`Value driver ${active('valueDriver')}`],
    plainEnglishActionPlan: [`Action plan ${active('actionPlan')}`],
  },
};

test.describe('the analysis export is a document, not a program', () => {
  test.setTimeout(240 * 1000);

  test.beforeAll(async () => {
    // The first call into the seed route compiles it; the default hook budget
    // is not enough for a cold dev server.
    test.setTimeout(180 * 1000);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }

    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = cred.user.uid;

    await adminSetDoc('users', uid, {
      firstName: 'Export', lastName: 'Inert', email: EMAIL,
      tier: 'pilot', status: 'approved',
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });

    await adminSetDoc('projects', PROJECT_ID, {
      // The title of the produced document is this string.
      name: `Rollout ${active('projectName')}`,
      userId: uid,
      createdAt: new Date(),
      status: 'analyzed',
      legacyCode: 'REPORT z_export_inert.\nSELECT * FROM vbak INTO TABLE @DATA(lt_orders).\nWRITE lt_orders.\n',
      analysis: JSON.stringify(analysisFixture),
      cleanCoreScore: 62,
      complexityScore: 8,
      criticalityScore: 3,
      extensibilityRoute: 'cap',
      codeInventory: [
        {
          objectName: `ZOBJECT ${active('inventoryObject')}`,
          type: 'Report',
          module: `SD ${active('inventoryModule')}`,
          criticality: 'High',
        },
      ],
      dataCoupling: [
        {
          tableName: `ZKREDIT ${active('couplingTable')}`,
          isCustom: true,
          accessType: 'Write',
          riskLevel: 'High',
          recommendation: `Coupling advice ${active('couplingAdvice')}`,
        },
      ],
      worklist: [
        {
          id: 'w1',
          title: `Worklist title ${active('worklistTitle')}`,
          severity: 'High',
          category: 'Gap',
          location: `Line 2 ${active('worklistLocation')}`,
          recommendation: `Worklist advice ${active('worklistAdvice')}`,
          effort: 'M',
          status: 'open',
        },
      ],
      activeRunId: RUN_ID,
    });

    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
      createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
    });
  });

  test('every field it interpolates comes out as text, and nothing in it runs', async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(4000);

    await page.goto(`/project/${PROJECT_ID}/analyze`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#analysis-report', { timeout: 60000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.click('button:has-text("Export Confluence")'),
    ]);

    const produced = path.join(os.tmpdir(), `cc-export-${RUN_TAG}.html`);
    await download.saveAs(produced);
    const html = fs.readFileSync(produced, 'utf8');

    // The server under test is the one carrying the change: an unescaped
    // document has no entities in it at all.
    expect(
      html,
      'the running server produced an unescaped document — it is not serving this change',
    ).toContain('&lt;img src=x onerror=');
    expect(html, 'a raw element reached the document').not.toContain('<img src=x onerror=');

    // Open what came out. A file: page has no CSP of ours to lean on, which is
    // the point: the document has to be inert on its own.
    const reader = await context.newPage();
    const ran: string[] = [];
    reader.on('pageerror', () => { /* a broken payload is still a payload; the flag below decides */ });
    await reader.goto(`file:///${produced.replace(/\\/g, '/')}`);
    await reader.waitForLoadState('load');
    // Handlers that need a paint or a hover get their chance.
    await reader.waitForTimeout(1500);
    await reader.evaluate(() => {
      document.querySelectorAll('*').forEach((el) => {
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    });

    const audit = await reader.evaluate((flagName) => {
      const handlers: string[] = [];
      document.querySelectorAll('*').forEach((el) => {
        for (const attr of Array.from(el.attributes)) {
          if (/^on/i.test(attr.name)) handlers.push(`${el.tagName}[${attr.name}]`);
          if (/^\s*(javascript|data|vbscript):/i.test(attr.value)) handlers.push(`${el.tagName}[${attr.name}=scheme]`);
        }
      });
      return {
        flag: (window as unknown as Record<string, unknown>)[flagName] ?? null,
        handlers,
        active: document.querySelectorAll('script, iframe, object, embed, form, input, img, svg, link').length,
        text: document.body.innerText,
      };
    }, FLAG);
    ran.push(...audit.handlers);

    expect(audit.flag, 'something in the produced document ran').toBeNull();
    expect(ran, 'the produced document carries behaviour on an element').toEqual([]);
    expect(audit.active, 'the produced document carries an element that can fetch or execute').toBe(0);

    // The other half: escaped, not swallowed. A document that dropped the
    // fields would also pass every check above.
    const missing = SEEDED_FIELDS.filter((f) => !audit.text.includes(`window.${FLAG} = '${f}'`));
    expect(missing, `fields that vanished from the document instead of being escaped: ${missing.join(', ')}`).toEqual([]);

    await reader.close();
    fs.unlinkSync(produced);
  });
});
