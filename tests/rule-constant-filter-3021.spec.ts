import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { constantUsesOf, explainBusinessRules } from '../lib/abap/business-rule-set-explain';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { readStatements } from '../lib/abap/statement-reader';
import { buildRequirementSet } from '../lib/functional-requirements';
import { ENGINE_READS_3021_FROM, engineReads3021Apply } from '../lib/abap/engine-reads-3021-gate';

/**
 * Roadmap 3.0.21 — "A constant the code filters with is not 'declared, not used'" (found 22.10.2026 by the
 * Documentation analysis, owner decision the same day). The PO starter example declares its document type,
 * release group and purchasing organisation as constants (BR-001–003), filters its reads with them and writes them
 * into the purchase order header; the rule baskets called them "declared, not used … decides nothing" and proposed
 * to drop them. From engine 3.0.21 they sit in the business basket with the lines where they filter and set, and the
 * Design requirement says the same with the same lines. Engine-version gated. Server-free.
 */

const PO = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter-examples-3.0.17', 'Z_MM_PO_APPROVAL.abap'), 'utf8');

const explain = (source: string, engine: string) => explainBusinessRules(source, deriveBusinessRules(source), buildProcessFacts(source), engine);

/** The lines of the PO example that hold `text`, 1-based. */
function linesWith(text: string): number[] {
  return PO.split(/\r?\n/).flatMap((l, i) => (l.includes(text) ? [i + 1] : []));
}

test('the 3.0.21 gate', () => {
  expect(ENGINE_READS_3021_FROM).toBe('3.0.21');
  expect(engineReads3021Apply('3.0.21')).toBe(true);
  expect(engineReads3021Apply('v3.0.20')).toBe(false);
  expect(engineReads3021Apply(null)).toBe(false);
});

test('PO example: BR-001–003 sit in the business basket with the lines where they filter and set', () => {
  const ex = explain(PO, '3.0.21');
  for (const id of ['BR-001', 'BR-002', 'BR-003']) expect(ex.baskets.business, id).toContain(id);
  const byId = new Map(ex.rules.map((r) => [r.id, r]));
  const purchOrg = byId.get('BR-003')!;
  expect(purchOrg.headline).toMatch(/^Only .+ 1000$/);
  expect(purchOrg.headline).not.toMatch(/declared, not used/);
  expect(purchOrg.proposal.kind).toBe('configure');
  expect(purchOrg.protects.text).not.toMatch(/decides nothing/);
  expect(purchOrg.protects.text).toMatch(/reads only data with .+ 1000/);
  // Every WHERE that names the constant, and the header field it sets, is an anchor of the basket's reason.
  const anchored = new Set(purchOrg.basket.reason.anchors.flatMap((a) => Array.from({ length: a.lineEnd - a.lineStart + 1 }, (_, k) => a.lineStart + k)));
  for (const line of linesWith('c_purch_org').filter((l) => l > 19)) expect(anchored.has(line), `line ${line}`).toBe(true);
  // The document type filters the open-order read and is written into the header.
  const docType = byId.get('BR-001')!;
  expect(docType.protects.text).toMatch(/document type NB/);
  expect(docType.protects.text).toMatch(/writes document type NB/);
  const docLines = new Set(docType.basket.reason.anchors.flatMap((a) => Array.from({ length: a.lineEnd - a.lineStart + 1 }, (_, k) => a.lineStart + k)));
  for (const line of linesWith('c_doc_type').filter((l) => l > 19)) expect(docLines.has(line), `line ${line}`).toBe(true);
  // Each is asked as a question for the business.
  for (const id of ['BR-001', 'BR-002', 'BR-003']) expect(ex.questions.some((q) => q.ruleIds.includes(id)), id).toBe(true);
});

test('PO example: an engine before 3.0.21 keeps its reading', () => {
  const ex = explain(PO, '3.0.20');
  for (const id of ['BR-001', 'BR-002', 'BR-003']) expect(ex.baskets.undetermined, id).toContain(id);
  expect(ex.rules.find((r) => r.id === 'BR-003')!.headline).toMatch(/declared, not used$/);
});

test('PO example: Design and the Documentation agree — the requirement names the filter with the same lines', () => {
  const now = buildRequirementSet({ source: PO, engineVersion: '3.0.21' });
  const ex = explain(PO, '3.0.21');
  const req = now.requirements.find((r) => r.basis.kind === 'rule' && r.basis.ref === 'BR-003')!;
  expect(req.statement).toMatch(/process only/);
  expect(req.acceptance[0].then).toMatch(/^the record is not read, so it is not processed — the code reads only '1000' \(L\d+/);
  expect(req.acceptance[0].then).not.toMatch(/to be confirmed/);
  const filterLines = ex.rules.find((r) => r.id === 'BR-003')!.protects.text.match(/\(lines? ([^)]+)\)/)![1];
  for (const line of filterLines.match(/\d+/g)!.slice(0, 3)) expect(req.acceptance[0].then).toContain(`L${line}`);
  const before = buildRequirementSet({ source: PO, engineVersion: '3.0.20' });
  expect(before.requirements.find((r) => r.basis.kind === 'rule' && r.basis.ref === 'BR-003')!.acceptance[0].then).toMatch(/to be confirmed/);
});

test('a constant that reaches no condition, WHERE or write stays "declared, not used"', () => {
  const source = [
    'REPORT zfx_const.',
    "CONSTANTS: c_plant TYPE werks_d VALUE '1000',",
    "           c_kind TYPE c LENGTH 2 VALUE 'ZA'.",
    'DATA: gt_rows TYPE STANDARD TABLE OF mara,',
    '      gv_note TYPE string.',
    'START-OF-SELECTION.',
    "  gv_note = 'c_plant'.",
    '  WRITE: / c_kind.',
  ].join('\n');
  const ex = explain(source, '3.0.21');
  expect(ex.rules.length).toBeGreaterThan(0);
  for (const r of ex.rules) {
    expect(r.headline, r.id).toMatch(/declared, not used$/);
    expect(r.basket.kind, r.id).toBe('undetermined');
  }
});

test('constantUsesOf: a WHERE, a READ … WITH KEY and an assignment count; a condition, a literal and a list do not', () => {
  const statements = readStatements(
    [
      "CONSTANTS c_org TYPE ekorg VALUE '1000'.",
      'SELECT * FROM lfm1 INTO TABLE @DATA(lt) WHERE ekorg = @c_org.',
      'LOOP AT lt INTO DATA(ls) WHERE ekorg = c_org.',
      'ENDLOOP.',
      'READ TABLE lt INTO ls WITH KEY ekorg = c_org.',
      'ls_header-purch_org = c_org.',
      "gv_text = 'c_org'.",
      'WRITE c_org.',
      'IF ls-ekorg = c_org.',
      'ENDIF.',
    ].join('\n'),
  );
  expect(constantUsesOf(statements, 'c_org', 1).map((u) => `${u.lineStart} ${u.kind}`)).toEqual(['2 filter', '3 filter', '5 filter', '6 sets']);
});
