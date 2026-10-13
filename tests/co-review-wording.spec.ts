import { test, expect } from '@playwright/test';
import { buildBusinessPage, masterDataLimit } from '../lib/documentation-business-page';
import { CAPABILITY_FACTS_VERSION, type CapabilityFacts } from '../lib/documentation-capabilities';
import { annotateSapReferences, checkSapReferences, findSapIdentifiers } from '../lib/sap-reference-check';
import { SAP_SCOPE_ITEMS } from '../lib/sap-scope-items';

/**
 * Two wording errors of our own, from the external review of the CO case on
 * v3.0.10 (12.10.2026).
 * Pure: no server, no emulator.
 *
 *   F03 — the business page's limit line said "Master and credit data (CSKS)"
 *         for a cost center report. The line names the business object each
 *         table holds; "credit" only for a table that holds credit data.
 *   F13 — scope item 1EG, given for cost center accounting, read "not
 *         verified". SAP lists 1EG as Bank Integration with File Interface: the
 *         check holds SAP's scope-item titles and says "mismatch".
 */

function facts(reads: string[]): CapabilityFacts {
  return {
    version: CAPABILITY_FACTS_VERSION,
    reads: reads.map((name, i) => ({ name, line: 10 + i })),
    writes: [],
    commits: [],
    updateTask: [],
    calls: [],
    authority: [],
    dynamic: 0,
    dynamicWrites: [],
    dynamicCalls: [],
  } as CapabilityFacts;
}

const counts = { steps: 4, decisions: 2, rules: 1, exceptions: 0 };

test.describe('F03: the limit line names the business object the table holds', () => {
  test('a cost center report reads cost center master data, never credit data', () => {
    const page = buildBusinessPage({ program: 'ZCO_ALLOC', facts: facts(['CSKS', 'ACDOCA']), counts });
    const line = page.limits.map((l) => l.text).find((t) => t.includes('CSKS'));
    expect(line).toBe('Cost center master data (CSKS) is read as it is stored when it runs, not as it was on an earlier date.');
    expect(page.limits.map((l) => l.text).join(' ')).not.toMatch(/credit/i);
  });

  test('credit is said only for a table that holds credit data', () => {
    expect(masterDataLimit(['KNA1', 'KNB1', 'KNKK'])).toBe(
      'Customer master data (KNA1, KNB1) and customer credit data (KNKK) are read as they are stored when it runs, not as they were on an earlier date.',
    );
    expect(masterDataLimit(['LFA1', 'MARA', 'SKA1'])).not.toMatch(/credit/i);
    expect(masterDataLimit(['BKPF', 'ZTABLE'])).toBeNull();
  });

  test('no line of the page uses the generic "master and credit data"', () => {
    const page = buildBusinessPage({ program: 'Z', facts: facts(['CSKS', 'KNA1', 'MARA', 'LFA1', 'T001', 'SKB1']), counts });
    const text = page.limits.map((l) => l.text).join(' ');
    expect(text).not.toMatch(/master and credit data/i);
    expect(text).toContain('Cost center master data (CSKS), customer master data (KNA1)');
    expect(text).toContain('and 2 more');
  });
});

test.describe('F13: a scope item SAP names otherwise reads mismatched, not unverified', () => {
  // The line as the delivered business analysis carried it (docs/business-analysis.md:L15), before our mark.
  const CLAIM = 'Target Standard Process: Overhead Cost Accounting and Universal Allocation (Scope Item 1EG - Cost Center Accounting (verify))';

  test('1EG given for cost center accounting is a mismatch, with SAP\'s title beside it', () => {
    const [check] = findSapIdentifiers(CLAIM).filter((c) => c.id === '1EG');
    expect(check.kind).toBe('scope-item');
    expect(check.modelName).toBe('Cost Center Accounting');
    expect(check.status).toBe('mismatch');
    expect(check.sapName).toBe('Bank Integration with File Interface');
    expect(check.source?.url).toMatch(/^https:\/\/help\.sap\.com\//);
    expect(annotateSapReferences(CLAIM)).toContain('1EG [name does not match SAP\'s (SAP: 1EG is “Bank Integration with File Interface”');
  });

  test('a scope item named by SAP\'s title is verified; an unknown ID stays not verified', () => {
    expect(checkSapReferences('Use scope item 2QL (Universal Allocation).')[0].status).toBe('verified');
    expect(checkSapReferences('Use scope item J54 (Overhead Cost Accounting).')[0].status).toBe('verified');
    const unknown = checkSapReferences('Use scope item 9ZZ (Cost Center Accounting).');
    expect(unknown[0].id).toBe('9ZZ');
    expect(unknown[0].status).toBe('unverified');
  });

  test('the list holds each ID once, with a title and the public SAP Help page that states it', () => {
    const ids = SAP_SCOPE_ITEMS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SAP_SCOPE_ITEMS) {
      expect(s.id).toMatch(/^[0-9A-Z]{3}$/);
      expect(s.title.length).toBeGreaterThan(3);
      expect(s.source.label, s.id).toMatch(/^SAP Help, /);
      // A specific page with a release, never a portal root.
      expect(s.source.url, s.id).toMatch(/^https:\/\/help\.sap\.com\/docs\/.+version=\d/);
    }
  });
});
