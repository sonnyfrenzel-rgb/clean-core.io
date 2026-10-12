import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { programSummaryFactsOf } from '../lib/program-summary-facts';
import {
  businessInShort,
  businessInShortText,
  businessJargon,
  LEVEL_RECONSTRUCTED,
  managementInShort,
  programSummary,
  withoutCodes,
} from '../lib/program-summary-text';
import { checkPurposeProposal, purposeProposalOf } from '../lib/program-summary-check';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessDocument } from '../lib/process-document-build';
import { documentOutline } from '../lib/process-document-outline';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { processDocumentationToMarkdown } from '../lib/process-documentation';
import { processSummaryOf } from '../lib/process-summary';
import { programFactsBlock } from '../lib/analysis-prompt';

/**
 * "In short" — what a Z program is for, one text model for First insights,
 * Analyze, Documentation and Management (owner, 12.10.2026: *"the business
 * high-level texts about what a Z program does … must get clearly better"*;
 * roadmap 3.0.11, CO review F03-DOC and §7.1, FI review §6.1).
 *
 * Pinned on the demo and on one benchmark case of the learning half
 * (BM-028, a goods-movement interface), and on a small CO-shaped program
 * written here: the slots, their order, the wording a business reader sees,
 * the level, and that the four places say the same thing. Server-free.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const DEMO = read('public/starter-examples/Z_MM_PO_APPROVAL.abap');
const BM028 = read('tests/prozess-benchmark/cases/BM-028/source.abap');

/** A CO-shaped program: selection texts set in INITIALIZATION, four segments fixed in the code, read-only. */
const CO_SHAPED = `REPORT zco_alloc_review.
TABLES csks.
SELECTION-SCREEN BEGIN OF BLOCK a WITH FRAME TITLE b01.
SELECTION-SCREEN BEGIN OF LINE.
SELECTION-SCREEN COMMENT 1(32) l_kokrs FOR FIELD p_kokrs.
PARAMETERS p_kokrs TYPE tka01-kokrs OBLIGATORY.
SELECTION-SCREEN END OF LINE.
SELECTION-SCREEN BEGIN OF LINE.
SELECTION-SCREEN COMMENT 1(32) l_gjahr FOR FIELD p_gjahr.
PARAMETERS p_gjahr TYPE gjahr OBLIGATORY.
SELECTION-SCREEN END OF LINE.
SELECTION-SCREEN BEGIN OF LINE.
SELECTION-SCREEN COMMENT 1(32) l_from FOR FIELD p_from.
PARAMETERS p_from TYPE n LENGTH 3 OBLIGATORY.
SELECTION-SCREEN END OF LINE.
SELECTION-SCREEN BEGIN OF LINE.
SELECTION-SCREEN COMMENT 1(32) l_to FOR FIELD p_to.
PARAMETERS p_to TYPE n LENGTH 3 OBLIGATORY.
SELECTION-SCREEN END OF LINE.
SELECTION-SCREEN BEGIN OF LINE.
SELECTION-SCREEN COMMENT 1(32) l_vers FOR FIELD p_vers.
PARAMETERS p_vers TYPE cosp-versn OBLIGATORY.
SELECTION-SCREEN END OF LINE.
SELECTION-SCREEN END OF BLOCK a.

DATA: gt_cosp TYPE STANDARD TABLE OF cosp,
      gt_coss TYPE STANDARD TABLE OF coss,
      gt_csks TYPE STANDARD TABLE OF csks.

INITIALIZATION.
  b01 = 'Read-only simulation'.
  l_kokrs = 'Controlling area'.
  l_gjahr = 'Fiscal year'.
  l_from = 'First period (001..016)'.
  l_to = 'Last period (001..016)'.
  l_vers = 'Plan version'.

START-OF-SELECTION.
  PERFORM add_segment USING 'FAC' 'SVCFAC' 'AREA'  'M2' '90.00'.
  PERFORM add_segment USING 'IT'  'SVCIT'  'HEAD'  'EA' '100.00'.
  PERFORM add_segment USING 'QA'  'SVCQA'  'UNITS' 'EA' '100.00'.
  PERFORM add_segment USING 'ENG' 'SVCENG' 'HOURS' 'H'  '100.00'.
  SELECT * FROM csks INTO TABLE gt_csks WHERE kokrs = p_kokrs.
  SELECT * FROM cosp INTO TABLE gt_cosp WHERE gjahr = p_gjahr AND versn = p_vers.
  SELECT * FROM coss INTO TABLE gt_coss WHERE gjahr = p_gjahr AND versn = p_vers.
  CALL FUNCTION 'REUSE_ALV_LIST_DISPLAY'
    TABLES
      t_outtab = gt_csks.

FORM add_segment USING iv_pool TYPE clike
                       iv_sender TYPE clike
                       iv_driver TYPE clike
                       iv_unit TYPE clike
                       iv_percent TYPE clike.
  WRITE: / iv_pool, iv_sender, iv_driver, iv_unit, iv_percent.
ENDFORM.
`;

