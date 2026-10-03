import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import { buildOriginEngine } from '../lib/scenario-origin-engine';
import { sha256Hex } from '../lib/artefact-digest';
import {
  checkScenarioOrigin,
  countOrigins,
  numberedSource,
  originPromptSection,
  originSummary,
  parseScenarioOrigin,
  readScenarioOrigin,
  withOriginCheck,
  type ScenarioOrigin,
} from '../lib/scenario-origin';
import { derivedFrom, scenarioFields } from '../components/testing/scenario-detail';

/**
 * Test scenarios state their origin, and the product checks it (owner decision
 * 03.10.2026, translated: "Yes, ask for it — and check it.").
 *
 * Held here:
 *  - the statement is validated; a malformed one is dropped and read as not
 *    stated, never thrown and never repaired;
 *  - the check is deterministic and reads the signed source and the engine:
 *    BR-009 at L412 of Z_MM_PO_APPROVAL matches; a wrong line, a wrong id or a
 *    wrong quote is a mismatch; lines without an engine rule are "not anchored";
 *  - a stored check is client-written, so the stage runs the check again once
 *    the source can be read — a forged "anchored" does not survive the load;
 *  - the row chip, the summary and the details show it, on a desktop and on a
 *    390 px phone, and the line anchors open the source in place.
 */

const PO_FILE = 'Z_MM_PO_APPROVAL.abap';
const PO = readFileSync(join(process.cwd(), 'public/starter-examples', PO_FILE), 'utf8');

const stated = (raw: unknown): ScenarioOrigin => {
  const parsed = parseScenarioOrigin(raw);
  if (parsed.state !== 'stated') throw new Error(`not stated: ${JSON.stringify(parsed)}`);
  return parsed.origin;
};

// ── The check, without a browser ──────────────────────────────────────────────

