/**
 * Roadmap 3.0.20, step F1 — the fit-to-standard gate
 * (`docs/design/fit-to-standard-concept.md` §3, §8; owner decisions 18.10.2026).
 *
 * The gate is pinned on every program the engine is pinned on, Public and
 * Private. The expected outcome of each was written down before the gate ran
 * (concept §3.4). Where the owner's expectation and the gate disagree the pin
 * says what the gate answers and the comment names the disagreement — a
 * finding for the owner, not a tuning knob:
 *
 *   - Z_SALES_ORDER_CREATOR: expected C; on Public the three BAPIs have no
 *     released path in SAP's file, so the gate does not offer (it does on Private).
 *   - Z_MM_PO_APPROVAL: expected not determined (dynamic call) or C; it writes
 *     two own tables (ZMM_PO_APPR, ZMM_PO_ATTACH) and has no deviation, so the
 *     gate reads own persistence.
 *   - Z_BUSINESS_PARTNER_SYNC: expected B; ADRC has no released path on either
 *     edition, so "every SAP object read has a path" fails.
 *   - Z_ORDER_INTEGRITY_CHECK: expected B; the skeleton has no
 *     business-comparable element, so there is nothing to compare.
 *
 * Server-free.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { readFitToStandard, fileDirection } from '../lib/fit-to-standard-read';
import { fitToStandardGate, fitGateReasonLine, type FitToStandardGateInput } from '../lib/fit-to-standard-gate';
import { catalogSnapshotKeyForProject } from '../lib/abap/catalog-snapshots';
import { readExample } from './helpers/starter-example-files';

const ENGINE = 'v3.0.19';

function gateOf(file: string, edition: 'public' | 'private') {
  return readFitToStandard({
    source: readExample(file),
    fileName: file,
    edition,
    catalogSnapshot: catalogSnapshotKeyForProject({ s4Deployment: edition }),
    engineVersion: ENGINE,
    mode: 'demo',
    hasRun: true,
    analyzeState: 'done',
    signedSourceSha256: null,
  }).gate;
}

const short = (g: ReturnType<typeof gateOf>) =>
  g.outcome === 'offered' ? `offered ${g.classes.join('')}` : g.outcome === 'not-offered' ? `not-offered ${g.exclusion}` : `not-determined ${g.missing}`;

/** Expected outcomes, Public then Private. */
const PINNED: ReadonlyArray<[string, string, string]> = [
  ['Z_MATERIAL_STOCK_CALC.txt', 'offered B', 'offered B'],
  ['Z_INVOICE_EXTRACTOR.txt', 'not-offered integration', 'not-offered integration'],
  ['Z_SALES_ORDER_CREATOR.txt', 'not-offered no-signal', 'offered C'],
  ['Z_SD_DELIVERY_PRIORITY.abap', 'offered AB', 'offered AB'],
  ['Z_MM_PO_APPROVAL.abap', 'not-offered own-persistence', 'not-offered own-persistence'],
  ['Z_SD_FREIGHT_RATE_CHECK.abap', 'not-offered integration', 'not-offered integration'],
  ['ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap', 'not-offered integration', 'not-offered integration'],
  ['Z_BUSINESS_PARTNER_SYNC.txt', 'not-offered no-signal', 'not-offered no-signal'],
  ['Z_EMPLOYEE_EXPENSE_VAL.txt', 'not-offered none-used', 'not-offered none-used'],
  ['Z_ORDER_INTEGRITY_CHECK.txt', 'not-offered nothing-comparable', 'not-offered nothing-comparable'],
];

