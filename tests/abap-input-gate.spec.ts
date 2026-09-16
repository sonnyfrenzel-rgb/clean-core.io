import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { looksLikeAbap } from '../lib/abap-input-check';
import { quotaExhausted, runsAreSelfFunded, runsRemaining } from '../lib/run-quota-rule';

/**
 * Two rules the analyze stage and the dashboard used to keep private copies of,
 * both wrong in the same direction: they let something through that costs a run
 * of the quota, or they stopped someone who was not spending one at all
 * (QA review of 33471220d6e9 — 2d714ac42b63, 9b1af76b65c9).
 */

test.describe('what counts as ABAP', () => {
  test('every starter example the product ships is recognised', () => {
    const dir = join(process.cwd(), 'public', 'starter-examples');
    const files = readdirSync(dir).filter((f) => f.endsWith('.txt') || f.endsWith('.abap'));
    expect(files.length, 'the starter examples are shipped as files').toBeGreaterThan(0);
    for (const f of files) {
      const source = readFileSync(join(dir, f), 'utf8');
      expect(looksLikeAbap(source), `${f} is ABAP`).toBe(true);
    }
  });

  test('prose, JSON and an empty box are not ABAP', () => {
    // The old check accepted every one of these: it ended in
    // `|| code.trim().length > 0`, which is true for all non-empty text.
    expect(looksLikeAbap('Dear Sir or Madam, please find attached our invoice for August.')).toBe(false);
    expect(looksLikeAbap('{"project":"something","notes":["nothing to see"]}')).toBe(false);
    expect(looksLikeAbap('   \n\t  ')).toBe(false);
    expect(looksLikeAbap('')).toBe(false);
    expect(looksLikeAbap(null)).toBe(false);
    expect(looksLikeAbap(undefined)).toBe(false);
    expect(looksLikeAbap('lorem ipsum dolor sit amet, data consectetur select adipiscing')).toBe(false);
  });

  test('a fragment is enough — a form, a method, a function module, a CDS view', () => {
    expect(looksLikeAbap('FORM calculate_total.\n  ADD 1 TO lv_x.\nENDFORM.')).toBe(true);
    expect(looksLikeAbap('METHOD get_orders.\n  SELECT * FROM vbak INTO TABLE @lt.\nENDMETHOD.')).toBe(true);
    expect(looksLikeAbap('FUNCTION z_check_stock.\nENDFUNCTION.')).toBe(true);
    expect(looksLikeAbap('@AbapCatalog.viewEnhancementCategory: [#NONE]\ndefine view entity ZI_X as select from I_Y {}')).toBe(true);
    expect(looksLikeAbap('REPORT z_test.')).toBe(true);
  });
});

test.describe('who the free quota stops', () => {
  const at = (over: Record<string, unknown> = {}) => ({ tier: 'pilot', transformationsUsed: 5, transformationsLimit: 5, ...over });

  test('an exhausted community account is stopped', () => {
    expect(quotaExhausted(at())).toBe(true);
    expect(quotaExhausted(at({ transformationsUsed: 4 }))).toBe(false);
  });

  test('the two accounts that fund their own runs are never stopped', () => {
    // The screen tells the user to add their own key and the server then stops
    // counting (reserveRunQuota: reason 'byok' / 'enterprise'); the dashboard's
    // own copy of the rule stopped exactly those users at project creation.
    expect(quotaExhausted(at({ byokConfigured: true }))).toBe(false);
    expect(quotaExhausted(at({ tier: 'enterprise' }))).toBe(false);
    expect(runsAreSelfFunded(at({ byokConfigured: true }))).toBe(true);
    expect(runsAreSelfFunded(at({ tier: 'enterprise' }))).toBe(true);
    expect(runsAreSelfFunded(at())).toBe(false);
  });

  test('a missing profile stops nobody, and the remaining count never goes negative', () => {
    expect(quotaExhausted(null)).toBe(false);
    expect(quotaExhausted(undefined)).toBe(false);
    expect(runsRemaining(at({ transformationsUsed: 9 }))).toBe(0);
    expect(runsRemaining(at({ transformationsUsed: 2 }))).toBe(3);
    expect(runsRemaining(at({ transformationsUsed: null, transformationsLimit: null }))).toBe(5);
  });
});

test.describe('the screens use the shared rules, not private copies', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  test('the dashboard asks the rule module', () => {
    const s = read('app/(app)/dashboard/page.tsx');
    expect(s).toContain("from '@/lib/run-quota-rule'");
    // No hand-rolled comparison left to drift from the server's answer.
    expect(s).not.toMatch(/transformationsUsed[^\n]*>=[^\n]*transformationsLimit/);
  });

  test('the analyze stage scans the text it is about to send, and checks it is ABAP', () => {
    const s = read('app/(app)/project/[projectId]/analyze/page.tsx');
    expect(s).toContain("from '@/lib/abap-input-check'");
    const handler = s.slice(s.indexOf('const handleAnalyze'), s.indexOf('const handleAnalyze') + 1200);
    expect(handler, 'the scan runs inside handleAnalyze, on the final string').toContain('scanCodeContent(codeToAnalyze)');
    expect(s).not.toContain("code.trim().length > 0; // Relaxed check");
  });
});