test.describe('the origin check on Z_MM_PO_APPROVAL', () => {
  const engine = buildOriginEngine(PO, [{ id: 'CC-001', title: 'Direct read of EBAN', lineStart: 60 }]);

  test('BR-009 at L412 matches, with or without its quote', () => {
    const check = checkScenarioOrigin(stated({ kind: 'rule', ref: 'BR-009', lines: [412] }), engine);
    expect(check.outcome).toBe('anchored');
    expect(check.sentence).toBe('Checked against the signed source: matches BR-009 at L412.');
    expect(check.matches).toEqual([{ kind: 'rule', id: 'BR-009', label: 'lv_dev_pct > 5', lineStart: 412, lineEnd: 412, by: 'ref' }]);
    expect(check.sourceSha256).toBe(sha256Hex(PO));
    // Spelled loosely, quoted with other indentation: the same statement.
    const loose = checkScenarioOrigin(stated({ kind: 'Rule', ref: 'br-9', lines: ['L412'], quote: '  IF   lv_dev_pct > 5.' }), engine);
    expect(loose.outcome).toBe('anchored');
    // No reference, but the lines carry the rule: anchored, and it says it was found by line.
    const byLine = checkScenarioOrigin(stated({ kind: 'rule', lines: ['410-413'] }), engine);
    expect(byLine.outcome).toBe('anchored');
    expect(byLine.matches.map((m) => [m.id, m.by])).toEqual([['BR-009', 'lines']]);
    // The gateway the skeleton draws from the same IF is a decision point.
    const decision = checkScenarioOrigin(stated({ kind: 'decision', ref: 'nd-262-0', lines: [412] }), engine);
    expect(decision.outcome).toBe('anchored');
    expect(decision.sentence).toContain('IF lv_dev_pct > 5');
  });

  test('a wrong line, a wrong id or a wrong quote is flagged as a mismatch', () => {
    const wrongLine = checkScenarioOrigin(stated({ kind: 'rule', ref: 'BR-009', lines: [500] }), engine);
    expect(wrongLine.outcome).toBe('mismatch');
    expect(wrongLine.problems[0]).toMatch(/^BR-009 stands at L412.*not at L500\.$/);
    const wrongRef = checkScenarioOrigin(stated({ kind: 'rule', ref: 'BR-099', lines: [412] }), engine);
    expect(wrongRef.outcome).toBe('mismatch');
    expect(wrongRef.problems[0]).toBe('BR-099 is not a business rule the engine reads in this source.');
    // A rule id named as a decision point is not one.
    expect(checkScenarioOrigin(stated({ kind: 'decision', ref: 'BR-009', lines: [412] }), engine).outcome).toBe('mismatch');
    const wrongQuote = checkScenarioOrigin(stated({ kind: 'rule', ref: 'BR-009', lines: [412], quote: 'IF lv_dev_pct > 7.' }), engine);
    expect(wrongQuote.outcome).toBe('mismatch');
    expect(wrongQuote.problems[0]).toContain('does not stand on L412');
    const pastTheEnd = checkScenarioOrigin(stated({ kind: 'rule', lines: [9999] }), engine);
    expect(pastTheEnd.outcome).toBe('mismatch');
    expect(pastTheEnd.problems[0]).toBe('L9999 is past the end of the source, which has 668 lines.');
  });

  test('lines with no engine rule are not anchored; a missing statement is not stated', () => {
    const header = checkScenarioOrigin(stated({ kind: 'rule', lines: [2] }), engine);
    expect(header.outcome).toBe('lines-only');
    expect(header.sentence).toBe('L2 exists in the signed source, but no business rule of the engine stands there.');
    expect(checkScenarioOrigin(null, engine).outcome).toBe('not-stated');
    // A finding with no findings read is not checked, never assumed.
    const noFindings = buildOriginEngine(PO, null);
    expect(checkScenarioOrigin(stated({ kind: 'finding', ref: 'CC-001', lines: [60] }), noFindings).outcome).toBe('not-checked');
    expect(checkScenarioOrigin(stated({ kind: 'finding', ref: 'CC-001', lines: [60] }), engine).outcome).toBe('anchored');
  });

  test('the same statement and the same source give the same result', () => {
    const origin = stated({ kind: 'rule', ref: 'BR-010', lines: ['422-424'] });
    const again = buildOriginEngine(PO, null);
    expect(checkScenarioOrigin(origin, again)).toEqual(checkScenarioOrigin(origin, buildOriginEngine(PO, null)));
  });

  test('the summary counts the scenarios anchored to a rule', () => {
    const checks = [
      { kind: 'rule', ref: 'BR-009', lines: [412] },
      { kind: 'decision', ref: 'nd-262-0', lines: [412] },
      { kind: 'rule', ref: 'BR-009', lines: [500] },
      { kind: 'rule', lines: [2] },
      null,
    ].map((raw) => checkScenarioOrigin(raw ? stated(raw) : null, engine));
    const counts = countOrigins(checks);
    expect(counts).toEqual({ total: 5, anchored: 2, anchoredToRule: 1, mismatch: 1, notAnchored: 2, notChecked: 0 });
    expect(originSummary(counts)).toBe('1 of 5 anchored to a business rule · 1 more anchored to the code · 1 mismatch · 2 not anchored');
  });

  test('the prompt shows numbered lines and the engine ids to choose from', () => {
    expect(numberedSource('A\nB').split('\n')).toEqual(['1| A', '2| B']);
    const ask = originPromptSection(engine);
    expect(ask).toContain('"derivedFrom"');
    expect(ask).toContain('BR-009 at L412');
    expect(ask).toContain('nd-262-0 at L412');
    expect(ask).toContain('CC-001 at L60');
    expect(ask).toMatch(/Never guess an id or a line/);
  });
});