const summaryOf = (source: string) => {
  const facts = programSummaryFactsOf(source);
  return { facts, summary: programSummary(facts) };
};
const slot = (s: ReturnType<typeof programSummary>, key: string) => s.lines.filter((l) => l.key === key).map((l) => l.text);

function mapOf(source: string, fileName: string) {
  const named = applyNaming(namingContextOf(source), null);
  const { bpmn, technical } = buildReadingExports(source, { processName: fileName, sourceFileName: fileName });
  return buildProcessMapModel({ bpmn, technical, named, fileName });
}

test.describe('the slots, in order, from engine facts only', () => {
  test('the demo: purpose before counts, what it changes, the result, who starts it, the level', () => {
    const { summary } = summaryOf(DEMO);
    expect(summary.lines.map((l) => l.key)).toEqual(['purpose', 'changes', 'reads', 'result', 'trigger', 'rules', 'limits']);
    expect(slot(summary, 'purpose')[0]).toBe(
      'Creates purchase orders and starts workflows in SAP from purchase requisitions (EBAN) and suppliers (LFA1), selected by purchase requisition number.',
    );
    expect(slot(summary, 'changes')[0]).toBe(
      'It creates purchase orders (BAPI_PO_CREATE1) and starts workflows (SAP_WAPI_CREATE_EVENT) and changes purchase requisitions (EBAN) and two custom tables (ZMM_PO_APPR, ZMM_PO_ATTACH) in SAP.',
    );
    expect(slot(summary, 'result')[0]).toBe('The result is a list on screen.');
    expect(slot(summary, 'trigger')[0]).toBe('A user starts it from a selection screen with 4 inputs, or it runs as a background job.');
    expect(slot(summary, 'rules')[0]).toMatch(/^\d+ business rules are fixed in the code\.$/);
    expect(summary.level.text).toBe(LEVEL_RECONSTRUCTED);
    // No decision-point count on this level (CO review F03-DOC).
    expect(summary.lines.map((l) => l.text).join(' ')).not.toMatch(/decision point/);
    // Every sentence about the code carries its lines, except the counts and the limits.
    for (const l of summary.lines.filter((x) => ['purpose', 'changes', 'reads', 'result', 'trigger'].includes(x.key))) {
      expect(l.anchors.length, l.text).toBeGreaterThan(0);
    }
  });

  test('BM-028: a goods-movement interface says that it posts, and from where', () => {
    const { facts, summary } = summaryOf(BM028);
    expect(facts.changes.state).toBe('changes');
    expect(slot(summary, 'purpose')[0]).toBe('Posts goods movements in SAP from the lines of a file on the application server.');
    expect(slot(summary, 'changes')[0]).toBe('It posts goods movements (BAPI_GOODSMVT_CREATE) in SAP.');
    expect(slot(summary, 'reads')[0]).toBe('It reads storage location stock (MARD) and a file on the application server.');
    // The posting is the first thing a manager reads — and what a replacement must take over.
    expect(managementInShort(summary, facts)).toContain('For the decision: it changes data in SAP — it posts goods movements —');
    // A commit or a rollback is not a business effect.
    expect(summary.lines.map((l) => l.text).join(' ')).not.toMatch(/save the changes|discard the changes/i);
  });

  test('a CO-shaped program: the selection screen in its own words, the fixed segments, read-only', () => {
    const { facts, summary } = summaryOf(CO_SHAPED);
    expect(facts.inputs.map((i) => i.label)).toEqual(['Controlling area', 'Fiscal year', 'First period (001..016)', 'Last period (001..016)', 'Plan version']);
    expect(facts.screenTitles.map((t) => t.text)).toEqual(['Read-only simulation']);
    expect(slot(summary, 'purpose')).toEqual([
      'A read-only report on cost centers (CSKS) and cost totals (COSP, COSS), selected by controlling area, fiscal year, period range and plan version.',
      'Four segments are fixed in the code — pools “FAC”, “IT”, “QA” and “ENG” — each with its own driver: “AREA”, “HEAD”, “UNITS” and “HOURS”.',
    ]);
    expect(slot(summary, 'changes')).toEqual(['It does not post or change data in SAP.']);
    expect(managementInShort(summary, facts)).toContain('For the decision: it posts and changes nothing in SAP');
  });
});

