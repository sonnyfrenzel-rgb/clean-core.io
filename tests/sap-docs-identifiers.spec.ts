import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  licenseFromText,
  parseTables,
  reuseLicense,
  scenarioIdsInContext,
  scenariosFromProse,
  scenariosFromTables,
} from '../lib/sap-docs-parse';
import {
  EMPTY_SAP_IDENTIFIER_FILE,
  SAP_DOCS_SOURCES,
  SAP_IDENTIFIER_SOURCES,
  buildIdentifierFile,
  comparable,
  entriesFromDocument,
  type DocumentResult,
  type SapDocumentSpec,
} from '../lib/sap-identifier-sync';
import { CURATED_SAP_IDENTIFIERS, setSyncedSapIdentifiers } from '../lib/sap-identifiers';
import {
  CURATED_SAP_IDS,
  SAP_DOCS_LICENCE_SHORT,
  annotateSapReferences,
  findSapIdentifiers,
  namesAgree,
  sapAttributionHtml,
  sapIdMark,
  sapIdStateWord,
  sapIdentifierSourcesNote,
  sapReferenceAnnotator,
  sapReferenceAppendixMarkdown,
  sapReferenceAttributions,
} from '../lib/sap-reference-check';
import { formatAnalysisToMarkdown, formatDesignToMarkdown } from '../lib/markdownFormatter';
import { buildDesignExportHtml } from '../lib/design-export';
import { buildAnalysisExportHtml } from '../lib/analysis-export';
import type { Project } from '../lib/types';

/**
 * SAP's documentation sources on GitHub (github.com/SAP-docs, CC BY 4.0) in the
 * identifier check (owner, 13.10.2026). Pure: hand-written Markdown fixtures in
 * the shapes those repositories use, no network.
 */

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const one = (text: string, id: string) => {
  const hit = findSapIdentifiers(text).find((c) => c.id === id);
  expect(hit, `${id} was not found in: ${text}`).toBeTruthy();
  return hit!;
};

/* ------------------------------------------------ fixtures */

/** Two tables — a pipe table and an HTML table with merged cells — and a deprecated service plan. */
const TABLES_MD = [
  '# Supported Scenarios',
  '',
  '| Communication Scenario | API | Protocol |',
  '| --- | --- | --- |',
  '| Sales Order Integration \\(SAP\\_COM\\_0109\\) | [API\\_SALES\\_ORDER\\_SRV](https://api.sap.com/api/API_SALES_ORDER_SRV/overview) | OData V2 |',
  '| Old Fixture Integration \\(SAP\\_COM\\_0777\\) - deprecated | — | SOAP |',
  '| Billing Document Integration \\(SAP\\_COM\\_0120\\) | API\\_BILLING\\_DOCUMENT\\_SRV | OData V2 |',
  '',
  '<table>',
  '<tr><th>Area</th><th>Communication Scenario</th></tr>',
  '<tr><td rowspan="2">Finance</td><td>Finance - Posting Integration \\(SAP\\_COM\\_0002\\)</td></tr>',
  '<tr><td>Fixture Planning Integration \\(SAP\\_COM\\_0A01\\)</td></tr>',
  '<tr><td colspan="2">A merged row that names no scenario</td></tr>',
  '<tr><td>Identity</td><td>Identity Fixture Directory Integration \\(SAP\\_COM\\_0093\\)</td></tr>',
  '</table>',
  '',
  '| Service Plan | Description |',
  '| --- | --- |',
  '| sap\\_com\\_0109 | Deprecated. Use the api-access plan. |',
  '',
  '> -   *Product Integration \\(SAP\\_COM\\_0009\\)*: replicates product master data. See [https://api.sap.com/api/PRODUCTMDMBULKREPLICATEREQUEST/overview](https://api.sap.com/api/PRODUCTMDMBULKREPLICATEREQUEST/overview).',
].join('\n');