test.describe('the statement is validated, and malformed input is dropped', () => {
  test('malformed values are refused with a reason, never thrown', () => {
    const malformed: unknown[] = [
      'BR-009 at L412',
      42,
      [{ kind: 'rule', lines: [1] }],
      { kind: 'requirement', lines: [1] },
      { kind: 'rule' },
      { kind: 'rule', lines: [] },
      { kind: 'rule', lines: [0] },
      { kind: 'rule', lines: [-4] },
      { kind: 'rule', lines: [1.5] },
      { kind: 'rule', lines: ['412-400'] },
      { kind: 'rule', lines: ['next to the IF'] },
      { kind: 'rule', lines: [[1, 2, 3]] },
      { kind: 'rule', lines: [1], ref: 9 },
      { kind: 'rule', lines: [1], ref: 'BR-009; DROP' },
      { kind: 'rule', lines: [1], quote: { text: 'x' } },
      { kind: 'rule', lines: [1], quote: 'x'.repeat(401) },
      { kind: 'rule', lines: Array.from({ length: 21 }, (_, i) => i + 1) },
    ];
    for (const raw of malformed) {
      const parsed = parseScenarioOrigin(raw);
      expect(parsed.state, JSON.stringify(raw).slice(0, 80)).toBe(typeof raw === 'string' && !raw.trim() ? 'not-stated' : 'malformed');
    }
    expect(parseScenarioOrigin(undefined).state).toBe('not-stated');
    expect(parseScenarioOrigin(null).state).toBe('not-stated');
    expect(parseScenarioOrigin('  ').state).toBe('not-stated');
  });

  test('every accepted form of a line becomes one Firestore-safe range', () => {
    const origin = stated({ kind: 'rule', ref: ' BR-9 ', lines: [412, '413', 'L414', '415-416', 'L417-L418', [419, 420], { start: 421, end: 421 }, 412], quote: ' IF x. ' });
    expect(origin).toEqual({
      kind: 'rule',
      ref: 'BR-009',
      quote: 'IF x.',
      lines: [
        { start: 412, end: 412 }, { start: 413, end: 413 }, { start: 414, end: 414 }, { start: 415, end: 416 },
        { start: 417, end: 418 }, { start: 419, end: 420 }, { start: 421, end: 421 },
      ],
    });
    // No nested arrays and no undefined: Firestore refuses both.
    expect(JSON.stringify(origin)).not.toMatch(/\[\[/);
  });

  test('a stored scenario keeps every field; a malformed origin is dropped and recorded', () => {
    const engine = buildOriginEngine(PO, null);
    const tc: Record<string, unknown> = { id: 'TC_01', name: 'Hold above tolerance', steps: ['a'], derivedFrom: { kind: 'rule', lines: 'beside the IF' } };
    const stored = withOriginCheck(tc, engine, 'no engine');
    expect(stored).not.toHaveProperty('derivedFrom');
    expect(stored.derivedFromDropped).toMatch(/^The model's statement of origin was dropped: /);
    expect((stored.derivedFromCheck as { outcome: string }).outcome).toBe('not-stated');
    expect(stored.name).toBe('Hold above tolerance');
    expect(Object.values(stored).includes(undefined)).toBe(false);
    // The extra keys are the check's, not fields of the scenario.
    expect(scenarioFields(stored).map((f) => f.key)).not.toContain('derivedFromCheck');
    expect(scenarioFields(stored).map((f) => f.key)).not.toContain('derivedFromDropped');

    const good = withOriginCheck({ id: 'TC_02', derivedFrom: { kind: 'rule', ref: 'BR-009', lines: [412] } }, engine, 'no engine');
    expect(good.derivedFrom).toEqual({ kind: 'rule', ref: 'BR-009', lines: [{ start: 412, end: 412 }] });
    expect((good.derivedFromCheck as { outcome: string }).outcome).toBe('anchored');
    // Without an engine: stored as not checked, with the reason.
    const unchecked = withOriginCheck({ id: 'TC_03', derivedFrom: { kind: 'rule', lines: [412] } }, null, 'The source has changed.');
    expect(unchecked.derivedFromCheck).toMatchObject({ outcome: 'not-checked', sentence: 'The source has changed.', sourceSha256: null });
  });

  test('older scenarios without it keep working, and a free-text origin stays unchecked text', () => {
    const engine = buildOriginEngine(PO, null);
    const old = { id: 'TC_01', name: 'Old', businessRule: 'Tolerance check (L412)' };
    const reading = readScenarioOrigin(old, engine, engine.sourceSha256, '');
    expect(reading.origin).toBeNull();
    expect(reading.check.outcome).toBe('not-stated');
    expect(derivedFrom(old)).toEqual({ text: 'Tolerance check (L412)', anchors: ['L412'] });
    // A structured statement is not read as free text.
    expect(derivedFrom({ derivedFrom: { kind: 'rule', lines: [{ start: 412, end: 412 }] } })).toBeNull();
  });

  test('a stored result is re-checked once the source can be read, and counts only for its own source digest', () => {
    const engine = buildOriginEngine(PO, null);
    const forged = {
      id: 'TC_09',
      derivedFrom: { kind: 'rule', ref: 'BR-099', lines: [{ start: 412, end: 412 }] },
      derivedFromCheck: { version: 1, outcome: 'anchored', sourceSha256: engine.sourceSha256, matches: [], problems: [], sentence: 'Checked.' },
    };
    expect(readScenarioOrigin(forged, engine, engine.sourceSha256, '').check.outcome).toBe('mismatch');
    // While the engine is loading, the stored result stands in for the same digest only.
    expect(readScenarioOrigin(forged, null, engine.sourceSha256, 'loading')).toMatchObject({ basis: 'stored' });
    expect(readScenarioOrigin(forged, null, 'another-digest', 'loading')).toMatchObject({ basis: 'none', check: { outcome: 'not-checked', sentence: 'loading' } });
    // Checked against an earlier source: re-checked, and it says so.
    const earlier = { ...forged, derivedFromCheck: { ...forged.derivedFromCheck, sourceSha256: 'earlier' } };
    expect(readScenarioOrigin(earlier, engine, engine.sourceSha256, '').recheckedAfterChange).toBe(true);
  });
});

// ── Rendered (emulators and a production build; no model is called) ───────────

/** What the testing model would store for six scenarios, checked as the generation stores them. */
function storedCases(): Array<Record<string, unknown>> {
  const engine = buildOriginEngine(PO, null);
  const raw: Array<Record<string, unknown>> = [
    { id: 'TC_01', name: 'Price above tolerance is held for the buyer', category: 'Negative', derivedFrom: { kind: 'rule', ref: 'BR-009', lines: [412], quote: 'IF lv_dev_pct > 5.' } },
    { id: 'TC_02', name: 'Tolerance stated at the wrong line', category: 'Negative', derivedFrom: { kind: 'rule', ref: 'BR-009', lines: [500] } },
    { id: 'TC_03', name: 'No origin stated', category: 'Positive' },
    { id: 'TC_04', name: 'Header lines only', category: 'Positive', derivedFrom: { kind: 'rule', lines: [2] } },
    { id: 'TC_05', name: 'Malformed origin', category: 'Positive', derivedFrom: { kind: 'rule', lines: 'beside the IF' } },
  ];
  const cases = raw.map((tc) => withOriginCheck({ description: `${tc.name}.`, priority: 'High', ...tc }, engine, 'no engine'));
  // A stored result that claims more than the source supports: re-checked on display.
  cases.push({
    id: 'TC_06',
    name: 'Forged anchored result',
    category: 'Negative',
    description: 'Names a rule the source does not have.',
    priority: 'Low',
    derivedFrom: { kind: 'rule', ref: 'BR-099', lines: [{ start: 412, end: 412 }] },
    derivedFromCheck: { version: 1, outcome: 'anchored', sourceSha256: engine.sourceSha256, matches: [], problems: [], sentence: 'Checked against the signed source: matches BR-099 at L412.' },
  });
  return cases;
}

async function seedOrigin(prefix: string): Promise<{ account: SeededProject; projectId: string }> {
  const account = await seedStageProject({ prefix, acceptTerms: true });
  const base = await adminGetDoc('projects', account.projectId);
  const projectId = `${account.projectId}-origin`;
  const fingerprint = { sha256: sha256Hex(PO), fileName: PO_FILE, lineCount: 668 };
  await adminSetDoc('projects', projectId, {
    ...base,
    name: 'Z_MM_PO_APPROVAL — origin fixture',
    legacyCode: PO,
    extensibilityRoute: 'In-App Extension (ABAP Cloud)',
    generatedCode: 'CLASS zcl_po_approval DEFINITION PUBLIC FINAL CREATE PUBLIC.\nENDCLASS.\nCLASS zcl_po_approval IMPLEMENTATION.\nENDCLASS.\n',
    testSuite: { code: 'CLASS ltcl_po DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.\nENDCLASS.\n' },
    testCases: storedCases(),
    auditMetadata: { inputFingerprint: fingerprint },
    activeRunId: account.runId,
    createdAt: new Date(),
  });
  const run = await adminGetDoc(`projects/${account.projectId}/runs`, account.runId);
  await adminSetDoc(`projects/${projectId}/runs`, account.runId, { ...run, projectId, legacyCode: PO, inputFingerprint: fingerprint });
  return { account, projectId };
}

async function openTesting(page: Page, projectId: string) {
  await page.goto(`/project/${projectId}/testing`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testing-flow]')).toBeVisible({ timeout: 90000 });
}

async function noSidewaysScroll(page: Page, what: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${what}: sideways scroll`).toBeLessThanOrEqual(0);
}

test.describe('the origin on the Testing stage', () => {
  test.describe.configure({ mode: 'serial' });
  let seeded: Awaited<ReturnType<typeof seedOrigin>>;

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    seeded = await seedOrigin('torigin');
  });

  test('each row carries its origin chip, the summary counts them, and the details show the statement and its check', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, seeded.account);
    await openTesting(page, seeded.projectId);

    const section = page.locator('[data-testing-scenarios]');
    // The forged TC_06 is re-checked: two mismatches, not one.
    await expect(section.locator('[data-origin-summary]')).toContainText('1 of 6 anchored to a business rule · 2 mismatches · 3 not anchored', { timeout: 60000 });
    const rows = section.locator('[data-scenario-row]');
    await expect(rows).toHaveCount(6);
    const chips = ['anchored', 'mismatch', 'not-stated', 'lines-only', 'not-stated', 'mismatch'];
    for (const [i, outcome] of chips.entries()) {
      await expect(rows.nth(i).locator(`[data-scenario-origin="${outcome}"]`), `row ${i + 1}`).toHaveCount(1);
    }
    await expect(rows.nth(0).locator('[data-scenario-origin]')).toContainText('Anchored');
    await expect(rows.nth(1).locator('[data-scenario-origin]')).toContainText('Mismatch');
    await expect(rows.nth(2).locator('[data-scenario-origin]')).toContainText('Not anchored');

    // TC_01: the statement, the check and the anchored rule; the anchor opens the line.
    await rows.nth(0).locator('[data-scenario-toggle]').click();
    const first = rows.nth(0).locator('[data-scenario-derived]');
    await expect(first.locator('[data-origin-statement]')).toContainText('Business rule');
    await expect(first.locator('[data-origin-ref]')).toHaveText('BR-009');
    await expect(first.locator('[data-origin-quote]')).toContainText('IF lv_dev_pct > 5.');
    await expect(first.locator('[data-origin-check="anchored"]')).toContainText('matches BR-009 at L412');
    await expect(first.locator('[data-origin-match="BR-009"]')).toBeVisible();
    await expect(first.locator('[data-provenance="reconstructed"]')).toBeVisible();
    // The scenario itself stays a model proposal.
    await expect(rows.nth(0).locator('[data-scenario-details] [data-provenance="proposed"]').first()).toBeVisible();
    await first.locator('[data-origin-statement] [data-cc-anchor]').first().click();
    const excerpt = first.locator('[data-origin-excerpt="L412"]');
    await expect(excerpt).toBeVisible();
    await expect(excerpt.locator('[data-cc-code-line="highlighted"]')).toContainText('IF lv_dev_pct > 5.');

    // TC_02: flagged, and kept.
    await rows.nth(1).locator('[data-scenario-toggle]').click();
    const second = rows.nth(1).locator('[data-scenario-derived]');
    await expect(second.locator('[data-origin-check="mismatch"]')).toContainText('BR-009 stands at L412');
    await expect(second).toContainText('The scenario is kept');

    // TC_04: the lines exist, no rule there.
    await rows.nth(3).locator('[data-scenario-toggle]').click();
    await expect(rows.nth(3).locator('[data-origin-check="lines-only"]')).toContainText('no business rule of the engine stands there');

    // TC_05: malformed, dropped, not stated.
    await rows.nth(4).locator('[data-scenario-toggle]').click();
    const fifth = rows.nth(4).locator('[data-scenario-derived]');
    await expect(fifth).toContainText('Not stated by the model');
    await expect(fifth.locator('[data-origin-dropped]')).toContainText('was dropped');

    // TC_06: the stored "anchored" did not survive the check.
    await rows.nth(5).locator('[data-scenario-toggle]').click();
    await expect(rows.nth(5).locator('[data-origin-check="mismatch"]')).toContainText('BR-099 is not a business rule');

    await expect(page.locator('main')).not.toContainText(/\bProven\b/);
    await noSidewaysScroll(page, '1440 origin');
  });

  test('on a 390 px phone the chip, the details and the anchors are all tappable, and nothing scrolls sideways', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await signInThroughForm(page, seeded.account);
    await page.setViewportSize({ width: 390, height: 844 });
    await openTesting(page, seeded.projectId);
    await expect(page.locator('[data-origin-summary]')).toContainText('1 of 6 anchored to a business rule', { timeout: 60000 });
    await expect(page.locator('[data-scenario-row]').first().locator('[data-scenario-origin="anchored"]')).toBeVisible();
    await noSidewaysScroll(page, '390 origin');
    await page.locator('[data-scenario-row]').first().locator('[data-scenario-toggle]').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-origin-check="anchored"]')).toBeVisible();
    await sheet.locator('[data-origin-statement] [data-cc-anchor]').first().tap().catch(async () => {
      // A browser context without touch: the same button, clicked.
      await sheet.locator('[data-origin-statement] [data-cc-anchor]').first().click();
    });
    await expect(sheet.locator('[data-origin-excerpt="L412"]')).toBeVisible();
    await noSidewaysScroll(page, '390 origin sheet');
  });
});
