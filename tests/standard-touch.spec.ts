import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { findingsOf } from '../lib/it-findings-build';
import { standardTouch, gateOf, STANDARD_TOUCH_LIMITS, anchorText } from '../lib/standard-touch';
import type { ItFindingRow, ItUseRow } from '../lib/it-findings';

/**
 * Stage 1 of the fit-to-standard approach — "Where this program touches SAP
 * standard" (owner decision 22.10.2026). Server-free: the same findings the
 * IT view reads, over the shipped starter examples.
 *
 * The expected gate outcome of each example was written down before the gate
 * ran (`tests/fixtures/standard-touch-expected.json`, its own commit). A
 * disagreement is reported as a finding, never tuned away.
 */
const ROOT = path.resolve(__dirname, '..');
const EXPECTED = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/standard-touch-expected.json'), 'utf8')) as {
  cases: Record<string, { outcome: string; includes?: string[]; reason?: string }>;
};

const row = (over: Partial<ItFindingRow>): ItFindingRow =>
  ({ id: 'CC-1', kind: 'standard-table-read', title: 't', severity: 'Low', objectName: 'VBAK', objectType: null, lineStart: 10, lineEnd: null, routine: null, level: 'C', ...over }) as ItFindingRow;
const use = (over: Partial<ItUseRow>): ItUseRow =>
  ({ object: 'VBAK', kind: 'table', use: 'read', lines: [10], remote: false, custom: false, level: 'C', levelBasis: 'catalog', releaseView: null, classificationView: null, findingIds: [], ...over }) as ItUseRow;

test.describe('the starter examples, against what was expected before measuring', () => {
  for (const [file, expected] of Object.entries(EXPECTED.cases)) {
    test(file, () => {
      const source = fs.readFileSync(path.join(ROOT, 'public/starter-examples', file), 'utf8');
      const touch = standardTouch(findingsOf(source, file, 'public'));
      expect(touch.gate.outcome, `${file}: ${touch.sentence}`).toBe(expected.outcome);
      if (touch.gate.outcome === 'offered') {
        for (const cls of expected.includes ?? []) expect(touch.gate.classes, file).toContain(cls);
        // Every signal names its lines.
        for (const s of touch.gate.signals) expect(s.anchors.length, `${file} ${s.cls}`).toBeGreaterThan(0);
      }
      if (touch.gate.outcome === 'not-offered' && expected.reason) expect(touch.gate.exclusion).toBe(expected.reason);
      // Every departure carries its lines.
      for (const d of touch.departures) expect(d.anchors.length, `${file} ${d.kind}`).toBeGreaterThan(0);
      // The sentence examines; it never claims coverage.
      expect(touch.sentence).not.toMatch(/\bcover(s|ed)?\b|\bsupported\b|\bfits\b|\bfit (to|with) (the )?SAP standard\b/i);
    });
  }

  test('areas are application components only, from the SAP objects the code uses', () => {
    const source = fs.readFileSync(path.join(ROOT, 'public/starter-examples/ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap'), 'utf8');
    const touch = standardTouch(findingsOf(source, 'z.abap', 'public'));
    expect(touch.areasNotRecorded).toBe(false);
    expect(touch.areas.length).toBeGreaterThan(0);
    expect(touch.areas.some((a) => a.component.startsWith('SD'))).toBe(true);
    for (const a of touch.areas) expect(a.component).not.toMatch(/^(BC|CA)\b/);
  });
});

test.describe('the gate, rule by rule', () => {
  test('no SAP object is not offered', () => {
    expect(gateOf([row({ kind: 'custom-table-write', objectName: 'ZLOG' })], [use({ object: 'ZLOG', custom: true, use: 'write' })]).outcome).toBe('not-offered');
  });
  test('an enhancement is class A, and A survives an outbound call', () => {
    const g = gateOf([row({ kind: 'enhancement', lineStart: 5, lineEnd: 9 })], [use({ object: 'Z_REMOTE', kind: 'function-module', use: 'call', custom: true, remote: true })]);
    expect(g.outcome).toBe('offered');
    if (g.outcome === 'offered') expect(g.classes).toEqual(['A']);
  });
  test('a hard-coded value alone is never offered', () => {
    expect(gateOf([row({ kind: 'hardcoded-value' })], [use({})]).outcome).toBe('not-determined');
  });
  test('a read of an SAP table without a released path is not class B', () => {
    expect(gateOf([row({ level: 'D' })], [use({ level: 'D' })]).outcome).toBe('not-determined');
    const b = gateOf([row({ level: 'C' })], [use({})]);
    expect(b.outcome === 'offered' && b.classes).toEqual(['B']);
  });
  test('writes to its own tables only is own persistence', () => {
    const g = gateOf([row({ kind: 'custom-table-write', objectName: 'ZT' }), row({})], [use({}), use({ object: 'ZT', custom: true, use: 'write' })]);
    expect(g.outcome === 'not-offered' && g.exclusion).toBe('own-persistence');
  });
  test('an outbound call with nothing that bends the standard is integration', () => {
    const g = gateOf([row({})], [use({}), use({ object: 'Z_Q', kind: 'function-module', use: 'call', custom: true, remote: true, lines: [40] })]);
    expect(g.outcome === 'not-offered' && g.exclusion).toBe('integration');
    expect(g.outcome === 'not-offered' && g.anchors.map(anchorText)).toContain('L40');
  });
  test('without findings nothing is said', () => {
    expect(standardTouch(null).gate.outcome).toBe('not-determined');
  });
});

test('the limits sentence is the research report\'s, word for word', () => {
  expect(STANDARD_TOUCH_LIMITS).toBe(
    "Clean-Core.io reads your code and SAP's openly licensed data only. It shows where this program touches and departs from SAP standard — not whether SAP standard does what it does. That is decided in your fit-to-standard workshop; entries here are your own statements or AI-generated suggestions, never a confirmation by SAP.",
  );
});