/** IDs named under a sentence that places them in a product, as bullets. */
const LIST_MD = [
  '-   In the SAP S/4HANA Cloud system, communication arrangements have been created for the following communication scenarios:',
  '',
  '    -   `SAP_COM_0532` ',
  '',
  '        For more information, see [CDS views](x.md) in the *SAP S/4HANA Cloud* documentation. SAP_COM_0999 is not read here.',
  '',
  '    -   `SAP_COM_0531`',
  '',
  '    -   `SAP\\_COM\\_0545`',
  '',
  '-   A connection to an agent that SAP_COM_0888 does not belong to.',
].join('\n');

const spec = (key: string): SapDocumentSpec => SAP_DOCS_SOURCES.find((s) => s.key === key)!;
const TABLE_SPEC = spec('sapdocs-s4hc-service-plans');
const LIST_SPEC = spec('sapdocs-datasphere-s4hc-connectivity');
const REV = 'a'.repeat(40);

const result = (key: string, markdown: string | null, license: string | null = 'CC-BY-4.0', sourceRevision: string | null = REV): DocumentResult => ({
  key,
  markdown,
  license,
  sourceRevision,
  observedAt: '2026-10-13T06:45:00.000Z',
});

/** Curated titles the way the script gathers them. */
function curatedTitles(): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of CURATED_SAP_IDENTIFIERS) if (e.title) m.set(e.id.toUpperCase(), e.title);
  for (const e of CURATED_SAP_IDS) if (e.name) m.set(e.id.toUpperCase(), e.name);
  return m;
}

function docsFile(tables = TABLES_MD, list = LIST_MD) {
  const runs = [
    { spec: TABLE_SPEC, result: result(TABLE_SPEC.key, tables) },
    { spec: LIST_SPEC, result: result(LIST_SPEC.key, list) },
  ].map((r) => ({ ...r, entries: entriesFromDocument(r.spec, r.result) }));
  return buildIdentifierFile(EMPTY_SAP_IDENTIFIER_FILE, [], '2026-10-13T06:45:00.000Z', {
    documents: runs,
    curatedTitles: curatedTitles(),
    agree: namesAgree,
  }).file;
}

/* ------------------------------------------------ the parser */