test.describe('simple on top: the Business view reads without code', () => {
  test('the short form is two to five sentences: purpose, changes, result, trigger — no codes, no jargon', () => {
    for (const source of [DEMO, BM028, CO_SHAPED]) {
      const { summary } = summaryOf(source);
      const lines = businessInShort(summary, { codes: false });
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines.length).toBeLessThanOrEqual(5);
      expect(lines.map((l) => l.key).every((k) => ['purpose', 'changes', 'result', 'trigger'].includes(k))).toBe(true);
      for (const l of lines) expect(businessJargon(l.text), l.text).toEqual([]);
    }
    expect(businessInShortText(summaryOf(BM028).summary, { codes: false })).toBe(
      'Posts goods movements in SAP from the lines of a file on the application server. The result is a list on screen. A user starts it from a selection screen with 2 inputs, or it runs as a background job.',
    );
  });

  test('the jargon guard holds on every starter example and on the benchmark learning cases', () => {
    const split = JSON.parse(read('tests/prozess-benchmark/split.json')) as { learn: string[] };
    const sources = [
      ...fs.readdirSync(path.join(process.cwd(), 'public/starter-examples')).map((f) => `public/starter-examples/${f}`),
      ...split.learn.map((id) => `tests/prozess-benchmark/cases/${id}/source.abap`).filter((f) => fs.existsSync(path.join(process.cwd(), f))),
    ];
    expect(sources.length).toBeGreaterThan(20);
    for (const file of sources) {
      const { summary } = summaryOf(read(file));
      for (const l of businessInShort(summary, { codes: false })) expect(businessJargon(l.text), `${file}: ${l.text}`).toEqual([]);
    }
  });

  test('the guard knows jargon when it sees it', () => {
    expect(businessJargon('It reads EBAN and LFA1.')).toEqual(['EBAN', 'LFA1']);
    expect(businessJargon('A component of the structure is bound to the field symbol.')).toEqual(['field symbol']);
    expect(businessJargon('It reads suppliers (LFA1) in SAP; pools “FAC” and “IT”.')).toEqual([]);
    expect(withoutCodes('It reads cost centers (CSKS) and cost totals (COSP, COSS), selected by controlling area.')).toBe(
      'It reads cost centers and cost totals, selected by controlling area.',
    );
  });
});

