import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  CURATED_SAP_IDS,
  SAP_REFERENCE_PROMPT_RULES,
  OPTION_COMPARISON_RULE,
  annotateSapReferences,
  catalogNoteForMapping,
  checkSapReferences,
  coverageClaims,
  findSapIdentifiers,
  sapReferenceAppendixMarkdown,
} from '../lib/sap-reference-check';
import { formatAnalysisToMarkdown, formatDesignToMarkdown } from '../lib/markdownFormatter';
import { buildAnalysisPrompt } from '../lib/analysis-prompt';

/**
 * SAP identifiers a model wrote are checked — owner, 11.10.2026, external
 * review F-03 / F-09. The four examples are the review's own.
 */

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const one = (text: string, id: string) => {
  const hit = findSapIdentifiers(text).find((c) => c.id === id);
  expect(hit, `${id} was not found in: ${text}`).toBeTruthy();
  return hit!;
};

test.describe('the review’s four examples', () => {
  test('F2358 named "Process Collections Worklist" is a mismatch — SAP lists it as Monitor Purchase Order Items', () => {
    for (const text of [
      'Use the SAP Fiori app F2358 (Process Collections Worklist) for the daily list.',
      'Use the Process Collections Worklist (F2358) for the daily list.',
      'Use F2358 – Process Collections Worklist for the daily list.',
      'Use the app F2358 "Process Collections Worklist".',
    ]) {
      const c = one(text, 'F2358');
      expect(c.kind, text).toBe('fiori-app');
      expect(c.status, text).toBe('mismatch');
      expect(c.sapName).toBe('Monitor Purchase Order Items');
      expect(c.modelName).toBe('Process Collections Worklist');
      expect(c.source?.label).toBe('SAP KBA 3696098');
    }
  });

  test('F0380 named "Process Collections Worklist" is verified, with its source', () => {
    for (const text of [
      'Use the SAP Fiori app F0380 (Process Collections Worklist).',
      'The Process Collections Worklist (F0380) covers the list.',
      'Use F0380 Process Collections Worklist.',
    ]) {
      const c = one(text, 'F0380');
      expect(c.status, text).toBe('verified');
      expect(c.source?.label).toBe('SAP KBA 3409472');
      expect(c.source?.url).toContain('3409472');
    }
  });

  test('SAP_COM_0093 for credit management is a mismatch — SAP lists it as Identity Management Integration', () => {
    for (const text of [
      'Connect through SAP_COM_0093 for Credit Management.',
      'Use the Credit Management Integration (SAP_COM_0093).',
      'Communication scenario SAP_COM_0093 (Credit Management) exposes the limits.',
    ]) {
      const c = one(text, 'SAP_COM_0093');
      expect(c.kind, text).toBe('communication-scenario');
      expect(c.status, text).toBe('mismatch');
      expect(c.sapName).toBe('Identity Management Integration');
    }
  });

  test('an ID we hold no SAP data for is not verified', () => {
    const c = one('Use the app F9999 (Some Worklist) and SAP_COM_0777.', 'F9999');
    expect(c.status).toBe('unverified');
    expect(c.source).toBeNull();
    expect(one('Use SAP_COM_0777 to connect.', 'SAP_COM_0777').status).toBe('unverified');
  });
});