test.describe('reading SAP-docs Markdown', () => {
  test('several tables, pipe and HTML, each read by its header; merged cells laid out', () => {
    const tables = parseTables(TABLES_MD);
    expect(tables.map((t) => t.headers)).toEqual([
      ['Communication Scenario', 'API', 'Protocol'],
      ['Service Plan', 'Description'],
      ['Area', 'Communication Scenario'],
    ]);
    const html = tables[2];
    // The rowspan carries "Finance" into the next row; the colspan fills both columns.
    expect(html.rows[1]).toEqual({ Area: 'Finance', 'Communication Scenario': 'Fixture Planning Integration \\(SAP\\_COM\\_0A01\\)' });
    expect(html.rows[2]['Communication Scenario']).toBe('A merged row that names no scenario');

    const found = scenariosFromTables(TABLES_MD);
    expect(found.map((s) => s.id)).toEqual(['SAP_COM_0109', 'SAP_COM_0777', 'SAP_COM_0120', 'SAP_COM_0002', 'SAP_COM_0A01', 'SAP_COM_0093']);
    const so = found.find((s) => s.id === 'SAP_COM_0109')!;
    expect(so).toEqual({ id: 'SAP_COM_0109', title: 'Sales Order Integration', apiRefs: ['API_SALES_ORDER_SRV'], protocol: 'V2', deprecated: null });
    expect(found.find((s) => s.id === 'SAP_COM_0777')).toMatchObject({ title: 'Old Fixture Integration', deprecated: true, protocol: 'SOAP' });
  });

  test('a deprecated service plan (lower case) is a plan, not a deprecated scenario', () => {
    const all = [...scenariosFromTables(TABLES_MD), ...scenariosFromProse(TABLES_MD)];
    expect(all.filter((s) => s.id === 'SAP_COM_0109')).toHaveLength(1);
    expect(all.find((s) => s.id === 'SAP_COM_0109')!.deprecated).toBeNull();
    expect(all.some((s) => /sap_com/.test(s.id))).toBe(false);
  });

  test('prose with the title in emphasis, and the API named beside it', () => {
    expect(scenariosFromProse(TABLES_MD)).toEqual([
      { id: 'SAP_COM_0009', title: 'Product Integration', apiRefs: ['PRODUCTMDMBULKREPLICATEREQUEST'], protocol: null, deprecated: null },
    ]);
  });

  test('IDs under a sentence that names the product: the bullets right under it, nothing deeper, nothing after', () => {
    expect(scenarioIdsInContext(LIST_MD, /SAP S\/4HANA Cloud/).map((s) => s.id)).toEqual(['SAP_COM_0532', 'SAP_COM_0531', 'SAP_COM_0545']);
    expect(scenarioIdsInContext(LIST_MD, /SAP Marketing Cloud/)).toEqual([]);
    for (const s of scenarioIdsInContext(LIST_MD, /SAP S\/4HANA Cloud/)) expect(s.title).toBeNull();
  });

  test('the licence: REUSE.toml for every path, else the LICENSE text; nothing else counts', () => {
    expect(reuseLicense('version = 1\n\n[[annotations]]\npath = "**"\nprecedence = "aggregate"\nSPDX-FileCopyrightText = "2022 SAP SE"\nSPDX-License-Identifier = "CC-BY-4.0"\n')).toBe('CC-BY-4.0');
    expect(reuseLicense('[[annotations]]\npath = "docs/**"\nSPDX-License-Identifier = "CC-BY-4.0"\n')).toBeNull();
    expect(licenseFromText('Attribution 4.0 International\n… https://creativecommons.org/licenses/by/4.0/legalcode')).toBe('CC-BY-4.0');
    expect(licenseFromText('Attribution-NonCommercial 4.0 International — Creative Commons')).toBeNull();
    expect(licenseFromText('All rights reserved.')).toBeNull();
  });
});

/* ------------------------------------------------ entries and the file */

