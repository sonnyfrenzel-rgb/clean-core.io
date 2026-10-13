import { test, expect } from '@playwright/test';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { processDocumentationToMarkdown } from '../lib/process-documentation';
import { businessStatementView } from '../lib/abap/business-statement-kind';

/**
 * CO review of the 3.0.10 delivery package, F01 (12.10.2026): the business
 * list of the process documentation folded rules that differ in condition and
 * effect into one entry, so a visible sentence carried the lines of another
 * rule — SECONDARY_LOCK with CONFLICTING_DRIVER, NEGATIVE_DRIVER with
 * BELOW_PLAN, the CSV export with the demo text lookup, PARTIAL_REVIEW with
 * UNPLANNED_COST, ZERO_PLAN_ZERO_COST with ON_PLAN. Owner's rule: a fold keeps
 * condition, action, entity, status and branch context unchanged, or it does
 * not fold. The five pairs are the test.
 *
 * The source below is a hand-written reduction of the CO case to the
 * branches the five pairs come from, same statements and same nesting, so the
 * deterministic engine writes the same sentences. Server-free: no page, no
 * model call.
 */
const CO_SOURCE = `REPORT zco_fold_pairs.
PARAMETERS: p_demo AS CHECKBOX DEFAULT 'X',
            p_csv  AS CHECKBOX.
CONSTANTS gc_x TYPE c VALUE 'X'.
TYPES: BEGIN OF ty_master,
         kostl TYPE kostl,
         bkzks TYPE c LENGTH 1,
       END OF ty_master,
       BEGIN OF ty_driver,
         quantity TYPE p LENGTH 15 DECIMALS 3,
       END OF ty_driver,
       BEGIN OF ty_out,
         kostl          TYPE kostl,
         ktext          TYPE c LENGTH 40,
         plan           TYPE p LENGTH 15 DECIMALS 2,
         simulated      TYPE p LENGTH 15 DECIMALS 2,
         variance       TYPE p LENGTH 15 DECIMALS 2,
         variance_state TYPE c LENGTH 24,
       END OF ty_out.
DATA: gv_blocked   TYPE i,
      gv_run_state TYPE c LENGTH 20,
      gs_out       TYPE ty_out.

START-OF-SELECTION.
  PERFORM simulate_all_periods.
  PERFORM build_output.
  IF p_csv = gc_x.
    PERFORM export_visible_csv.
  ENDIF.

FORM check_master USING is_master TYPE ty_master lv_matches TYPE i CHANGING cv_state TYPE char20.
  IF lv_matches = 1.
    cv_state = 'VALID'.
    IF is_master-bkzks = gc_x.
      cv_state = 'SECONDARY_LOCK'.
    ENDIF.
    RETURN.
  ENDIF.
ENDFORM.

FORM check_driver USING lv_count TYPE i lv_conflict TYPE c ls_first TYPE ty_driver CHANGING cv_code TYPE char20.
  IF lv_count = 0.
    cv_code = 'MISSING_DRIVER'.
  ELSEIF lv_conflict = gc_x.
    cv_code = 'CONFLICTING_DRIVER'.
  ELSEIF ls_first-quantity < 0.
    cv_code = 'NEGATIVE_DRIVER'.
  ENDIF.
ENDFORM.

FORM simulate_all_periods.
  IF gv_blocked > 0.
    gv_run_state = 'PARTIAL_REVIEW'.
  ENDIF.
ENDFORM.

FORM build_output.
  IF p_demo = gc_x.
    PERFORM demo_text USING gs_out-kostl CHANGING gs_out-ktext.
  ENDIF.
  PERFORM classify_variance CHANGING gs_out.
ENDFORM.

FORM classify_variance CHANGING cs_out TYPE ty_out.
  IF cs_out-plan = 0.
    IF cs_out-simulated = 0.
      cs_out-variance_state = 'ZERO_PLAN_ZERO_COST'.
    ELSEIF cs_out-simulated > 0.
      cs_out-variance_state = 'UNPLANNED_COST'.
    ELSE.
      cs_out-variance_state = 'UNPLANNED_CREDIT'.
    ENDIF.
    RETURN.
  ENDIF.
  IF cs_out-variance > 0.
    cs_out-variance_state = 'OVERSPEND_REVIEW'.
  ELSEIF cs_out-variance < 0.
    cs_out-variance_state = 'BELOW_PLAN'.
  ELSEIF cs_out-variance = 0.
    cs_out-variance_state = 'ON_PLAN'.
  ELSE.
    cs_out-variance_state = 'WITHIN_THRESHOLD'.
  ENDIF.
ENDFORM.

FORM demo_text USING iv_kostl TYPE kostl CHANGING cv_text TYPE c.
  cv_text = iv_kostl.
ENDFORM.

FORM export_visible_csv.
  WRITE / 'CSV'.
ENDFORM.
`;

