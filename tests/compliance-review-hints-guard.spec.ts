import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import {
  CONCERN_COPY,
  COMPLIANCE_CONCERNS,
  complianceReviewHints,
  concernsRaised,
  examinedTablesFromCoupling,
  examinedTablesFromDependencies,
  type ExaminedTable,
} from '../lib/compliance-review-hints';
import {
  COMPLIANCE_HINT_LEAD,
  COMPLIANCE_HINT_TITLE,
  complianceCoverageLine,
} from '../components/ComplianceReviewHints';

/**
 * Roadmap 7.7 — "Prüfhinweise Compliance: … sie bestimmen Prüftiefe und
 * Testpflicht, sind aber **Hinweise, keine Einstufung**."
 *
 * That last clause is the whole step, and it is the kind of line a product
 * drifts across one adjective at a time. "Tables of this kind often carry
 * personal data" becomes "this table carries personal data" becomes "personal
 * data detected", and nobody decides any of it — each edit looks like a
 * tightening of the prose. So the line is written down here and the build stops
 * on it.
 *
 * Four halves, and each one can fail on its own:
 *
 *   1. **No model.** Not asserted from a comment: every `import` in the module
 *      is checked to be an `import type` (erased at compile time, so nothing
 *      reachable at runtime), the two files are read for the names of every
 *      model path this repository has, and then the function is called with
 *      `globalThis.fetch` replaced by something that throws. A module that
 *      reached for the network would take that exception.
 *   2. **The derivation is real.** An input naming one table of every family is
 *      run through, and every family has to come back. A pattern that stopped
 *      matching would quietly produce a shorter list, and a test that only
 *      checked "some hints came back" would not notice.
 *   3. **The wording, in source.** The forbidden sentences below are the ones
 *      that would turn a hint into a classification. They are asserted against
 *      the module, the panel and the page that renders it, the way
 *      `tests/personal-data-hint-gate.spec.ts` asserts its own.
 *   4. **The wording, as a reader meets it.** A source grep is satisfied by a
 *      component that assembles the forbidden sentence out of two variables;
 *      rendered text is not. The last test opens the page with `/api/gemini`
 *      aborted at the browser, so the panel that appears is provably not a
 *      model's work, and reads what it says.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/**
 * The file with its comments taken out.
 *
 * Both halves below need it, for the same reason and in opposite directions. A
 * comment cannot call a model, and the module's header names `/api/gemini`
 * precisely in order to say it does not use it — asserted against the raw file,
 * the disclaimer fails its own assertion. A comment cannot render a sentence
 * either, and the header of the panel quotes *"this table contains personal
 * data"* as the thing it must never print. `tests/unearned-verdicts-guard.spec.ts`
 * strips comments for the same reason: the explanation above a fix must not be
 * able to satisfy, or break, the check it explains.
 */
const code = (rel: string) =>
  read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const MODULE = 'lib/compliance-review-hints.ts';
const PANEL = 'components/ComplianceReviewHints.tsx';
const ANALYZE = 'app/(app)/project/[projectId]/analyze/page.tsx';

/* ==================================================================== *
 * 1 — Nothing here asks a model.
 * ==================================================================== */

/** Every way this repository reaches a model, by name. */
const MODEL_PATHS = [
  '/api/gemini',
  'generateContent',
  'GoogleGenerativeAI',
  'GenerativeModel',
  'openrouter',
  'OPENROUTER',
  'callGemini',
  'geminiProxy',
];

