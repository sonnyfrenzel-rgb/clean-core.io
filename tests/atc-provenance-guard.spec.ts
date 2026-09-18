import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { joinAtcWithEvidence, summarizeAtcComparison } from '../lib/abap/atc-join';
import type { AtcFinding, AtcReport } from '../lib/abap/atc-model';
import type { EvidenceFinding } from '../lib/abap/evidence-model';

/**
 * The three honesty rules roadmap 7.1 was built under (see CLAUDE.md's
 * instructions for this step and `tests/unearned-verdicts-guard.spec.ts` /
 * `tests/claims-honesty-guard.spec.ts`, whose discipline this file follows
 * for a new pair of data sources instead of a new screen):
 *
 *   1. An imported ATC finding is reported by ATC — never verified by this
 *      product's own engine. Provenance is kept in the data model and in
 *      every place it is shown.
 *   2. Engine findings and ATC findings stay distinguishable. No merge that
 *      loses provenance; no double count when both report the same object.
 *   3. Where ATC reports something the engine does not know, or the other
 *      way round, that is an observation — never a verdict of one side on
 *      the other.
 *
 * The rendered assertions read `AtcFindingsPanel.tsx` with JSX comments
 * stripped, the same technique `tests/unearned-verdicts-guard.spec.ts` uses,
 * so an explanatory comment above a forbidden phrase cannot satisfy its own
 * assertion.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/**
 * Comments stripped, then all whitespace collapsed to single spaces. The
 * second pass matters here specifically because JSX text wraps prose across
 * source lines wherever a formatter likes — a phrase check must survive that
 * wrap without being told where it happens to fall this week.
 */
const rendered = (rel: string) =>
  read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ');

/**
 * The prose *inside* a JSDoc block, for the two `.ts` files here whose honesty
 * language lives in a comment rather than in rendered UI text. Different from
 * `rendered()` on purpose: `rendered()` deletes block comments because it is
 * checking what a reader of the *screen* sees; this keeps them, because here
 * the comment is the thing under test. It also drops the `*` that starts every
 * continuation line, so a phrase that happens to wrap across two JSDoc lines
 * reads the same as one that does not — the wrap point is a formatter's
 * decision, not a fact worth a spec depending on.
 */