test.describe('entries: one per ID, each with its licence, source, commit and product', () => {
  test('every entry carries its licence and its source at the commit it was read', () => {
    const entries = entriesFromDocument(TABLE_SPEC, result(TABLE_SPEC.key, TABLES_MD))!;
    expect(entries.length).toBe(7);
    for (const e of entries) {
      expect(e.license).toBe('CC-BY-4.0');
      expect(e.sourceRevision).toBe(REV);
      expect(e.source.url).toBe(`https://github.com/SAP-docs/${TABLE_SPEC.repo}/blob/${REV}/${TABLE_SPEC.path}`);
      expect(e.product).toBe('SAP S/4HANA Cloud');
      expect(e.kind).toBe('communication-scenario');
    }
  });

  test('no open licence, no commit, or no text: no entries', () => {
    expect(entriesFromDocument(TABLE_SPEC, result(TABLE_SPEC.key, TABLES_MD, 'LicenseRef-SAP'))).toBeNull();
    expect(entriesFromDocument(TABLE_SPEC, result(TABLE_SPEC.key, TABLES_MD, null))).toBeNull();
    expect(entriesFromDocument(TABLE_SPEC, result(TABLE_SPEC.key, TABLES_MD, 'CC-BY-4.0', null))).toBeNull();
    expect(entriesFromDocument(TABLE_SPEC, result(TABLE_SPEC.key, null))).toBeNull();
  });

  test('a document read short keeps its previous entries; the notice carries the CC BY 4.0 attribution', () => {
    const before = docsFile();
    const short = buildIdentifierFile(before, [], '2026-10-20T06:45:00.000Z', {
      documents: [{ spec: TABLE_SPEC, result: result(TABLE_SPEC.key, '| Communication Scenario |\n| --- |\n| X \\(SAP\\_COM\\_0109\\) |'), entries: null }],
    }).file;
    expect(short.entries.filter((e) => e.source.key === TABLE_SPEC.key)).toEqual(before.entries.filter((e) => e.source.key === TABLE_SPEC.key));
    expect(short.documents.find((d) => d.key === TABLE_SPEC.key)!.status).toBe('kept-previous');
    expect(before.notice.some((n) => n.includes('CC BY 4.0') && n.includes(TABLE_SPEC.path))).toBe(true);
  });

  test('a title that differs from a curated one is listed as a conflict, never written over it', () => {
    const file = docsFile();
    expect(file.conflicts.map((c) => c.id).sort()).toEqual(['SAP_COM_0093', 'SAP_COM_0120']);
    expect(file.conflicts.find((c) => c.id === 'SAP_COM_0120')).toMatchObject({ curatedTitle: 'Billing Integration', syncedTitle: 'Billing Document Integration' });
  });

  test('a new commit of the same facts is not a change; a new title is', () => {
    const a = docsFile();
    const moved = buildIdentifierFile(EMPTY_SAP_IDENTIFIER_FILE, [], '2026-10-20T06:45:00.000Z', {
      documents: [TABLE_SPEC, LIST_SPEC].map((s) => {
        const r = result(s.key, s === TABLE_SPEC ? TABLES_MD : LIST_MD, 'CC-BY-4.0', 'b'.repeat(40));
        return { spec: s, result: r, entries: entriesFromDocument(s, r) };
      }),
      curatedTitles: curatedTitles(),
      agree: namesAgree,
    }).file;
    expect(comparable(moved)).toBe(comparable(a));
    expect(comparable(docsFile(TABLES_MD.replace('Product Integration', 'Product Master Integration')))).not.toBe(comparable(a));
  });

  test('SAP-docs is a synced source of its own, read through api.github.com only', () => {
    expect(SAP_IDENTIFIER_SOURCES.find((s) => s.key === 'sap-docs')).toMatchObject({ synced: true, url: 'https://github.com/SAP-docs' });
    for (const s of SAP_DOCS_SOURCES) expect(s.path).toMatch(/^docs\/.+\.md$/);
    const script = read('scripts/sync-sap-identifiers.ts');
    expect(script).toContain("const GITHUB_API = 'https://api.github.com/repos/SAP-docs';");
    expect(script).not.toMatch(/help\.sap\.com|api\.sap\.com|fioriappslibrary|community\.sap\.com|userapps\.support/);
    // The licence is checked before a document is read.
    expect(script).toMatch(/REUSE\.toml\?ref=[\s\S]*LICENSE\?ref=[\s\S]*if \(sha && spdx\)/);
  });
});

/* ------------------------------------------------ precedence and marks */