test.describe('the hints are computed, not generated', () => {
  test('the module imports nothing that survives compilation', () => {
    const src = code(MODULE);
    const imports = src.match(/^import\s[\s\S]*?from\s+'[^']+';$/gm) ?? [];
    expect(imports.length, 'the import scan found nothing to look at').toBeGreaterThan(0);
    for (const line of imports) {
      expect(
        line,
        `${MODULE} has a value import (${line.split('\n')[0]}). Everything it needs is a type; a value ` +
          'import is how 4 MB of catalog JSON reached a client bundle once before ' +
          '(lib/abap/public-cloud-fit-resolver.ts documents that morning).',
      ).toMatch(/^import type\s/);
    }
  });

  for (const rel of [MODULE, PANEL]) {
    test(`${rel} names no model path and no fetch`, () => {
      const src = code(rel);
      for (const needle of MODEL_PATHS) {
        expect(src, `${rel} reaches a model through ${needle}`).not.toContain(needle);
      }
      expect(src, `${rel} calls fetch`).not.toMatch(/\bfetch\s*\(/);
    });
  }

  test('and it still answers with the network taken away', () => {
    const tables = examinedTablesFromCoupling([
      { tableName: 'PA0002', accessType: 'Read', isCustom: false, riskLevel: 'High', recommendation: '' },
      { tableName: 'BSEG', accessType: 'Write', isCustom: false, riskLevel: 'High', recommendation: '' },
    ]);

    const realFetch = globalThis.fetch;
    // Not a mock that records calls — one that makes a call impossible. A
    // recording mock proves nothing about a module that catches its own errors.
    globalThis.fetch = (() => {
      throw new Error('a compliance hint tried to reach the network');
    }) as unknown as typeof fetch;
    try {
      const report = complianceReviewHints(tables);
      expect(report.hints.map((h) => h.family)).toEqual(['hr-infotype', 'financial-document']);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('the same tables always give the same hints', () => {
    const tables = examinedTablesFromCoupling([
      { tableName: 'LFA1', accessType: 'Read', isCustom: false, riskLevel: 'Medium', recommendation: '' },
      { tableName: 'CDPOS', accessType: 'Read', isCustom: false, riskLevel: 'Low', recommendation: '' },
    ]);
    expect(JSON.stringify(complianceReviewHints(tables))).toBe(
      JSON.stringify(complianceReviewHints(tables)),
    );
  });
});

/* ==================================================================== *
 * 2 — The derivation is real, and it comes off the tables the engine found.
 * ==================================================================== */

/** One table per family, in the families' own order. */
const ONE_PER_FAMILY: { table: string; family: string }[] = [
  { table: 'PA0002', family: 'hr-infotype' },
  { table: 'ADR6', family: 'address' },
  { table: 'USR02', family: 'user-master' },
  { table: 'LFA1', family: 'business-partner' },
  { table: 'BSET', family: 'financial-document' },
  { table: 'VBRP', family: 'billing-document' },
  { table: 'T007A', family: 'tax-configuration' },
  { table: 'CDHDR', family: 'change-log' },
];

const asRead = (names: string[]): ExaminedTable[] =>
  names.map((table) => ({ table, touch: 'read' as const, lines: [] }));

test.describe('the hints follow the tables the code reads', () => {
  test('every family this module claims to know is reachable', () => {
    const report = complianceReviewHints(asRead(ONE_PER_FAMILY.map((f) => f.table)));
    expect(
      report.hints.map((h) => h.family),
      'a family stopped matching its own example table — its pattern or its name list has drifted',
    ).toEqual(ONE_PER_FAMILY.map((f) => f.family));
    expect(report.unrecognised).toEqual([]);
    expect(concernsRaised(report)).toEqual(COMPLIANCE_CONCERNS);
  });

  test('a table nobody can name is reported, not passed over', () => {
    const report = complianceReviewHints(asRead(['ZCC_ORDER_EXT', 'PA0008', 'MARA']));
    expect(report.hints.map((h) => h.family)).toEqual(['hr-infotype']);
    // The two the product cannot say anything about are named. Silence here
    // would read as a clean bill for a Z table nobody has looked inside.
    expect(report.unrecognised).toEqual(['MARA', 'ZCC_ORDER_EXT']);
    expect(report.examined).toBe(3);
  });

  test('a type reference is not turned into a read', () => {
    const report = complianceReviewHints(
      examinedTablesFromDependencies([
        { table: 'KNA1', access: 'reference', route: 'type-reference', statement: 0, line: 4, snippet: 'TABLES: kna1' },
      ]),
    );
    expect(report.hints[0].tables[0].touch).toBe('reference');
  });

  test('a read and a write of one table become one row that says both', () => {
    const report = complianceReviewHints(
      examinedTablesFromDependencies([
        { table: 'BSEG', access: 'read', route: 'open-sql', statement: 0, line: 10, snippet: 'SELECT' },
        { table: 'BSEG', access: 'write', route: 'open-sql', statement: 1, line: 22, snippet: 'UPDATE' },
        { table: 'BSEG', access: 'reference', route: 'type-reference', statement: 2, line: 3, snippet: 'TABLES' },
      ]),
    );
    expect(report.hints[0].tables).toHaveLength(1);
    expect(report.hints[0].tables[0].touch).toBe('read-write');
    expect(report.hints[0].tables[0].lines).toEqual([3, 10, 22]);
  });

  test('a project with no analysed tables produces nothing to answer', () => {
    expect(complianceReviewHints(examinedTablesFromCoupling([])).examined).toBe(0);
    expect(complianceReviewHints(null).hints).toEqual([]);
  });
});

/* ==================================================================== *
 * 3 — Hints, not a classification: the wording.
 * ==================================================================== */

/**
 * Every sentence below would turn the hint into a statement about the reader's
 * data, or into a duty this product is in no position to impose.
 *
 * They are written to fire on the affirmative form only, so that the panel can
 * still say what it is *not* doing — "it has not read a single row" has to stay
 * sayable, or the honest half of the page cannot be written.
 */
const FORBIDDEN: RegExp[] = [
  // A claim about the rows in the reader's system.
  /\b(?:this|that|these|those|the)\s+tables?\s+(?:contains?|holds?|stores?|carries|carry)\b/i,
  /\b(?:rows?|records?|entries)\s+(?:is|are)\s+(?:personal|tax-relevant|audit-relevant)\b/i,
  /\b(?:is|are)\s+(?:personal|tax-relevant|audit-relevant|revision-relevant)\s+data\b/i,
  // A claim that the product established it.
  /\b(?:personal|tax-relevant|audit-relevant)\s+data\s+(?:was|were|is|are|has been|have been)\s+(?:found|detected|identified|classified|confirmed)\b/i,
  /\b(?:we|it|this|clean-core\.io|the platform|the engine)\s+(?:classifies|classified|determines|determined|establishes|established|confirms|confirmed|certifies|certified)\b/i,
  /\b(?:personal|tax|audit|compliance)\s+(?:data\s+)?(?:classification|detection|screening)\b/i,
  // The clean bill, which is the same claim wearing the other coat.
  /\bno\s+(?:personal|tax-relevant|audit-relevant)\s+data\b/i,
  /\b(?:all|every|each)\s+(?:relevant\s+)?(?:personal|tax-relevant|audit-relevant)\s+(?:data|tables?|records?)\b/i,
  // A verdict on somebody's compliance, or a duty imposed on them.
  /\b(?:gdpr|dsgvo|gobd|sox|hgb)\b[^.]{0,60}\b(?:compliant|non-compliant|violation|breach|satisfied)\b/i,
  /\byou\s+(?:must|have to|are required to|are obliged to|need to)\b/i,
];

/**
 * "…holds personal data" is a classification; "may hold personal data" is a
 * hint. The two differ by one word, so the rule is the word, not the phrase.
 *
 * A flat forbidden pattern cannot express that — the first version of this
 * guard forbade the phrase outright and immediately failed on the analyze
 * page's own, correct sentence *"look as though they may hold personal
 * data"* (roadmap's earlier upload hint). So every occurrence is found, and
 * each one has to carry a hedge in the words just before it. That is the rule
 * as it is actually meant, and it holds for sentences nobody has thought of
 * yet.
 */
const REGULATED_CLAIM =
  /(?:contains?|holds?|carries|carry|stores?)\s+(?:your\s+|the\s+|any\s+|all\s+)?(?:personal|tax-relevant|audit-relevant|revision-relevant)\s+data\b/gi;
const HEDGE = /\b(?:may|might|could|often|usually|normally|whether|as though|look|looks|looked|cannot|can't|not|no|never|if)\b/i;
/** How far back a hedge still counts as belonging to the claim. */
const HEDGE_WINDOW = 70;

function unhedgedClaims(text: string): string[] {
  const offenders: string[] = [];
  for (const match of text.matchAll(REGULATED_CLAIM)) {
    const at = match.index ?? 0;
    const before = text.slice(Math.max(0, at - HEDGE_WINDOW), at);
    if (!HEDGE.test(before)) offenders.push(`${before.slice(-50)}»${match[0]}«`);
  }
  return offenders;
}

test.describe('the source says "often carry", never "contains"', () => {
  /**
   * The full list runs against the two files whose whole subject is this hint,
   * where every word is mine to answer for.
   *
   * It is deliberately not run against the analyze page. That page says many
   * other things — "You must plan to decommission … custom logic" is advice
   * about clean core and not about anybody's data — and a rule broad enough to
   * be useful inside the panel fires on them. The page is held instead by the
   * two rules that are about this subject by construction: it must render the
   * panel, and it must not state unhedged that anything holds regulated data.
   */
  for (const rel of [MODULE, PANEL]) {
    test(`${rel} classifies nobody's data`, () => {
      const src = code(rel);
      for (const claim of FORBIDDEN) {
        expect(
          src,
          `${rel} states as fact what tables of a kind only tend to hold (${claim}). Roadmap 7.7 is ` +
            'explicit: "Hinweise, keine Einstufung."',
        ).not.toMatch(claim);
      }
    });
  }

  for (const rel of [MODULE, PANEL, ANALYZE]) {
    test(`${rel} never says a table holds regulated data without hedging it`, () => {
      expect(
        unhedgedClaims(code(rel)),
        `${rel} states outright that something holds personal, tax-relevant or audit-relevant data. ` +
          'The product has read no rows and cannot know; "may hold" and "often carry" are the forms ' +
          'that are true.',
      ).toEqual([]);
    });
  }

  test('the analyze stage shows the hint rather than writing one of its own', () => {
    const src = code(ANALYZE);
    expect(src, 'the analyze stage no longer renders the compliance hint').toContain(
      '<ComplianceReviewHints',
    );
    expect(src).toContain("from '@/components/ComplianceReviewHints'");
    // Both branches that show the table evidence — the evidence-only report and
    // the analysed one. One of them carrying the hint and the other not is how a
    // reader comes to see it on Monday and not on Tuesday.
    expect(src.match(/<ComplianceReviewHints/g) ?? []).toHaveLength(
      (src.match(/<DataCouplingTable/g) ?? []).length,
    );
  });

  test('and the rule itself catches the sentence it exists for', () => {
    // Non-vacuous: a rule nobody has seen fail is a rule nobody has checked.
    expect(unhedgedClaims('This table contains personal data.')).toHaveLength(1);
    expect(unhedgedClaims('Lines that look as though they may hold personal data.')).toEqual([]);
  });

  test('every concern is an instruction to the reader, not a label on the table', () => {
    for (const concern of COMPLIANCE_CONCERNS) {
      const copy = CONCERN_COPY[concern];
      expect(
        copy.label,
        `the chip for ${concern} reads "${copy.label}" — a bare category beside a table name is a ` +
          'classification however the paragraph under it is worded',
      ).toMatch(/^Check\b/);
    }
  });

  test('every sentence about review depth hedges and hands the decision away', () => {
    for (const concern of COMPLIANCE_CONCERNS) {
      const { depth } = CONCERN_COPY[concern];
      expect(depth, `${concern} states what follows as certain`).toMatch(
        /\b(?:normally|usually|often|may|might|can|where|whether)\b/i,
      );
      expect(
        depth,
        `${concern} tells the reader what is required instead of who decides it`,
      ).toMatch(/\b(?:your|for your organisation|to say|sets that bar)\b/i);
    }
  });

  test('the panel admits what it cannot do, in so many words', () => {
    expect(COMPLIANCE_HINT_LEAD).toContain('This is a hint, not a classification');
    expect(COMPLIANCE_HINT_LEAD).toContain('has not read a single row');
    expect(COMPLIANCE_HINT_LEAD).toMatch(/it will miss things/);
    expect(COMPLIANCE_HINT_LEAD).toMatch(/decide for yourself/);
  });

  test('and the closing count never reads as a clean bill', () => {
    const line = complianceCoverageLine(complianceReviewHints(asRead(['PA0002', 'ZCC_X', 'MARA'])));
    expect(line).toContain('not a clean result');
    expect(line).toContain('every table of your own');
  });
});

/* ==================================================================== *
 * 4 — And what the browser paints, with the model unreachable.
 * ==================================================================== */

const EMAIL = `compliance-hint-${Date.now()}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `compliance-hint-project-${Date.now()}`;

test.describe('the panel a reader actually meets', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
    const uid = cred.user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Compliance', lastName: 'Hint', email: EMAIL, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    // A finished run with no narrative: the analyze stage then renders the
    // evidence-only report, which is the branch that carries the table panels.
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Compliance hint fixture',
      userId: uid,
      createdAt: new Date(),
      status: 'analyzed',
      legacyCode: 'REPORT z_compliance_fixture.\n',
      activeRunId: `${PROJECT_ID}-run`,
      cleanCoreScore: 41,
      dataCoupling: [
        { tableName: 'PA0002', accessType: 'Read', isCustom: false, riskLevel: 'High', recommendation: 'Use I_HRMasterDataPersonal', lineNumbers: [12] },
        { tableName: 'BSEG', accessType: 'Write', isCustom: false, riskLevel: 'High', recommendation: 'Use I_JournalEntryItem', lineNumbers: [40, 55] },
        { tableName: 'ZCC_ORDER_EXT', accessType: 'Read/Write', isCustom: true, riskLevel: 'Low', recommendation: 'Own table', lineNumbers: [61] },
      ],
    });
    await adminSetDoc(`projects/${PROJECT_ID}/runs`, `${PROJECT_ID}-run`, {
      runId: `${PROJECT_ID}-run`,
      projectId: PROJECT_ID,
      userId: uid,
      createdAt: new Date().toISOString(),
      status: 'completed',
      cleanCoreScore: 41,
    });
  });

  test('the panel renders in full with the model route cut off, and claims nothing', async ({ page }) => {
    test.setTimeout(180 * 1000);

    // The strongest available proof that no sentence below is a model's: the
    // model cannot be reached from this browser at all.
    const modelCalls: string[] = [];
    await page.route('**/api/gemini**', async (route) => {
      modelCalls.push(route.request().url());
      await route.abort();
    });

    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', SIGN_IN);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(3500);
    await page.goto(`/project/${PROJECT_ID}/analyze`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-stage-title]', { timeout: 30000 });

    const panel = page.locator('[data-compliance-hints]');
    await expect(panel, 'three analysed tables produced no compliance hint at all').toBeVisible({
      timeout: 30000,
    });
    await expect(panel.locator('[data-compliance-hints-title]')).toHaveText(COMPLIANCE_HINT_TITLE);

    // The two families the fixture touches, and the concerns they raise.
    await expect(panel.locator('[data-compliance-hint="hr-infotype"]')).toHaveCount(1);
    await expect(panel.locator('[data-compliance-hint="financial-document"]')).toHaveCount(1);
    await expect(panel.locator('[data-compliance-concern="personal-data"]')).toHaveCount(1);
    await expect(panel.locator('[data-compliance-concern="tax-relevant"]')).toHaveCount(1);

    const shown = await panel.innerText();

    // The access is the one the analysis recorded, per table — PA0002 is read,
    // BSEG is written to, and neither sentence is the other one.
    expect(shown).toContain('This code reads PA0002');
    expect(shown).toContain('This code writes to BSEG');
    expect(shown).toContain('lines 40, 55');

    // The bridge sentence, which is the whole distinction in one line.
    expect(shown).toContain('Tables of this kind often carry');
    expect(shown).toContain('is not something Clean-Core.io can see');

    // The Z table is named as something the product has no hint for, rather than
    // left out and thereby implied to be fine.
    expect(shown).toContain('ZCC_ORDER_EXT');
    expect(shown).toContain('not a clean result');

    // And the wording, as a reader meets it.
    for (const claim of FORBIDDEN) {
      expect(shown, `the rendered panel classifies the reader's data (${claim})`).not.toMatch(claim);
    }
    expect(
      unhedgedClaims(shown),
      'the rendered panel states outright that something holds regulated data',
    ).toEqual([]);

    expect(
      modelCalls,
      'the page asked a model while this panel was on screen — the abort kept it out, but the call ' +
        'means something here is not deterministic',
    ).toEqual([]);
  });
});