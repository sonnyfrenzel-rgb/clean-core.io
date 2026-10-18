import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildBusinessStatements } from '../lib/abap/business-statement';
import { enclosingBranches, negateCondition } from '../lib/abap/enclosing-branches';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { buildRequirementSet } from '../lib/functional-requirements';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessDocument } from '../lib/process-document-build';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { processDocumentationToMarkdown } from '../lib/process-documentation';

/**
 * Roadmap 3.0.18 item 13 (QM-06, FI-F11; QM and FI reviews of 18.10.2026): a
 * short business rule keeps the conditions of the branches it stands in. The
 * reviews found "If critical or no retest → FAIL" without the enclosing "first
 * test failed", and "if p_final → ELIGIBLE" without the reviewer quorum around
 * it. Read off the nesting the skeleton is built from (`enclosing-branches.ts`),
 * deterministically, with the line of every outer branch.
 */

const NESTED = `REPORT zqm_result.
PARAMETERS: p_final TYPE abap_bool.
DATA: lv_first TYPE c LENGTH 1, lv_score TYPE i, lv_retests TYPE i, lv_result TYPE c LENGTH 4,
      lv_reviewers TYPE i, lv_status TYPE c LENGTH 10.
START-OF-SELECTION.
  IF lv_first = 'F'.
    IF lv_score >= 80 OR lv_retests = 0.
      lv_result = 'FAIL'.
    ELSE.
      lv_result = 'RTST'.
    ENDIF.
  ELSE.
    lv_result = 'PASS'.
  ENDIF.
  IF lv_reviewers >= 2.
    IF p_final = abap_true.
      lv_status = 'ELIGIBLE'.
    ENDIF.
  ENDIF.
  WRITE lv_result.
`;

const ROOT = path.resolve(__dirname, '..');
const starter = (file: string) => fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', file), 'utf8').replace(/\r\n/g, '\n');
const lineOf = (source: string, needle: string) => source.split('\n').findIndex((l) => l.includes(needle)) + 1;