test.describe('the four places say the same thing', () => {
  test('Documentation stage, the delivery file, Management and the Business view open with the same purpose', () => {
    const file = 'Z_MM_PO_APPROVAL.abap';
    const { facts, summary } = summaryOf(DEMO);
    const purpose = slot(summary, 'purpose')[0];
    const map = mapOf(DEMO, file);

    const outline = documentOutline(buildProcessDocument({ source: DEMO, map }), {});
    expect(outline.business.does[0].text).toBe(purpose);

    const md = processDocumentationToMarkdown(buildProcessDocumentation({ source: DEMO, map }));
    const inShort = md.slice(md.indexOf('## In short'), md.indexOf('<a id="process"></a>'));
    expect(inShort).toContain(`- ${purpose} (Reconstructed`);
    // Counts lead no more: no "decides with N business rules at M decision points".
    expect(inShort).not.toMatch(/decides with \d+ business rules? at \d+ decision points?/);
    expect(inShort).not.toMatch(/stops or skips with a message in \d+ cases?/);
    // The rules count is the one the Business view counts.
    expect(inShort).toContain(`${facts.rules} business rules are fixed in the code`);

    const management = processSummaryOf(DEMO, file)?.management ?? '';
    expect(management.startsWith(purpose)).toBe(true);
    expect(management).toContain('For the decision:');
    expect(management).not.toMatch(/EUR|€|\$|saving/i);

    expect(withoutCodes(purpose)).toBe(businessInShort(summary, { codes: false })[0].text);
  });

  test('the reader questions are answered on the page, not only linked', () => {
    const map = mapOf(CO_SHAPED, 'zco.abap');
    const outline = documentOutline(buildProcessDocument({ source: CO_SHAPED, map }), {});
    const q = outline.business.questions;
    expect(q.find((x) => x.target === 'data')?.answer).toContain('It selects by controlling area, fiscal year, period range and plan version.');
    expect(q.find((x) => x.target === 'changes')?.answer).toContain('Today it does not post or change data in SAP.');
  });
});

test.describe('a model may phrase the purpose — checked against the facts', () => {
  const co = programSummaryFactsOf(CO_SHAPED);

  test("the owner's sample for the CO case passes; contradictions do not", () => {
    const owner = 'The report helps a controller compare plan and actual on cost centres and simulate the allocation of shared-service costs to production cost centers. The report does not post; it produces a traceable simulation including variances, exclusions and blocked segments.';
    expect(checkPurposeProposal(owner, co)).toEqual({ ok: true, problems: [] });
    expect(checkPurposeProposal('No accounting documents are posted.', co).ok).toBe(true);
    expect(checkPurposeProposal('It posts the allocation as a controlling document.', co).problems).toContain('claims a posting or a data change; the code changes no data');
    expect(checkPurposeProposal('It sends an e-mail to each cost center manager.', co).ok).toBe(false);
    expect(checkPurposeProposal('It compares cost centers with purchase orders from EKKO.', co).problems.length).toBeGreaterThan(0);
    expect(checkPurposeProposal('It saves 30 % of the closing effort.', co).problems).toContain('states money, savings or accuracy');
    const bm = programSummaryFactsOf(BM028);
    expect(checkPurposeProposal('A read-only report on stock.', bm).problems).toContain('says it does not post or change data; the code changes data');
  });

  test('the proposal comes from the Analyze narrative, without citations, or not at all', () => {
    const narrative = JSON.stringify({
      asIsContext: 'Simulates the allocation of shared-service costs to production cost centers [L40-43]. It does not post [L44]. It then lists the result.',
    });
    expect(purposeProposalOf(narrative, co)).toBe('Simulates the allocation of shared-service costs to production cost centers. It does not post.');
    expect(purposeProposalOf(JSON.stringify({ asIsContext: 'It posts allocation documents [L40].' }), co)).toBeNull();
    expect(purposeProposalOf('not json', co)).toBeNull();
    expect(purposeProposalOf(narrative, null)).toBeNull();
  });

  test('the Analyze prompt carries the facts and asks for the purpose from them', () => {
    const block = programFactsBlock(co);
    expect(block).toContain('PROGRAM FACTS');
    expect(block).toContain('[purpose] A read-only report on cost centers (CSKS) and cost totals (COSP, COSS)');
    expect(block).toContain('[fixed list in the code, L');
    expect(block).toContain('P_KOKRS: Controlling area');
    expect(programFactsBlock(null)).toBe('');
  });
});