test.describe('precedence: SAP page > SAP-docs > curated list > product catalog', () => {
  test.afterEach(() => setSyncedSapIdentifiers(EMPTY_SAP_IDENTIFIER_FILE));

  test('a scenario SAP-docs confirms no longer reads "curated list": its title, product and licence stand', () => {
    setSyncedSapIdentifiers(EMPTY_SAP_IDENTIFIER_FILE);
    const before = one('Replicate through SAP_COM_0009 (Product Integration).', 'SAP_COM_0009');
    expect(before.curatedList).toBe(true);
    expect(sapIdStateWord(before)).toBe('name found in curated list');

    setSyncedSapIdentifiers(docsFile());
    const c = one('Replicate through SAP_COM_0009 (Product Integration).', 'SAP_COM_0009');
    expect(c.status).toBe('verified');
    expect(c.curatedList).toBeUndefined();
    expect(c.sapDocs).toBe(true);
    expect(c.product).toBe('SAP S/4HANA Cloud');
    const mark = sapIdMark(c);
    expect(mark).toContain('(documented for SAP S/4HANA Cloud)');
    expect(mark).toContain('SAP documentation on GitHub (SAP-docs/btp-cloud-platform)');
    expect(mark).toContain(SAP_DOCS_LICENCE_SHORT);
  });

  test('a SAP page held by hand wins over SAP-docs, and no synced field is spread under it', () => {
    setSyncedSapIdentifiers(docsFile());
    const c = one('Sales orders go through SAP_COM_0109 (Sales Order Integration).', 'SAP_COM_0109');
    expect(c.status).toBe('verified');
    expect(c.sapDocs).toBeUndefined();
    expect(c.product).toBeUndefined();
    expect(c.attribution).toBeUndefined();
    expect(c.source!.url).toMatch(/^https:\/\/help\.sap\.com\//);

    const r = one('Users come through SAP_COM_0093 (Identity Management Integration).', 'SAP_COM_0093');
    expect(r.status).toBe('verified');
    expect(r.source!.label).toContain('SAP Help, Identity and Access Management');
    expect(r.product).toBeUndefined();
    expect(r.attribution).toBeUndefined();
  });

  test('a differing SAP-docs title is a flagged caveat beside the page title, with its attribution', () => {
    setSyncedSapIdentifiers(docsFile());
    for (const [text, id, other] of [
      ['Invoices via SAP_COM_0120 (Billing Integration).', 'SAP_COM_0120', 'Billing Document Integration'],
      ['Users via SAP_COM_0093 (Identity Management Integration).', 'SAP_COM_0093', 'Identity Fixture Directory Integration'],
    ] as const) {
      const c = one(text, id);
      expect(c.status, id).toBe('verified');
      expect(c.otherTitle?.title, id).toBe(other);
      expect(sapIdMark(c), id).toContain(`sources differ: SAP documentation on GitHub (SAP-docs/btp-cloud-platform), read 2026-10-13 (SAP S/4HANA Cloud) titles it “${other}”`);
      expect(sapReferenceAttributions(text), id).toHaveLength(1);
      expect(sapReferenceAppendixMarkdown(text), id).toContain('sources differ:');
    }
  });

  test('an ID SAP-docs names without a title is a name found in a catalog — never verified', () => {
    setSyncedSapIdentifiers(docsFile());
    const c = one('Use SAP_COM_0532 for the CDS view extraction.', 'SAP_COM_0532');
    expect(c.status).toBe('catalog');
    expect(sapIdStateWord(c)).toBe('name found in catalog');
    expect(sapIdMark(c)).toMatch(/^name found in catalog: SAP's documentation names SAP_COM_0532 \(documented for SAP S\/4HANA Cloud\) without a title/);
    expect(sapIdMark(c)).toContain(SAP_DOCS_LICENCE_SHORT);
  });

  test('a bare SAP-docs ID does not displace a curated list title', () => {
    // SAP_COM_0722 stands in the curated list with a title; the fixture names it nowhere,
    // so add a document that names it alone.
    const list = LIST_MD.replace('`SAP\\_COM\\_0545`', '`SAP_COM_0722`');
    setSyncedSapIdentifiers(docsFile(TABLES_MD, list));
    const c = one('Expose via SAP_COM_0722.', 'SAP_COM_0722');
    expect(c.curatedList).toBe(true);
    expect(c.sapName).toBe('CSN Exposure Integration');
  });
});

/* ------------------------------------------------ attribution where the facts are exported */

test.describe('attribution in every export that carries SAP-docs facts', () => {
  test.afterEach(() => setSyncedSapIdentifiers(EMPTY_SAP_IDENTIFIER_FILE));

  const TEXT = 'Replicate products through SAP_COM_0009 (Product Integration).';

  test('the markdown appendix: a licence note per row and an attribution section with the source at its commit', () => {
    setSyncedSapIdentifiers(docsFile());
    const md = sapReferenceAppendixMarkdown(TEXT);
    expect(md).toMatch(/\| `SAP_COM_0009` \| Communication scenario \| verified \| Product Integration \(documented for SAP S\/4HANA Cloud\) \|/);
    expect(md).toContain('### Attribution');
    expect(md).toContain('https://creativecommons.org/licenses/by/4.0/');
    expect(md).toContain(`https://github.com/SAP-docs/${TABLE_SPEC.repo}/blob/${REV}/${TABLE_SPEC.path}`);
    expect(sapIdentifierSourcesNote()).toContain('SAP documentation on GitHub (SAP-docs/btp-cloud-platform, SAP-docs/sap-datasphere; CC BY 4.0)');
    // Without SAP-docs facts there is no attribution section.
    expect(sapReferenceAppendixMarkdown('Sales orders: SAP_COM_0109 (Sales Order Integration).')).not.toContain('### Attribution');
  });

  test('business-analysis.md and solution-design.md (the delivery package) carry it', () => {
    setSyncedSapIdentifiers(docsFile());
    const analysis = formatAnalysisToMarkdown(JSON.stringify({ projectTitle: 'P', summary: TEXT, gaps: [], strategicNextSteps: [] }));
    expect(analysis).toContain('SAP_COM_0009 [verified:');
    expect(analysis).toContain('### Attribution');
    const design = formatDesignToMarkdown(JSON.stringify({ projectName: 'P', architectureOverview: { approachDescription: TEXT } }));
    expect(design).toContain('### Attribution');
    expect(read('app/(app)/project/[projectId]/delivery/page.tsx')).toMatch(/formatAnalysisToMarkdown\(project\.analysis[\s\S]*formatDesignToMarkdown\(project\.solutionDesign/);
  });

  test('the HTML exports end with the attribution of every mark they wrote', () => {
    setSyncedSapIdentifiers(docsFile());
    const design = buildDesignExportHtml({
      id: 'p',
      name: 'Fixture',
      extensibilityRoute: 'Side-by-Side on SAP BTP',
      solutionDesign: JSON.stringify({
        projectName: 'Fixture',
        architectureOverview: { approachDescription: TEXT, nodeFramework: 'F', runtimePlatform: 'P' },
        nodeAppBlueprint: { projectStructure: [], apiEndpoints: [] },
        cloudServices: [],
        dataSync: { patternName: 'X', description: 'Y' },
        securityHardening: [],
        roadmap: [],
      }),
    } as unknown as Project)!;
    expect(design).toContain('data-sap-attribution');
    expect(design).toContain(`https://github.com/SAP-docs/${TABLE_SPEC.repo}/blob/${REV}/${TABLE_SPEC.path}`);

    const analysis = buildAnalysisExportHtml({
      project: {
        id: 'p',
        name: 'Fixture',
        extensibilityRoute: 'Side-by-Side on SAP BTP',
        analysis: JSON.stringify({ projectTitle: 'P', summary: 'S', asIsContext: TEXT, gaps: [], strategicNextSteps: [] }),
      } as unknown as Project,
      routeReport: null,
      legacyCode: '',
      uploadedFileName: 'z.abap',
      targetDeployment: null,
    })!;
    expect(analysis).toContain('data-sap-attribution');
    expect(analysis.indexOf('data-sap-attribution')).toBeGreaterThan(analysis.indexOf('SAP_COM_0009 [verified:'));

    // No SAP-docs fact, no section.
    setSyncedSapIdentifiers(EMPTY_SAP_IDENTIFIER_FILE);
    const plain = sapReferenceAnnotator();
    plain.annotate(TEXT);
    expect(sapAttributionHtml(plain.attributions(), (s) => s)).toBe('');
  });

  test('the inline mark itself names the licence, so a copied passage keeps it', () => {
    setSyncedSapIdentifiers(docsFile());
    expect(annotateSapReferences(TEXT)).toContain(`SAP_COM_0009 [verified: SAP lists SAP_COM_0009 as “Product Integration” (documented for SAP S/4HANA Cloud)`);
    expect(annotateSapReferences(TEXT)).toContain(SAP_DOCS_LICENCE_SHORT);
  });

  test('the licences page names the SAP-docs source and CC BY 4.0', () => {
    const page = read('app/licenses/page.tsx');
    expect(page).toContain('https://github.com/SAP-docs');
    expect(page).toContain('https://creativecommons.org/licenses/by/4.0/');
  });
});
