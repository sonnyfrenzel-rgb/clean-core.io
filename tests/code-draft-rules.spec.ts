import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { CODE_DRAFT_BUSINESS_RULES, hardCodedLiteralFindings } from '../lib/code-draft-rules';
import { REVIEWED_SERVICE, FIXED_SERVICE, packageOf } from './helpers/fi-worklist-fixture';

/**
 * 3.0.10 (owner 11.10.2026, external review F-01/F-02): the Transformation
 * prompt forbids hard-coded document numbers in business logic, asks for full-
 * key reference lookups, one shared selection and kept posted values — and a
 * deterministic lint flags what the model wrote anyway, as a Transformation
 * warning.
 */

test.describe('the hard-coded-literal lint', () => {
  test('flags find(i => i.belnr === \'1900000001\') — a document number of the code\'s own demo data', () => {
    const findings = hardCodedLiteralFindings(packageOf(REVIEWED_SERVICE));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: 'srv/service.ts',
      literal: '1900000001',
      demoValue: true,
      context: "const referenceItem01 = out.find(i => i.belnr === '1900000001');",
    });
    expect(findings[0].sentence).toContain("compares against the hard-coded value '1900000001', a document number of the code's own demo data");
    // The lint never reads the original, so it claims nothing about it (QA review of 11e3bc7d90e8).
    expect(findings[0].sentence).toContain('Check whether it should be looked up per item.');
    expect(findings[0].sentence).not.toMatch(/the original/i);
  });

  test('the fixed service, which looks the reference up per item, is clean', () => {
    expect(hardCodedLiteralFindings(packageOf(FIXED_SERVICE))).toEqual([]);
  });

  test('the shapes it reads: switch cases, includes, the literal on either side; key-like fields without demo data', () => {
    const src = [
      "export function a(x: { kunnr: string }) { return x.kunnr === '0000100001'; }",
      "export function b(d: string) { switch (d) { case '4900000123': return 1; } return 0; }",
      "export function c(ids: string[]) { return ids.includes('1900000002'); }",
      "export function d(v: { vbeln: string }) { return '0080001234' !== v.vbeln; }",
      "const DEMO = [{ belnr: '4900000123' }, { belnr: '1900000002' }];",
    ].join('\n');
    const lits = hardCodedLiteralFindings([{ path: 'srv/x.ts', content: src }]).map((f) => [f.line, f.literal, f.demoValue]);
    expect(lits).toEqual([
      [1, '0000100001', false],
      [2, '4900000123', true],
      [3, '1900000002', true],
      [4, '0080001234', false],
    ]);
  });

  test('not flagged: data, comments, strings, test files, short codes and unrelated numbers', () => {
    const src = [
      "const ITEMS = [{ belnr: '1900000001', kunnr: '0000100001' }];",
      "// if (i.belnr === '1900000001') — not code",
      "const msg = \"i.belnr === '1900000001'\";",
      "export const company = (q: { companyCode?: string }) => q.companyCode || '1000';",
      "export const isLong = (n: string) => n === '1234567';",
    ].join('\n');
    expect(hardCodedLiteralFindings([{ path: 'srv/x.ts', content: src }])).toEqual([]);
    expect(hardCodedLiteralFindings([{ path: 'test.ts', content: "if (i.belnr === '1900000001') {}" }])).toEqual([]);
  });
});

test.describe('the prompt rules', () => {
  test('four rules: no demo values in logic, full-key lookups, one selection, posted values kept', () => {
    expect(CODE_DRAFT_BUSINESS_RULES).toContain("items.find(i => i.belnr === '1900000001') is forbidden");
    expect(CODE_DRAFT_BUSINESS_RULES).toContain('complete key the original uses (company code, document number, fiscal year, line item — and the customer or vendor it must belong to');
    expect(CODE_DRAFT_BUSINESS_RULES).toContain('ONE shared, validated selection function');
    expect(CODE_DRAFT_BUSINESS_RULES).toContain('no baseline date → due date unknown');
  });

  test('the Node.js code-draft prompt carries them, after its own ten', () => {
    const page = fs.readFileSync(path.resolve(__dirname, '..', 'app/(app)/project/[projectId]/transformation/page.tsx'), 'utf8');
    const at = page.indexOf('10. CRITICAL: Export all main business logic functions');
    expect(at).toBeGreaterThan(-1);
    expect(page.slice(at, at + 400)).toContain('${CODE_DRAFT_BUSINESS_RULES}');
    expect(page).toContain('hardCodedLiteralFindings(files)');
    expect(page).toContain('data-hard-coded-literals');
    // The warning says what was found and what to check — not what the original does (QA review of 11e3bc7d90e8).
    expect(page).toContain('A fixed document or partner number was found in the business logic; check whether it should be looked up per item.');
    expect(page).not.toContain('The original looks such values up per item');
  });
});