test.describe('fit-to-standard gate on the pinned programs', () => {
  for (const [file, onPublic, onPrivate] of PINNED) {
    test(`${file}: ${onPublic} on Public, ${onPrivate} on Private`, () => {
      expect(short(gateOf(file, 'public'))).toBe(onPublic);
      expect(short(gateOf(file, 'private'))).toBe(onPrivate);
    });
  }

  test('class A names the BAdI implementation with its lines; the sentence offers an examination, never coverage', () => {
    const g = gateOf('Z_SD_DELIVERY_PRIORITY.abap', 'public');
    expect(g.outcome).toBe('offered');
    if (g.outcome !== 'offered') return;
    expect(g.primary).toBe('A');
    expect(g.strength).toBe('strong');
    const a = g.signals.find((s) => s.gateClass === 'A')!;
    expect(a.lineStart).toBe(49);
    expect(a.lineEnd).toBe(81);
    expect(a.sentence).toContain('L49–L81');
    expect(g.sentence).toMatch(/^Worth examining against SAP standard/);
    expect(g.sentence).not.toMatch(/covered|verified/i);
    expect(g.editionNote).toBeNull();
  });

  test('Private Edition keeps Keep visible as the alternative', () => {
    const g = gateOf('Z_MATERIAL_STOCK_CALC.txt', 'private');
    expect(g.outcome === 'offered' && g.editionNote).toContain('keeping the program stays a real alternative');
  });

  test('a reason that does not offer names its lines', () => {
    const g = gateOf('Z_SD_FREIGHT_RATE_CHECK.abap', 'public');
    expect(g.outcome).toBe('not-offered');
    expect(fitGateReasonLine(g)).toMatch(/integration.*\(L\d+/);
    const near = gateOf('Z_BUSINESS_PARTNER_SYNC.txt', 'public');
    expect(near.signals.map((s) => s.objectName)).toContain('ADRC');
  });
});

/* --------------------------------------------------------------- the rules */

const BASE: FitToStandardGateInput = {
  mode: 'project',
  hasRun: true,
  analyzeState: 'done',
  signedSourceSha256: 'a',
  sourceSha256: 'a',
  edition: 'public',
  findings: [{ kind: 'enhancement', lineStart: 10, lineEnd: 20, objectName: 'SAPMV45A' }],
  sapObjects: { state: 'ready', objects: [{ name: 'VBAK', path: 'successor', called: false, line: 12 }] },
  elements: [{ id: 'n1', kind: 'task', comparability: 'business-comparable', anchor: { lineStart: 11, lineEnd: 11 } }],
};

test.describe('fit-to-standard gate rules', () => {
  test('three outcomes: a stale run, no run and a changed source are not determined, never "no"', () => {
    expect(fitToStandardGate({ ...BASE, analyzeState: 'stale' })).toMatchObject({ outcome: 'not-determined', missing: 'stale-run' });
    expect(fitToStandardGate({ ...BASE, hasRun: false })).toMatchObject({ outcome: 'not-determined', missing: 'no-run' });
    expect(fitToStandardGate({ ...BASE, analyzeState: 'partial' })).toMatchObject({ outcome: 'not-determined', missing: 'unread-run' });
    expect(fitToStandardGate({ ...BASE, sourceSha256: 'b' })).toMatchObject({ outcome: 'not-determined', missing: 'source-changed' });
    expect(fitToStandardGate({ ...BASE, sapObjects: { state: 'not-determined', reason: 'Still being read.' } }))
      .toMatchObject({ outcome: 'not-determined', missing: 'objects-not-sorted' });
    expect(fitToStandardGate(BASE)).toMatchObject({ outcome: 'offered', primary: 'A' });
  });

  test('none-used is not offered', () => {
    expect(fitToStandardGate({ ...BASE, sapObjects: { state: 'none-used' } })).toMatchObject({ outcome: 'not-offered', exclusion: 'none-used' });
  });

  test('an opaque call on the reached code is not determined, with "upload the called program"', () => {
    const g = fitToStandardGate({
      ...BASE,
      elements: [...BASE.elements, { id: 'n2', kind: 'call-opaque', comparability: 'unknown', anchor: { lineStart: 30, lineEnd: 30 } }],
    });
    expect(g).toMatchObject({ outcome: 'not-determined', missing: 'opaque-call' });
    expect(g.outcome !== 'offered' && g.reason).toContain('Upload the called program');
    expect(g.signals[0].lineStart).toBe(30);
  });

  test('own persistence excludes — unless a deviation from a standard process is there', () => {
    const write = { kind: 'custom-table-write', lineStart: 40, objectName: 'ZLOG' };
    expect(fitToStandardGate({ ...BASE, findings: [write] })).toMatchObject({ outcome: 'not-offered', exclusion: 'own-persistence' });
    expect(fitToStandardGate({ ...BASE, findings: [...BASE.findings, write] })).toMatchObject({ outcome: 'offered', primary: 'A' });
  });

  test('integration excludes: an outbound RFC, a proxy, a file as the only output — a local RFC and an upload do not', () => {
    const rfcOut = { kind: 'rfc-call', lineStart: 5, outbound: true };
    expect(fitToStandardGate({ ...BASE, findings: [...BASE.findings, rfcOut] })).toMatchObject({ exclusion: 'integration' });
    expect(fitToStandardGate({ ...BASE, findings: [...BASE.findings, { ...rfcOut, outbound: false }] })).toMatchObject({ outcome: 'offered' });
    expect(fitToStandardGate({ ...BASE, findings: [...BASE.findings, { kind: 'abap-proxy', lineStart: 6 }] })).toMatchObject({ exclusion: 'integration' });
    const fileOut = { kind: 'gui-download', lineStart: 7, direction: 'out' as const };
    expect(fitToStandardGate({ ...BASE, findings: [...BASE.findings, fileOut] })).toMatchObject({ exclusion: 'integration' });
    expect(fitToStandardGate({ ...BASE, findings: [...BASE.findings, fileOut, { kind: 'classic-alv', lineStart: 8 }] })).toMatchObject({ outcome: 'offered' });
    expect(fitToStandardGate({ ...BASE, findings: [...BASE.findings, { ...fileOut, direction: 'in' as const }] })).toMatchObject({ outcome: 'offered' });
  });

  test('a finding the engine marked as not reached weighs nothing', () => {
    const g = fitToStandardGate({ ...BASE, findings: [...BASE.findings, { kind: 'rfc-call', lineStart: 5, outbound: true, notReached: true }] });
    expect(g.outcome).toBe('offered');
  });

  test('nothing comparable is not offered', () => {
    const g = fitToStandardGate({ ...BASE, elements: [{ id: 'n1', kind: 'read', comparability: 'technical', anchor: null }] });
    expect(g).toMatchObject({ outcome: 'not-offered', exclusion: 'nothing-comparable' });
  });

  test('class B needs every SAP object read to have a path; class C a called object with one; D is an add-on, weak alone', () => {
    const read = { kind: 'standard-table-read', lineStart: 3, objectName: 'VBAK' };
    expect(fitToStandardGate({ ...BASE, findings: [read] })).toMatchObject({ outcome: 'offered', primary: 'B', strength: 'medium' });
    expect(fitToStandardGate({
      ...BASE,
      findings: [read],
      sapObjects: { state: 'ready', objects: [{ name: 'VBAK', path: 'no-path', called: false, line: 3 }] },
    })).toMatchObject({ outcome: 'not-offered', exclusion: 'no-signal' });
    expect(fitToStandardGate({ ...BASE, findings: [read, { kind: 'commit-work', lineStart: 9 }] })).toMatchObject({ exclusion: 'no-signal' });
    expect(fitToStandardGate({
      ...BASE,
      findings: [],
      sapObjects: { state: 'ready', objects: [{ name: 'BAPI_X', path: 'successor', called: true, line: 4 }] },
    })).toMatchObject({ outcome: 'offered', primary: 'C' });
    const d = fitToStandardGate({ ...BASE, findings: [], sapObjects: { state: 'ready', objects: [] }, customizing: [{ ruleId: 'BR-001', lineStart: 14 }] });
    expect(d).toMatchObject({ outcome: 'offered', primary: 'D', strength: 'weak' });
  });

  test('without an edition the gate reads Public and says so', () => {
    const g = fitToStandardGate({ ...BASE, edition: null });
    expect(g).toMatchObject({ outcome: 'offered', edition: 'public', editionAssumed: true });
  });

  test('the file direction is read from the statement, not from the shared title', () => {
    expect(fileDirection({ kind: 'gui-download', title: 'Legacy Frontend File Upload/Download', objectName: 'GUI_UPLOAD', snippet: "CALL FUNCTION 'GUI_UPLOAD'" })).toBe('in');
    expect(fileDirection({ kind: 'gui-download', title: 'Legacy Frontend File Upload/Download', objectName: 'GUI_DOWNLOAD', snippet: '' })).toBe('out');
    expect(fileDirection({ kind: 'dataset-io', title: 'File on the application server (TRANSFER)', snippet: 'TRANSFER ls TO lv_file.' })).toBe('out');
    expect(fileDirection({ kind: 'dataset-io', title: 'File on the application server (OPEN DATASET)', snippet: 'OPEN DATASET f FOR INPUT IN TEXT MODE.' })).toBe('in');
  });
});

test('source guard: the gate imports types only — no lib/bpmn, no catalog, and the score is no input', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'fit-to-standard-gate.ts'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  expect(code).not.toMatch(/^\s*import\s+(?!type\b)/m);
  expect(code).not.toMatch(/lib\/bpmn|catalog-service|clean-core-score/);
  expect(code).not.toMatch(/\bscore\b/i);
});
