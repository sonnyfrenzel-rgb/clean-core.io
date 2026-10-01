import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { EvidenceFinding } from '../lib/abap/evidence-model';
import {
  calmRecommendation,
  calmTitle,
  findingRows,
  groupByKind,
  kindDistribution,
  KIND_LABEL,
  levelDistribution,
  lookHereFirst,
  NO_FILTER,
  pageOf,
  severityDistribution,
  shownGroups,
  sourceBins,
  sourcePositions,
  targetDistribution,
} from '../lib/findings-view';

/**
 * Analyze focus (owner, 01.10.2026): the style-independent rules behind the
 * findings list — calm wording, grouping with progressive disclosure, the
 * "look here first" selection and the data for the visuals.
 */

let n = 0;
function f(p: Partial<EvidenceFinding> & Pick<EvidenceFinding, 'kind' | 'severity'>): EvidenceFinding {
  n += 1;
  return {
    id: `f${n}`,
    title: `Finding ${n}`,
    confidence: 'High',
    source: 'static-parser',
    lineStart: n,
    snippet: `stmt ${n}`,
    technicalDetail: '',
    cleanCoreImpact: '',
    recommendation: '',
    targetOptions: [],
    ...p,
  };
}

const FIXTURE: EvidenceFinding[] = [
  f({ kind: 'standard-table-write', severity: 'Critical', title: 'CRITICAL: Direct Write to SAP Standard Table EBAN', objectName: 'EBAN', lineStart: 246 }),
  f({ kind: 'standard-table-write', severity: 'Critical', title: 'CRITICAL: Direct Write to SAP Standard Table EBAN', objectName: 'EBAN', lineStart: 455 }),
  f({ kind: 'custom-table-write', severity: 'High', objectName: 'ZMM_PO_APPR', lineStart: 450, targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP'] }),
  f({ kind: 'custom-table-write', severity: 'High', objectName: 'ZMM_PO_ATTACH', lineStart: 647, targetOptions: ['Developer Extensibility / RAP'] }),
  f({ kind: 'bdc', severity: 'High', objectName: 'ME21N', lineStart: 631 }),
  f({ kind: 'commit-work', severity: 'Medium', objectName: 'COMMIT', lineStart: 640 }),
  ...Array.from({ length: 8 }, (_, i) =>
    f({ kind: 'standard-table-read', severity: 'Medium', objectName: `T${i}`, lineStart: 10 + i * 20 }),
  ),
  f({ kind: 'authority-check', severity: 'Low', objectName: 'M_BEST_EKO', lineStart: 30 }),
];

test.describe('calm wording — a display mapping, the signed text stays', () => {
  test('titles lose the severity prefix and read in sentence case; names keep their case', () => {
    expect(calmTitle('CRITICAL: Direct Write to SAP Standard Table EBAN')).toBe('Direct write to SAP standard table EBAN');
    expect(calmTitle('Legacy Batch Data Communication (BDC) to TCode ME21N')).toBe('Legacy batch data communication (BDC) to TCode ME21N');
    expect(calmTitle('Legacy Screen Painter (Dynpro) UI Pattern')).toBe('Legacy screen painter (Dynpro) UI pattern');
    expect(calmTitle('Remote Function Call (RFC) to FM Z_GET')).toBe('Remote function call (RFC) to FM Z_GET');
    expect(calmTitle('BAdI usage BADI_X')).toBe('BAdI usage BADI_X');
  });

  test('recommendations keep the advice and lose the shouting', () => {
    const engine =
      'REPLACE IMMEDIATELY with official SAP released APIs (OData APIs, BAPIs) or RAP actions. Do NOT perform direct writes in S/4HANA.';
    const calm = calmRecommendation(engine);
    expect(calm).toBe('Replace with released SAP APIs (OData APIs, BAPIs) or RAP actions. Do not perform direct writes in S/4HANA.');
    expect(calm).not.toMatch(/\b[A-Z]{4,}\b(?<!BAPIs|OData)/);
  });

  test('every title and recommendation the engine writes reads calm after mapping', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib/abap/evidence-model.ts'), 'utf8');
    const titles = [...src.matchAll(/title:\s*[`'"]([^`'"]+)[`'"]/g)].map((m) => calmTitle(m[1]));
    const recs = [...src.matchAll(/recommendation:\s*[`'"]([^`'"]+)[`'"]/g)].map((m) => calmRecommendation(m[1]));
    expect(titles.length).toBeGreaterThan(15);
    expect(recs.length).toBeGreaterThan(15);
    for (const text of [...titles, ...recs]) {
      expect(text).not.toMatch(/^(CRITICAL|HIGH|MEDIUM|LOW)\s*:/);
      expect(text).not.toMatch(/\b(IMMEDIATELY|NOT|MUST|NEVER)\b/);
    }
  });

  test('the engine is not edited to get there: the signed strings are unchanged', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib/abap/evidence-model.ts'), 'utf8');
    expect(src).toContain('title: `CRITICAL: Direct Write to SAP Standard Table ${table}`');
    expect(fs.readFileSync(path.resolve(__dirname, '..', 'app/api/runs/create/route.ts'), 'utf8')).toContain(
      'evidenceReport: evidenceReport.findings',
    );
  });

  test('every kind of finding has a group name', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib/abap/evidence-model.ts'), 'utf8');
    const block = src.slice(src.indexOf('export type EvidenceKind'), src.indexOf(';', src.indexOf('export type EvidenceKind')));
    const kinds = [...block.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    expect(kinds.length).toBeGreaterThan(15);
    expect(Object.keys(KIND_LABEL).sort()).toEqual([...kinds].sort());
  });
});

test.describe('groups and progressive disclosure', () => {
  const rows = findingRows(FIXTURE);
  const groups = groupByKind(rows);

  test('one row per pattern and object, lines gathered', () => {
    const eban = rows.find((r) => r.finding.objectName === 'EBAN')!;
    expect(eban.lines).toEqual([246, 455]);
    expect(rows).toHaveLength(14);
  });

  test('groups by kind, most severe first; critical and high groups open, the rest closed', () => {
    expect(groups.map((g) => [g.label, g.rows.length, g.openByDefault])).toEqual([
      ['Direct write to an SAP standard table', 1, true],
      ['Writes to custom tables', 2, true],
      ['Batch input to a transaction', 1, true],
      ['Direct reads of SAP standard tables', 8, false],
      ['Explicit transaction control', 1, false],
      ['Authorization check', 1, false],
    ]);
  });

  test('five rows first, then "Show N more"', () => {
    const reads = groups.find((g) => g.kind === 'standard-table-read')!;
    expect(pageOf(reads.rows, false)).toMatchObject({ more: 3 });
    expect(pageOf(reads.rows, false).shown).toHaveLength(5);
    expect(pageOf(reads.rows, true)).toMatchObject({ more: 0 });
    expect(pageOf(reads.rows, true).shown).toHaveLength(8);
    expect(pageOf(rows.slice(0, 5), false).more).toBe(0);
  });

  test('without a filter the reader\'s own toggles win over the default', () => {
    const shown = shownGroups(groups, NO_FILTER, { 'standard-table-read': true, bdc: false });
    expect(shown.find((g) => g.kind === 'standard-table-read')!.open).toBe(true);
    expect(shown.find((g) => g.kind === 'bdc')!.open).toBe(false);
    expect(shown).toHaveLength(groups.length);
  });

  test('a filter shows only matching groups, and opens every one of them', () => {
    const bySeverity = shownGroups(groups, { query: '', severity: 'Medium' }, { 'standard-table-read': false });
    expect(bySeverity.map((g) => g.kind)).toEqual(['standard-table-read', 'commit-work']);
    expect(bySeverity.every((g) => g.open)).toBe(true);

    const byQuery = shownGroups(groups, { query: 'zmm_po_attach', severity: 'All' });
    expect(byQuery).toHaveLength(1);
    expect(byQuery[0].matching.map((r) => r.finding.objectName)).toEqual(['ZMM_PO_ATTACH']);
    // The calm title and the group name are searchable too.
    expect(shownGroups(groups, { query: 'direct reads', severity: 'All' })[0].kind).toBe('standard-table-read');
    expect(shownGroups(groups, { query: 'nothing like this', severity: 'All' })).toEqual([]);
  });
});

test.describe('look here first', () => {
  test('at most three, critical before high, one per kind, each with its rule', () => {
    const picks = lookHereFirst(findingRows(FIXTURE));
    expect(picks.map((p) => [p.row.finding.kind, p.why])).toEqual([
      ['standard-table-write', 'Critical · Writes directly to an SAP standard table'],
      ['bdc', 'High · Drives an SAP transaction through batch input'],
      ['custom-table-write', 'High'],
    ]);
  });

  test('a listed medium kind qualifies, an unlisted medium does not, and nothing is padded', () => {
    const only = findingRows([
      f({ kind: 'commit-work', severity: 'Medium', lineStart: 5 }),
      f({ kind: 'standard-table-read', severity: 'Medium', lineStart: 6 }),
      f({ kind: 'authority-check', severity: 'Low', lineStart: 7 }),
    ]);
    const picks = lookHereFirst(only);
    expect(picks.map((p) => p.row.finding.kind)).toEqual(['commit-work']);
    expect(picks[0].why).toBe('Medium · Controls the database transaction itself');
    expect(lookHereFirst(findingRows([f({ kind: 'authority-check', severity: 'Low' })]))).toEqual([]);
  });
});

test.describe('data for the visuals', () => {
  const rows = findingRows(FIXTURE);

  test('severity distribution lists every severity, shares add up', () => {
    const d = severityDistribution(rows);
    expect(d.map((e) => [e.key, e.count])).toEqual([['Critical', 1], ['High', 3], ['Medium', 9], ['Low', 1]]);
    expect(d.reduce((s, e) => s + e.share, 0)).toBeCloseTo(1);
    expect(severityDistribution([]).every((e) => e.share === 0)).toBe(true);
  });

  test('kind and target distributions count what occurs, largest first', () => {
    expect(kindDistribution(rows)[0]).toMatchObject({ key: 'standard-table-read', count: 8, label: 'Direct reads of SAP standard tables' });
    expect(targetDistribution(rows).map((e) => [e.key, e.count])).toEqual([
      ['Developer Extensibility / RAP', 2],
      ['Side-by-Side CAP', 1],
    ]);
  });

  test('levels A–D, and objects without a level counted as not assessed', () => {
    const d = levelDistribution(['A', 'B', 'B', 'D', 'Unknown']);
    expect(d.map((e) => [e.key, e.count])).toEqual([['A', 1], ['B', 2], ['C', 0], ['D', 1], ['Unknown', 1]]);
    expect(d[4].label).toBe('Not assessed');
  });

  test('positions along the source: every occurrence, nothing outside the source', () => {
    const pos = sourcePositions(rows, 669);
    expect(pos).toHaveLength(15);
    expect(pos[0]).toMatchObject({ line: 10, severity: 'Medium' });
    expect(pos.find((p) => p.line === 246)).toMatchObject({ severity: 'Critical', title: 'Direct write to SAP standard table EBAN' });
    expect(pos.every((p) => p.at >= 0 && p.at <= 1)).toBe(true);
    // A shorter source drops what lies beyond it instead of piling it on the last line.
    expect(sourcePositions(rows, 300).every((p) => p.line <= 300)).toBe(true);
    expect(sourcePositions(rows, 0)).toEqual([]);
  });

  test('bins cover every line once and carry their worst finding', () => {
    const bins = sourceBins(sourcePositions(rows, 669), 669, 40);
    expect(bins).toHaveLength(40);
    expect(bins[0].from).toBe(1);
    expect(bins[39].to).toBe(669);
    for (let i = 1; i < bins.length; i++) expect(bins[i].from).toBe(bins[i - 1].to + 1);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(15);
    const withEban = bins.find((b) => b.from <= 246 && 246 <= b.to)!;
    expect(withEban.worst).toBe('Critical');
    expect(bins.filter((b) => b.count === 0).every((b) => b.worst === null && b.firstLine === null)).toBe(true);
    expect(sourceBins([], 10, 40)).toHaveLength(10);
  });
});