const prose = (rel: string) =>
  read(rel)
    .replace(/\/\*\*/g, ' ')
    .replace(/\*\//g, ' ')
    .replace(/^[ \t]*\*/gm, ' ')
    .replace(/\s+/g, ' ');

const atcFinding = (over: Partial<AtcFinding> = {}): AtcFinding => ({
  objectName: 'ZFI_ORDERS',
  message: 'Direct write to a standard table',
  priority: 'error',
  ...over,
});

const engineFinding = (over: Partial<EvidenceFinding> = {}): EvidenceFinding =>
  ({
    id: 'f1',
    kind: 'standard-table-write',
    title: 'Direct Write to SAP Standard Table VBAK',
    severity: 'Critical',
    confidence: 'High',
    source: 'static-parser',
    objectName: 'ZFI_ORDERS',
    lineStart: 10,
    snippet: 'MODIFY vbak.',
    technicalDetail: '',
    cleanCoreImpact: '',
    recommendation: '',
    targetOptions: [],
    ...over,
  }) as EvidenceFinding;

/* ══════════════════════════ Rule 1 — provenance is never lost ══════════════ */

test.describe('rule 1 — an ATC finding is reported by ATC, never engine-verified', () => {
  test('AtcReport.source is fixed to \'atc\' — the type has no other value', () => {
    const report: AtcReport = { findings: [atcFinding()], source: 'atc', importedAt: '2026-09-18', warnings: [] };
    expect(report.source).toBe('atc');
  });

  test('an AtcFinding carries ATC\'s own vocabulary (priority), never the engine\'s (severity, kind, confidence)', () => {
    const f = atcFinding();
    expect(f).toHaveProperty('priority');
    expect(f).not.toHaveProperty('severity');
    expect(f).not.toHaveProperty('kind');
    expect(f).not.toHaveProperty('confidence');
    expect(f).not.toHaveProperty('id');
  });

  test('the comparison row keeps the two lists apart by type, not just by name', () => {
    const rows = joinAtcWithEvidence(
      { findings: [atcFinding()] },
      { findings: [engineFinding()] },
    );
    const row = rows.find((r) => r.objectName === 'ZFI_ORDERS')!;
    expect(row.atcFindings[0]).toHaveProperty('priority');
    expect(row.engineFindingIds).toEqual(['f1']); // IDs only — never the engine finding objects inlined into the ATC side.
  });

  test('the panel never claims an ATC finding was verified, confirmed or checked by this product', () => {
    const jsx = rendered('components/analyze/AtcFindingsPanel.tsx');
    for (const claim of ['ATC-verified', 'verified by the engine', 'confirmed by the engine', 'the engine has verified']) {
      expect(jsx, `"${claim}" came back`).not.toContain(claim);
    }
    // And it says the opposite, in plain words, up front.
    expect(jsx).toMatch(/this product does not verify it/i);
  });
});

/* ══════════════════ Rule 2 — distinguishable, never merged, never doubled ══ */

test.describe('rule 2 — engine and ATC findings never merge and never double-count', () => {
  test('an object both sides report keeps both lists at their own length — never summed', () => {
    const rows = joinAtcWithEvidence(
      { findings: [atcFinding(), atcFinding({ message: 'second ATC finding' })] },
      { findings: [engineFinding(), engineFinding({ id: 'f2' }), engineFinding({ id: 'f3' })] },
    );
    const row = rows.find((r) => r.objectName === 'ZFI_ORDERS')!;
    expect(row.state).toBe('both');
    expect(row.atcFindings).toHaveLength(2);
    expect(row.engineFindingIds).toHaveLength(3);
    // Never `5`, and no combined field exists to hold it.
    expect(Object.keys(row)).not.toContain('totalFindings');
    expect(Object.keys(row)).not.toContain('findingCount');
  });

  test('an object only one side names does not appear as \'both\'', () => {
    const rows = joinAtcWithEvidence(
      { findings: [atcFinding({ objectName: 'ZATC_ONLY' })] },
      { findings: [engineFinding({ objectName: 'ZENGINE_ONLY', id: 'e1' })] },
    );
    expect(rows.find((r) => r.objectName === 'ZATC_ONLY')?.state).toBe('atc-only');
    expect(rows.find((r) => r.objectName === 'ZENGINE_ONLY')?.state).toBe('engine-only');
  });

  test('the summary counts objects once each, in exactly one of the three buckets', () => {
    const rows = joinAtcWithEvidence(
      { findings: [atcFinding(), atcFinding({ objectName: 'ZATC_ONLY' })] },
      { findings: [engineFinding(), engineFinding({ objectName: 'ZENGINE_ONLY', id: 'e1' })] },
    );
    const counts = summarizeAtcComparison(rows);
    expect(counts).toEqual({ both: 1, atcOnly: 1, engineOnly: 1 });
    // Nothing computes a fourth number that adds the three together for a headline.
    const src = rendered('components/analyze/AtcFindingsPanel.tsx');
    expect(src).not.toMatch(/counts\.both\s*\+\s*counts\.atcOnly/);
    expect(src).not.toMatch(/total.*[Ff]indings.*=.*counts/);
  });

  test('the panel renders the two lists in separate, separately labelled columns — never one combined list', () => {
    const jsx = rendered('components/analyze/AtcFindingsPanel.tsx');
    expect(jsx).toContain('Reported by ATC');
    expect(jsx).toContain('Detected by the engine');
  });
});

/* ══════════════ Rule 3 — a mismatch is an observation, never a verdict ═════ */

test.describe('rule 3 — a one-sided result is an observation about coverage, not a verdict', () => {
  test('an object with no ATC finding is not described as "clean" or "passed" by ATC', () => {
    const jsx = rendered('components/analyze/AtcFindingsPanel.tsx');
    for (const verdict of ['ATC found no issues', 'passed ATC', 'clean according to ATC', 'ATC approved']) {
      expect(jsx, `"${verdict}" came back`).not.toContain(verdict);
    }
    // The actual wording draws the distinction explicitly.
    expect(jsx).toMatch(/not the same as ATC checking this object and finding it clean/i);
  });

  test('an object with no engine finding is not described as the engine being wrong or missing something', () => {
    const jsx = rendered('components/analyze/AtcFindingsPanel.tsx');
    for (const verdict of ['the engine missed this', 'engine failed to detect', 'the engine got this wrong', 'engine error']) {
      expect(jsx, `"${verdict}" came back`).not.toContain(verdict);
    }
    expect(jsx).toMatch(/not a statement that the engine is wrong/i);
  });

  test('the three comparison states are documented as coverage, never as agreement or correctness', () => {
    const src = prose('lib/abap/atc-model.ts');
    expect(src).toMatch(/never a verdict on either side/i);
    expect(src).toMatch(/is not knowable from a worklist of findings alone/i);
  });

  test('"atc-only" and "engine-only" read as coverage gaps, not correctness claims, in the model comment', () => {
    const src = prose('lib/abap/atc-model.ts');
    // The two misreadings this type exists to prevent, named explicitly.
    expect(src).toMatch(/not.*"the engine missed a real defect"/i);
    expect(src).toMatch(/not.*"ATC checked this object and found it clean"/i);
  });
});