const FILE = 'zco_fold_pairs.abap';

function documentationOf(source: string) {
  const bpmn = buildBpmnExportFromSource(source, { processName: FILE, sourceFileName: FILE });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), null), fileName: FILE });
  return buildProcessDocumentation({ source, map });
}

/** The five pairs of the review: what one entry says, and what must never be folded into it. */
const PAIRS: Array<[string, string]> = [
  ['SECONDARY_LOCK', 'CONFLICTING_DRIVER'],
  ['NEGATIVE_DRIVER', 'BELOW_PLAN'],
  ['export_visible_csv', 'demo_text'],
  ['PARTIAL_REVIEW', 'UNPLANNED_COST'],
  ['ZERO_PLAN_ZERO_COST', 'ON_PLAN'],
];

const lineOf = (source: string, needle: string) => source.split('\n').findIndex((l) => l.includes(needle)) + 1;

test.describe('the business list never folds rules that differ (CO review F01)', () => {
  test('the five pairs of the review are separate entries, each with only its own lines', () => {
    const doc = documentationOf(CO_SOURCE);
    const view = businessStatementView(doc.statements);
    for (const [one, other] of PAIRS) {
      const entryOf = (word: string) => view.groups.filter((g) => g.text.includes(word));
      const ones = entryOf(one);
      const others = entryOf(other);
      expect(ones.length, `an entry says ${one}`).toBeGreaterThan(0);
      expect(others.length, `an entry says ${other}`).toBeGreaterThan(0);
      for (const g of ones) {
        // Neither the sentence of the other rule nor its line stands in this entry.
        expect(g.text, `${one} and ${other} in one sentence`).not.toContain(other);
        expect(g.similar.join('\n'), `${other} folded into ${one}`).not.toContain(other);
        const otherLine = lineOf(CO_SOURCE, other === 'demo_text' ? 'PERFORM demo_text' : `'${other}'`);
        expect(g.anchors.some((a) => a.lineStart <= otherLine && otherLine <= a.lineEnd), `${one} carries L${otherLine} of ${other}`).toBe(false);
      }
      for (const g of others) expect(g.similar.join('\n'), `${one} folded into ${other}`).not.toContain(one);
    }
  });

  test('two "otherwise" branches of different decisions are never one entry', () => {
    const view = businessStatementView(documentationOf(CO_SOURCE).statements);
    const credit = view.groups.find((g) => g.text.includes('UNPLANNED_CREDIT'));
    expect(credit, 'an entry says UNPLANNED_CREDIT').toBeTruthy();
    expect(`${credit!.text}\n${credit!.similar.join('\n')}`).not.toContain('WITHIN_THRESHOLD');
  });

  test('the Markdown rules list prints each of the ten sentences with its own line, never "stands for" another rule', () => {
    const md = processDocumentationToMarkdown(documentationOf(CO_SOURCE));
    const rules = md.slice(md.indexOf('### Rules'), md.indexOf('## 3.'));
    for (const [one, other] of PAIRS) {
      for (const line of rules.split('\n').filter((l) => l.includes(one))) {
        expect(line, line).not.toContain(other);
        const otherLine = lineOf(CO_SOURCE, other === 'demo_text' ? 'PERFORM demo_text' : `'${other}'`);
        expect(line, line).not.toMatch(new RegExp(`\\bL${otherLine}\\b`));
      }
    }
  });

  test('a sentence identical in every word at another place is still another entry: entity and branch are not in its words', () => {
    const a = (l: number) => ({ lineStart: l, lineEnd: l });
    // The CO program appends to gt_cosp in the IF branch and to gt_coss in the ELSE branch; the engine says both alike.
    const same = 'If the field lv_index is 0, a row is added; otherwise a row is inserted or overwritten.';
    const view = businessStatementView([{ text: same, anchors: [a(1661)] }, { text: same, anchors: [a(1690)] }]);
    expect(view.groups.map((g) => g.anchors.map((x) => x.lineStart))).toEqual([[1661], [1690]]);
    expect(view.folded).toBe(0);
  });
});