test.describe('the other identifiers', () => {
  test('scope items read from their context: BDC unknown, 19M known as Direct Debit but not verified for this use', () => {
    const text = 'The standard covers this with the scope items BDC / 19M for collections.';
    const checks = findSapIdentifiers(text);
    expect(checks.map((c) => c.id)).toEqual(['BDC', '19M']);
    expect(checks.every((c) => c.kind === 'scope-item')).toBe(true);
    expect(checks[0].status).toBe('unverified');
    expect(checks[1].status).toBe('unverified');
    expect(checks[1].sapName).toBe('Direct Debit');
    expect(annotateSapReferences(text)).toContain('19M [not verified — SAP lists 19M as “Direct Debit”');
    // A known scope item with SAP's name beside it is verified.
    expect(one('Scope item BFC (Collections and Dispute Management) fits.', 'BFC').status).toBe('verified');
    // No SAP or API word is ever taken for a scope item.
    expect(findSapIdentifiers('Scope items SAP and API are not codes.').map((c) => c.id)).toEqual([]);
  });

  test('APIs: the catalog holds API_BUSINESS_PARTNER; API_JOURNALENTRYITEMBASIC_SRV carries SAP’s restriction', () => {
    const bp = one('Read customers through API_BUSINESS_PARTNER.', 'API_BUSINESS_PARTNER');
    expect(bp.kind).toBe('api');
    expect(bp.status).toBe('verified');
    const je = one('API_JOURNALENTRYITEMBASIC_SRV replaces BSID, BSAD and BSEG.', 'API_JOURNALENTRYITEMBASIC_SRV');
    expect(je.status).toBe('verified');
    expect(je.caveat).toMatch(/entry view and ledger view/);
    expect(annotateSapReferences('API_JOURNALENTRYITEMBASIC_SRV replaces BSID.')).toContain('SAP restriction:');
    expect(one('Use API_MADE_UP_SRV.', 'API_MADE_UP_SRV').status).toBe('unverified');
    expect(one('Use the released view I_OperationalAcctgDocItem.', 'I_OperationalAcctgDocItem').status).toBe('verified');
    expect(one('Use the entity A_BusinessPartner.', 'A_BusinessPartner').kind).toBe('api');
  });

  test('a BAdI and a transaction code are found and never verified without a source', () => {
    expect(one('Implement BADI_SD_SALES for the check.', 'BADI_SD_SALES')).toMatchObject({ kind: 'badi', status: 'unverified' });
    expect(one('Users run transaction FBL5N today.', 'FBL5N')).toMatchObject({ kind: 'transaction', status: 'unverified' });
    expect(findSapIdentifiers('the transaction data is read').length).toBe(0);
  });

  test('the worst state of an ID wins across texts', () => {
    const checks = checkSapReferences('Use F2358 (Monitor Purchase Order Items).', 'Use F2358 (Process Collections Worklist).');
    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe('mismatch');
  });

  test('every curated entry names its SAP source with an address', () => {
    for (const e of CURATED_SAP_IDS) {
      expect(e.source.label, e.id).toMatch(/^SAP /);
      expect(e.source.url, e.id).toMatch(/^https:\/\/(userapps\.support\.sap\.com|help\.sap\.com)\//);
    }
  });
});

test.describe('the marks travel into the text a reader gets', () => {
  test('annotate puts the mark after the first occurrence only, and the mismatch never reads as fact', () => {
    const text = 'Use F2358 (Process Collections Worklist). Later, F2358 again.';
    const out = annotateSapReferences(text);
    expect(out).toContain("F2358 [name does not match SAP's (SAP: F2358 is “Monitor Purchase Order Items”, SAP KBA 3696098)]");
    expect(out.match(/\[name does not match/g)).toHaveLength(1);
    expect(annotateSapReferences('No identifiers here.')).toBe('No identifiers here.');
  });

  test('business-analysis.md marks the identifiers and lists them with their sources', () => {
    const analysis = {
      projectTitle: 'Collections',
      cleanCoreScore: 75,
      summary: 'A collections worklist.',
      asIsContext: 'Reads BSID.',
      standardFit: { potential: 'High', targetStandardProcess: 'F2358 (Process Collections Worklist)', rationale: 'Full standard coverage via scope items BDC / 19M.' },
      recommendations: { keepCoreClean: 'Use SAP_COM_0093 for Credit Management.', decommissioning: 'Retire after validation.', cloudReadiness: 'RAP.' },
      gaps: [],
      strategicNextSteps: ['Check F0380 (Process Collections Worklist).'],
    };
    const md = formatAnalysisToMarkdown(JSON.stringify(analysis));
    expect(md).toContain("F2358 [name does not match SAP's");
    expect(md).toContain("SAP_COM_0093 [name does not match SAP's (SAP: SAP_COM_0093 is “Identity Management Integration”");
    expect(md).toContain('BDC [not verified — check before use]');
    expect(md).toContain('F0380 [verified: SAP lists F0380 as “Process Collections Worklist”');
    expect(md).toContain('## SAP identifiers named in this document');
    expect(md).toContain('https://userapps.support.sap.com/sap/support/knowledge/en/3696098');
    // "High" and "full standard coverage" are not printed as a finding.
    expect(md).toMatch(/model's estimate/i);
    expect(md).toContain('not backed by an evidence list');
  });

  test('solution-design.md marks the API mapping, the integrations and the approach', () => {
    const design = {
      projectName: 'X',
      architectureOverview: { approachDescription: 'CAP because SAP_COM_0093 for Credit Management.', nodeFramework: 'CAP', runtimePlatform: 'BTP' },
      nodeAppBlueprint: { projectStructure: [], apiEndpoints: [] },
      cloudServices: [{ serviceName: 'Destination service', purpose: 'Calls API_BUSINESS_PARTNER.', npmPackages: [] }],
      dataSync: { patternName: 'Pull', description: 'Reads API_JOURNALENTRYITEMBASIC_SRV.' },
      sapStandardApiMapping: [
        { legacyTableOrFunction: 'BSID', sapStandardApiName: 'API_JOURNALENTRYITEMBASIC_SRV', apiHubUrl: 'https://api.sap.com/api/API_JOURNALENTRYITEMBASIC_SRV/overview', apiId: 'SAP_COM_0002', description: 'Replaces BSID.' },
      ],
      securityHardening: [],
      roadmap: [],
    };
    const md = formatDesignToMarkdown(JSON.stringify(design));
    expect(md).toContain("SAP_COM_0093 [name does not match SAP's");
    expect(md).toContain('API_BUSINESS_PARTNER [verified');
    expect(md).toContain('SAP_COM_0002 [not verified — check before use]');
    expect(md).toContain('SAP restriction:');
    expect(md).toContain('names I_OperationalAcctgDocItem (CDS View) as the successor of BSID');
    expect(md).toContain('## SAP identifiers named in this document');
    expect(md).toMatch(/Model proposal/);
  });

  test('the catalog note says what our catalog names instead, and nothing when it agrees', () => {
    expect(catalogNoteForMapping('BSID', 'API_JOURNALENTRYITEMBASIC_SRV')).toMatch(/I_OperationalAcctgDocItem/);
    expect(catalogNoteForMapping('KNA1', 'API_BUSINESS_PARTNER')).toBeNull();
    expect(catalogNoteForMapping('ZTABLE', 'API_X')).toBeNull();
  });

  test('the appendix is empty when there is nothing to check', () => {
    expect(sapReferenceAppendixMarkdown('plain words')).toBe('');
  });
});

test.describe('coverage claims', () => {
  test('full coverage and a High fit are found', () => {
    expect(coverageClaims('This gives full standard coverage.')).not.toEqual([]);
    expect(coverageClaims('No rewrite needed — standard replacement covers all functionality.').length).toBeGreaterThan(0);
    expect(coverageClaims('A High Fit for the standard.')).not.toEqual([]);
    expect(coverageClaims('Two of five capabilities are covered; three are unconfirmed.')).toEqual([]);
  });
});

test.describe('the prompts carry the rules (source guards)', () => {
  test('the analysis prompt carries the identifier rules and the option comparison, and no longer asks for "covers all functionality"', () => {
    const prompt = buildAnalysisPrompt({
      targetDeployment: 'private',
      evidenceReport: { findings: [] } as never,
      routeReport: { cleanCoreScore: 50, recommendedRoute: 'rap', confidenceScore: 50, rationale: 'r', targetArtifact: 't', checkpoints: [], comparativeAnalysis: [] } as never,
      code: 'REPORT z.',
    });
    expect(prompt).toContain(SAP_REFERENCE_PROMPT_RULES);
    expect(prompt).toContain(OPTION_COMPARISON_RULE);
    expect(prompt).not.toContain('covers all functionality."');
  });

  test('both design prompts carry the rules; the API ID is no longer exemplified with a communication scenario', () => {
    const src = read('app/(app)/project/[projectId]/design/page.tsx');
    expect(src.match(/\$\{SAP_REFERENCE_PROMPT_RULES\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src.match(/\$\{OPTION_COMPARISON_RULE\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/e\.g\. SAP_COM_0008, SAP_COM_0109/);
  });

  test('every place that renders model-written SAP identifiers shows their check', () => {
    const sites: Array<[string, RegExp]> = [
      ['components/analyze/TargetScopeMapping.tsx', /<SapCheckedText/],
      ['components/design/ApiBusinessHubMapping.tsx', /<SapCheckedText/],
      ['components/design/CloudServiceIntegrations.tsx', /<SapCheckedText/],
      ['components/design/DesignDocument.tsx', /<SapCheckedText/],
      ['app/(app)/project/[projectId]/analyze/page.tsx', /<SapIdentifierChecks/],
      ['lib/markdownFormatter.ts', /annotateSapReferences as checked[\s\S]*\bchecked\(data\.standardFit/],
      ['lib/design-export.ts', /annotateSapReferences as checked[\s\S]*esc\(checked\(map\.sapStandardApiName\)\)/],
      ['lib/analysis-export.ts', /annotateSapReferences as checked[\s\S]*esc\(checked\(data\.recommendations\?\.keepCoreClean\)\)/],
    ];
    for (const [rel, re] of sites) expect(read(rel), rel).toMatch(re);
    // The table no longer says "Officially released … fully decouple".
    expect(read('components/design/ApiBusinessHubMapping.tsx')).not.toMatch(/Officially/);
  });
});