test.describe('a short rule keeps its parent condition (3.0.18 item 13, QM-06 / FI-F11)', () => {
  test('the outer branches are read off the nesting: IF, ELSEIF with what did not hold, ELSE, WHEN, and never across a routine', () => {
    const source = `REPORT z.
START-OF-SELECTION.
  IF a = 1.
    x = 1.
  ELSEIF b > 2.
    CASE c.
      WHEN 'A' OR 'B'.
        y = 1.
      WHEN OTHERS.
        y = 2.
    ENDCASE.
  ELSE.
    PERFORM f.
  ENDIF.
FORM f.
  IF d IS INITIAL.
    z = 1.
  ENDIF.
ENDFORM.
`;
    const facts = buildProcessFacts(source);
    const at = (needle: string) => facts.statements.findIndex((s) => s.text.startsWith(needle));
    expect(enclosingBranches(facts.statements, facts.structure, at('x = 1')).map((b) => [b.kind, b.condition])).toEqual([['if', 'a = 1']]);
    const inWhen = enclosingBranches(facts.statements, facts.structure, at('y = 1'));
    expect(inWhen.map((b) => [b.kind, b.condition, b.earlier])).toEqual([['elseif', 'b > 2', ['a = 1']], ['when', "'A' OR 'B'", []]]);
    expect(inWhen[1].selector).toBe('c');
    const inOthers = enclosingBranches(facts.statements, facts.structure, at('y = 2'));
    expect(inOthers[1]).toMatchObject({ kind: 'when-others', earlier: ["'A' OR 'B'"] });
    expect(enclosingBranches(facts.statements, facts.structure, at('PERFORM f')).map((b) => [b.kind, b.earlier])).toEqual([['else', ['a = 1', 'b > 2']]]);
    // A FORM is entered from its call: the branch around the PERFORM is not the rule's.
    expect(enclosingBranches(facts.statements, facts.structure, at('z = 1')).map((b) => b.condition)).toEqual(['d IS INITIAL']);
    // A branch head never counts its own IF or CASE as a parent.
    expect(enclosingBranches(facts.statements, facts.structure, at('ELSEIF b > 2'))).toEqual([]);
    expect(enclosingBranches(facts.statements, facts.structure, at("WHEN 'A'")).map((b) => b.kind)).toEqual(['elseif']);
  });

  test('a condition is negated only where its opposite is one condition', () => {
    expect(negateCondition("lv_first = 'F'")).toBe("lv_first <> 'F'");
    expect(negateCondition('lv_score >= 80')).toBe('lv_score < 80');
    expect(negateCondition('x IS INITIAL')).toBe('x IS NOT INITIAL');
    expect(negateCondition('x IS NOT BOUND')).toBe('x IS BOUND');
    expect(negateCondition('s NOT IN so_s')).toBe('s IN so_s');
    expect(negateCondition('a = 1 OR b = 2')).toBeNull();
    expect(negateCondition('NOT a = 1')).toBeNull();
  });

  test('the business statements of a nested IF say the outer condition, with its line', () => {
    const texts = buildBusinessStatements(NESTED).map((s) => s.text);
    const fail = texts.find((t) => /FAIL/.test(t) && /RTST/.test(t));
    expect(fail).toBe(
      'Only when the field lv_first is F (L6): if the field lv_score is at least 80 or the field lv_retests is 0, the result is set to FAIL; otherwise the result is set to RTST.',
    );
    const eligible = texts.filter((t) => /ELIGIBLE/.test(t));
    expect(eligible.length).toBeGreaterThan(0);
    for (const t of eligible) expect(t).toMatch(/^Only when the field lv_reviewers is at least 2 \(L15\): if the field p_final is set, /);
    // The outer ELSE names what did not hold instead of a bare "Otherwise".
    const pass = texts.filter((t) => /PASS/.test(t));
    expect(pass.length).toBeGreaterThan(0);
    for (const t of pass) expect(t).toBe('If the field lv_first is not F, the result is set to PASS.');
    // No sentence about the inner rules stands without the outer condition.
    for (const t of texts.filter((x) => /FAIL|RTST|ELIGIBLE/.test(x))) expect(t).toMatch(/^Only when /);
  });

  test('the process documentation lists the inner rule under its outer condition', () => {
    const file = 'zqm_result.abap';
    const { bpmn, technical } = buildReadingExports(NESTED, { processName: file, sourceFileName: file });
    const map = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(NESTED), null, 'no-key'), fileName: file });
    const md = processDocumentationToMarkdown(buildProcessDocumentation({ source: NESTED, map }));
    const rules = md.slice(md.indexOf('### Rules as the code states them'), md.indexOf('<a id="exceptions"></a>'));
    expect(rules).toContain('Only when the field lv_first is F (L6): if the field lv_score is at least 80');
    expect(rules).toContain('Only when the field lv_reviewers is at least 2 (L15): if the field p_final is set');
    expect(rules).not.toMatch(/^- If the field lv_score/m);

    // The functional requirement and the process document's rule rows carry it too.
    const fr = buildRequirementSet({ source: NESTED });
    const inner = fr.requirements.find((r) => r.basis.kind === 'rule' && /lv_score >= 80/.test(r.rationale));
    expect(inner?.statement).toMatch(/\(only inside the branch where .+, L6\)/);
    const outer = fr.requirements.find((r) => r.basis.kind === 'rule' && /lv_first = 'F'/.test(r.rationale));
    expect(outer?.statement).not.toMatch(/only inside the branch/);
    const pd = buildProcessDocument({ source: NESTED, map });
    const row = pd.rules.find((r) => /\(only inside the branch where .+, L6\)/.test(r.condition));
    expect(row, 'the rule row of the process document names the outer branch').toBeTruthy();
  });

  test('starter examples: a rule inside a branch says the branch, an ELSE says what did not hold', () => {
    const mm = starter('Z_MM_PO_APPROVAL.abap');
    const hit = lineOf(mm, 'WHERE frggr = c_release_group.') + 1;
    const limit = buildBusinessStatements(mm).map((s) => s.text).filter((t) => /Amount above the release limit/.test(t));
    expect(limit.length).toBeGreaterThan(0);
    for (const t of limit) expect(t).toMatch(new RegExp(`^Only when there is a hit \\(L${hit}\\): if the field lv_ok is not set, `));

    const sd = starter('Z_SD_FREIGHT_RATE_CHECK.abap');
    // The IF … ELSE sentence says both outcomes; the ELSE's own sentence says what did not hold.
    const std = buildBusinessStatements(sd).map((s) => s.text).filter((t) => /service is set to STD/.test(t) && !/EXP/.test(t));
    expect(std.length).toBeGreaterThan(0);
    for (const t of std) expect(t).toMatch(/^If the field is_delivery-vsbed is not c_express_cond, /);
  });
});
