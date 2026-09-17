import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  deriveBusinessRules,
  rulesForElement,
  type BusinessRule,
  type BusinessRuleSet,
  type NoProcessElementReason,
} from '../lib/abap/business-rule-set';
import { readBusinessRules } from '../lib/abap/business-rules';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';

/**
 * Business rules `BR-nnn` — roadmap 3.4.
 *
 * 2.8 reads 140 rule candidates out of the eight programs this product ships;
 * this spec pins what they become as rules: how many, of which type, tied to
 * which element of the process skeleton, and — for the ones tied to none — why.
 * Every number is measured on the shipped programs, not on snippets written to
 * suit the reader. The snippets below are there only for the constructs no
 * shipped program contains (an error message in a branch, `CHECK` in a loop,
 * copies that differ in a threshold).
 *
 * **Not vacuous.** On 2026-09-18 seventeen changes were made to
 * `lib/abap/business-rule-set.ts`, one at a time, each restored before the next;
 * the number is how many tests of this spec went red:
 *
 *   - no join at all, every candidate its own rule — 12, the DE/AT/CH list among them;
 *   - value-list join dropped — 8 (the CASE, the IF/ELSEIF chains, the numbering);
 *   - constant join dropped — 4 (the constant with its readers, the fourteen copies);
 *   - digits normalised everywhere, not only inside names — 1 (thresholds 100 and 200);
 *   - `RETURN` not ending the flow — 4 (the price tolerance, the plain ELSE);
 *   - the anchor guard removed and one sentence written without a range — 3;
 *   - the gateway looked up by routine instead of by its branch — 2;
 *   - loops ignored — 2 (`CHECK` and `EXIT` inside a loop);
 *   - error messages ignored — 2; every `MESSAGE` ending the flow — 1;
 *   - a `RETURN` in a nested IF counted — 1; `CHECK` never a control — 1;
 *   - `PERFORM reject` counted as ending because of its name — 3;
 *   - " EUR" appended to the amount sentence — 3; the unnamed-field sentence dropped — 1;
 *   - the class of a method dropped — 1; numbers taken from line numbers — 8.
 *
 * Not red under any of them, and not meant to be: the check that the table
 * names every shipped program, and the three rows with no candidate at all —
 * those guard 2.8 and the table, not this file.
 */

const EXAMPLES = join(process.cwd(), 'public/starter-examples');
const FILES = readdirSync(EXAMPLES).sort();
const read = (name: string) => readFileSync(join(EXAMPLES, name), 'utf8');

const LEGACY = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const PO = 'Z_MM_PO_APPROVAL.abap';

/** The rule that holds the 2.8 candidate standing at this line. */
function ruleAt(set: BusinessRuleSet, line: number, subject?: string): BusinessRule | undefined {
  return set.rules.find((r) => r.parameters.some(
    (p) => p.lineStart === line && (subject === undefined || p.subject === subject),
  ));
}

/** A one-FORM program, performed from START-OF-SELECTION. The body starts at line 6. */
function program(body: string): string {
  return `REPORT ztest.\nSTART-OF-SELECTION.\n  PERFORM check_it.\n\nFORM check_it.\n${body}\nENDFORM.\n`;
}

/* ================================================================== *
 * The eight programs this product ships
 * ================================================================== */

type Pinned = [
  file: string,
  candidates: number,
  rules: number,
  byType: { rule: number; control: number },
  withProcessElement: number,
  without: Partial<Record<NoProcessElementReason, number>>,
];

const PINNED: Pinned[] = [
  // 121 candidates: 98 of them sit in fourteen copied FORMs, and a constant with
  // its readers, a value list and a repeated test are one rule each.
  [LEGACY, 121, 16, { rule: 16, control: 0 }, 10, { 'declaration-only': 1, unreached: 4, 'technical-helper': 1 }],
  ['Z_BUSINESS_PARTNER_SYNC.txt', 0, 0, { rule: 0, control: 0 }, 0, {}],
  ['Z_EMPLOYEE_EXPENSE_VAL.txt', 1, 1, { rule: 1, control: 0 }, 1, {}],
  ['Z_INVOICE_EXTRACTOR.txt', 0, 0, { rule: 0, control: 0 }, 0, {}],
  ['Z_MATERIAL_STOCK_CALC.txt', 3, 1, { rule: 1, control: 0 }, 1, {}],
  [PO, 14, 11, { rule: 10, control: 1 }, 6, { 'declaration-only': 3, unreached: 2 }],
  ['Z_ORDER_INTEGRITY_CHECK.txt', 1, 1, { rule: 1, control: 0 }, 0, { 'not-in-skeleton': 1 }],
  ['Z_SALES_ORDER_CREATOR.txt', 0, 0, { rule: 0, control: 0 }, 0, {}],
];

test.describe('the eight programs this product ships', () => {
  test('the pinned table covers every shipped program', () => {
    expect(PINNED.map(([file]) => file).sort()).toEqual(FILES);
  });

  for (const [file, candidates, rules, byType, withElement, without] of PINNED) {
    test(`${file} — ${candidates} candidates become ${rules} rules`, () => {
      const set = deriveBusinessRules(read(file));
      expect(readBusinessRules(read(file)).candidates, '2.8 moved underneath').toHaveLength(candidates);
      expect(set.counts.candidates).toBe(candidates);
      expect(set.counts.rules).toBe(rules);
      expect(set.rules).toHaveLength(rules);
      expect(set.counts.byType).toEqual(byType);
      expect(set.counts.withProcessElement).toBe(withElement);
      expect(set.counts.withoutProcessElement).toEqual({
        'declaration-only': 0, unreached: 0, 'technical-helper': 0, 'not-in-skeleton': 0, ...without,
      });
      // Every candidate lands in exactly one rule — none dropped, none twice.
      const ids = set.rules.flatMap((r) => r.parameters.map((p) => p.candidateId)).sort();
      expect(ids).toEqual(readBusinessRules(read(file)).candidates.map((c) => c.id).sort());
      expect(set.rules.map((r) => r.id)).toEqual(
        set.rules.map((_, i) => `BR-${String(i + 1).padStart(3, '0')}`),
      );
    });
  }

  test('all eight together: 140 candidates, 30 rules, one control', () => {
    const sets = FILES.map((file) => deriveBusinessRules(read(file)));
    const sum = (pick: (s: BusinessRuleSet) => number) => sets.reduce((n, s) => n + pick(s), 0);
    expect(sum((s) => s.counts.candidates)).toBe(140);
    expect(sum((s) => s.counts.rules)).toBe(30);
    expect(sum((s) => s.counts.byType.control)).toBe(1);
    expect(sum((s) => s.counts.withProcessElement)).toBe(18);
  });

  test('every sentence has an anchor, and every anchor quotes its lines verbatim', () => {
    for (const file of FILES) {
      const source = read(file);
      const lines = source.split(/\r?\n/);
      for (const rule of deriveBusinessRules(source).rules) {
        expect(rule.sentences.length, `${file} ${rule.id} has no text`).toBeGreaterThan(0);
        expect(rule.text).toBe(rule.sentences.map((s) => s.text).join(' '));
        const anchors = [...rule.sentences.flatMap((s) => s.anchors), ...rule.typeBasis.flatMap((b) => b.anchors)];
        for (const sentence of rule.sentences) {
          expect(sentence.anchors.length, `${file} ${rule.id}: "${sentence.text}" has no anchor`).toBeGreaterThan(0);
          expect(sentence.text).toBe(sentence.parts.map((p) => p.value).join(''));
        }
        for (const anchor of anchors) {
          expect(anchor.lineStart).toBeGreaterThan(0);
          expect(anchor.lineEnd).toBeGreaterThanOrEqual(anchor.lineStart);
          expect(anchor.lineEnd).toBeLessThanOrEqual(lines.length);
          expect(anchor.quote, `${file} ${rule.id} L${anchor.lineStart}`).toBe(
            lines.slice(anchor.lineStart - 1, anchor.lineEnd).map((l) => l.trim()).join('\n'),
          );
          expect(anchor.quote.length, `${file} ${rule.id} quotes an empty line`).toBeGreaterThan(0);
        }
        // Set exactly when there is no element, never both, never neither.
        expect(Boolean(rule.withoutProcessElement)).toBe(rule.processElements.length === 0);
      }
    }
  });

  test('nothing is invented: code is a token of the source, and no text names a currency', () => {
    for (const file of FILES) {
      const flat = read(file).replace(/\s+/g, ' ').toLowerCase();
      for (const rule of deriveBusinessRules(read(file)).rules) {
        for (const part of rule.sentences.flatMap((s) => s.parts)) {
          if (part.kind === 'code') {
            expect(flat, `${file} ${rule.id}: "${part.value}" is not in the source`).toContain(part.value.toLowerCase());
          } else {
            expect(part.value, `${file} ${rule.id} names a currency`).not.toMatch(/\b(EUR|USD|GBP|CHF)\b|€|\$/);
          }
        }
        expect(rule.property).toBe('hard-coded');
        for (const source of rule.sources) expect(source.include).toBeNull();
      }
    }
  });

  test('the same source gives the same numbers; a blank line moves anchors, not numbers', () => {
    const lf = read(LEGACY).replace(/\r\n/g, '\n');
    const once = deriveBusinessRules(lf);
    expect(deriveBusinessRules(lf)).toEqual(once);
    expect(deriveBusinessRules(lf.replace(/\n/g, '\r\n')), 'line endings are not content').toEqual(once);

    const shifted = deriveBusinessRules(`\n${lf}`);
    expect(shifted.rules.map((r) => `${r.id} ${r.label}`)).toEqual(once.rules.map((r) => `${r.id} ${r.label}`));
    expect(shifted.rules.map((r) => r.sentences[0].anchors[0].lineStart))
      .toEqual(once.rules.map((r) => r.sentences[0].anchors[0].lineStart + 1));
  });
});

/* ================================================================== *
 * The rule the step is measured by
 * ================================================================== */

test.describe('the price tolerance agreed with purchasing', () => {
  test(`${PO}:412 — lv_dev_pct > 5 is BR-009, a control, on the gateway of its IF`, () => {
    const set = deriveBusinessRules(read(PO));
    const rule = ruleAt(set, 412);

    expect(rule?.id).toBe('BR-009');
    expect(rule?.label).toBe('lv_dev_pct > 5');
    expect(rule?.parameters.map((p) => `${p.subject} ${p.operator} ${p.literal} ${p.ruleClass}`))
      .toEqual(['lv_dev_pct > 5 toleranz']);
    expect(rule?.sources).toEqual([{
      program: 'Z_MM_PO_APPROVAL', include: null, routine: 'CHECK_PRICE', routineKind: 'form', className: null,
    }]);

    // A control, and the reason is a line: the branch ends the routine.
    expect(rule?.type).toBe('control');
    expect(rule?.typeBasis).toEqual([
      { basis: 'ends-flow', anchors: [{ lineStart: 414, lineEnd: 414, quote: 'RETURN.' }] },
    ]);

    expect(rule?.sentences.map((s) => [s.key, s.text, s.anchors.map((a) => a.quote)])).toEqual([
      ['condition-if', 'In CHECK_PRICE, the code tests lv_dev_pct > 5.', ['IF lv_dev_pct > 5.']],
      ['branch-body', 'If it holds, the code of this branch runs.', ['PERFORM hold_for_buyer.\nRETURN.']],
      ['ends-flow', 'If the test holds, the code leaves CHECK_PRICE here.', ['RETURN.']],
    ]);

    // The gateway the skeleton draws from the same IF — the one 2.1 numbers
    // BR-031. That number is a *branch* number and collides with the rule
    // numbers of DESIGN.md §3; the rule links by node id so the two never meet.
    const skeleton = buildProcessSkeleton(read(PO));
    const gateway = skeleton.nodes.find((n) => n.kind === 'gateway' && n.detail?.branchId === 'BR-031');
    expect(gateway?.anchor?.lineStart).toBe(412);
    expect(rule?.processElements.map((e) => `${e.nodeId} ${e.kind} ${e.relation} ${e.label}`)).toEqual([
      `${gateway?.id} gateway condition IF lv_dev_pct > 5`,
      'nd-263-0 write branch HOLD_FOR_BUYER',
    ]);
    expect(gateway?.id).toBe('nd-262-0');
    expect(rulesForElement(set, 'nd-262-0').map((r) => r.id)).toEqual(['BR-009']);
  });
});

/* ================================================================== *
 * One rule, several places
 * ================================================================== */

test.describe('candidates that are one rule become one rule', () => {
  test(`${LEGACY}:307 — three countries are one rule, not three`, () => {
    const set = deriveBusinessRules(read(LEGACY));
    const rules = set.rules.filter((r) => r.parameters.some((p) => p.lineStart === 307));

    expect(rules).toHaveLength(1);
    const [countries] = rules;
    expect(countries.parameters.map((p) => p.values[0])).toEqual(['DE', 'AT', 'CH']);
    expect(countries.classes).toEqual(['ausnahmeliste']);
    expect(countries.sentences[0].anchors.map((a) => a.quote)).toEqual([
      "ELSEIF cs_customer-land1 <> 'DE' AND cs_customer-land1 <> 'AT' AND cs_customer-land1 <> 'CH'.",
    ]);
    expect(countries.processElements.map((e) => `${e.kind} ${e.relation} L${e.lineStart}`))
      .toEqual(['gateway condition L304']);
    expect(countries.sources.map((s) => s.routine)).toEqual(['DERIVE_CUSTOMER_RISK']);
  });

  test('a CASE with three values is one rule with the selector and each WHEN anchored', () => {
    const [rule] = deriveBusinessRules(read('Z_MATERIAL_STOCK_CALC.txt')).rules;
    expect(rule.label).toBe("CASE gs_stock-mtart: 'ROH', 'HALB', 'FERT'");
    expect(rule.sentences[0].text)
      .toBe("In CALCULATE_VALUATIONS, CASE gs_stock-mtart has a branch of its own for 'ROH', 'HALB' and 'FERT'.");
    expect(rule.sentences[0].anchors.map((a) => a.lineStart)).toEqual([57, 58, 60, 62]);
  });

  test('a constant and the two conditions that read it are one rule — two thresholds stay two', () => {
    const set = deriveBusinessRules(read(LEGACY));
    const critical = ruleAt(set, 22);
    expect(critical?.parameters.map((p) => p.lineStart)).toEqual([22, 388, 424]);
    expect(critical?.sentences.map((s) => s.key)).toEqual(['declaration', 'condition-if', 'branch-body', 'repeated']);
    expect(critical?.sentences[0].text).toBe('c_critical_score is declared as a constant of type i with the value 80.');
    expect(critical?.sentences[3].text).toBe('The same test stands in 2 places, in CALCULATE_RISK_SCORES and DECIDE_ACTIONS.');
    expect(critical?.processElements.map((e) => `${e.kind} L${e.lineStart}`)).toEqual(['gateway L388', 'gateway L424']);

    const medium = ruleAt(set, 23);
    expect(medium?.id, 'GE c_medium_score is a second number somebody decided').not.toBe(critical?.id);
    expect(medium?.parameters.map((p) => p.lineStart)).toEqual([23, 390, 427]);
  });

  test('fourteen copied routines state four rules, not ninety-eight', () => {
    const set = deriveBusinessRules(read(LEGACY));
    const inCopies = set.rules.filter((r) => r.parameters.some((p) => p.lineStart >= 691 && p.lineStart <= 990));
    expect(inCopies.map((r) => `${r.label} ${r.parameters.length}`)).toEqual([
      "is_order-auart = 'ZOR' AND is_order-vkorg = c_default_vkorg 29",
      "lv_amount GT 100000 AND is_order-waerk <> 'EUR' 28",
      "is_order-bstnk CP 'TEST*' OR is_order-bstnk CP 'DUMMY*' 28",
      "sy-subrc = 0 AND lv_ernam_001 = 'DDIC' 14",
    ]);

    // `lv_ernam_001` … `lv_ernam_014`: renumbered with the routine, one rule.
    const renamed = inCopies[3];
    const copies = renamed.sentences.find((s) => s.key === 'repeated-copies');
    expect(copies?.anchors).toHaveLength(14);
    expect(copies?.text).toMatch(/^The same test, with renamed variables, stands in 14 places, in routines the process skeleton reads as copies of one another: LEGACY_BUSINESS_RULE_001, /);
    expect(renamed.withoutProcessElement?.reason).toBe('unreached');

    // The amount keeps its caveat once, anchored at all fourteen places.
    const amount = inCopies[1].sentences.find((s) => s.key === 'currency-not-stated');
    expect(amount?.text).toBe('The code does not state the currency of the amount 100000.');
    expect(amount?.anchors).toHaveLength(14);
  });

  test('a copy with another threshold is another rule', () => {
    const copies = (second: number) => [
      'REPORT ztest.', 'START-OF-SELECTION.', '  PERFORM rule_001.', '  PERFORM rule_002.', '',
      'FORM rule_001.', '  IF lv_x_001 GT 100.', "    gs_out-flag_001 = 'A'.", '  ENDIF.', 'ENDFORM.', '',
      'FORM rule_002.', `  IF lv_x_002 GT ${second}.`, "    gs_out-flag_002 = 'A'.", '  ENDIF.', 'ENDFORM.',
    ].join('\n');

    // The skeleton reads the two routines as copies either way — digits are its
    // wildcard — so what is tested is what this step does with that.
    for (const second of [100, 200]) {
      expect(buildProcessSkeleton(copies(second)).notDrawn.clones.map((c) => c.names))
        .toEqual([['RULE_001', 'RULE_002']]);
    }

    const same = deriveBusinessRules(copies(100));
    expect(same.rules.map((r) => r.label)).toEqual(['lv_x_001 GT 100']);
    expect(same.rules[0].sentences.find((s) => s.key === 'repeated-copies')?.text).toBe(
      'The same test, with renamed variables, stands in 2 places, in routines the process skeleton reads as copies of one another: RULE_001 and RULE_002.',
    );

    const different = deriveBusinessRules(copies(200));
    expect(different.rules.map((r) => r.label)).toEqual(['lv_x_001 GT 100', 'lv_x_002 GT 200']);
  });
});

/* ================================================================== *
 * Rule or control
 * ================================================================== */

test.describe('rule or control is read off the code, not off a name', () => {
  const CASES: Array<[string, string, 'rule' | 'control', string, number]> = [
    ['an error message in the branch', "  IF gs_x-werks = '1000'.\n    MESSAGE e001(zz).\n  ENDIF.", 'control', 'ends-flow', 7],
    ['a status message in the branch', "  IF gs_x-werks = '1000'.\n    MESSAGE s001(zz).\n  ENDIF.", 'rule', 'flow-continues', 6],
    ['RETURN in the ELSE of a plain IF', "  IF gs_x-werks = '1000'.\n    gv_ok = abap_true.\n  ELSE.\n    RETURN.\n  ENDIF.", 'control', 'else-ends-flow', 9],
    ['RETURN only in a nested IF', "  IF gs_x-werks = '1000'.\n    IF gs_x-lgort IS INITIAL.\n      RETURN.\n    ENDIF.\n  ENDIF.", 'rule', 'flow-continues', 6],
    ['CHECK outside a loop', "  CHECK gs_x-werks = '1000'.\n  gv_ok = abap_true.", 'control', 'check-leaves', 6],
    ['CHECK inside a loop', "  LOOP AT gt_x INTO gs_x.\n    CHECK gs_x-werks = '1000'.\n  ENDLOOP.", 'rule', 'skips-iteration', 7],
    ['EXIT inside a loop leaves the loop, not the flow', "  LOOP AT gt_x INTO gs_x.\n    IF gs_x-werks = '1000'.\n      EXIT.\n    ENDIF.\n  ENDLOOP.", 'rule', 'flow-continues', 7],
    ['a routine called reject that ends nothing', "  IF gs_x-werks = '1000'.\n    PERFORM reject.\n  ENDIF.", 'rule', 'flow-continues', 6],
  ];

  for (const [name, body, type, basis, line] of CASES) {
    test(`${name} → ${type}`, () => {
      const set = deriveBusinessRules(program(body));
      expect(set.rules).toHaveLength(1);
      const [rule] = set.rules;
      expect(rule.type).toBe(type);
      expect(rule.typeBasis.map((b) => b.basis)).toEqual([basis]);
      expect(rule.typeBasis[0].anchors[0].lineStart, 'the basis points at the statement that decides').toBe(line);
    });
  }

  test('an ending branch says so in a sentence anchored at the ending statement', () => {
    const [rule] = deriveBusinessRules(program("  IF gs_x-menge > 500.\n    MESSAGE e001(zz).\n  ENDIF.")).rules;
    expect(rule.sentences.map((s) => [s.key, s.text, s.anchors[0].quote])).toEqual([
      ['condition-if', 'In CHECK_IT, the code tests gs_x-menge > 500.', 'IF gs_x-menge > 500.'],
      ['branch-body', 'If it holds, the code of this branch runs.', 'MESSAGE e001(zz).'],
      ['ends-flow', 'If the test holds, the code sends an error message here.', 'MESSAGE e001(zz).'],
      ['unit-not-stated', 'The code does not state the unit of the quantity 500.', 'IF gs_x-menge > 500.'],
    ]);
  });
});

/* ================================================================== *
 * What the code does not say
 * ================================================================== */

test.describe('what the code does not say stays unsaid', () => {
  test(`${PO}:422 — the amount keeps no currency, although the program converts to EUR`, () => {
    const rule = ruleAt(deriveBusinessRules(read(PO)), 422);
    expect(rule?.label).toBe("gv_emergency = abap_true AND gv_amount <= '50000.00'");
    expect(rule?.parameters.map((p) => p.caveat)).toEqual(['Betrag, Währung nicht aus dem Code ableitbar']);
    const caveat = rule?.sentences.find((s) => s.key === 'currency-not-stated');
    expect(caveat?.text).toBe("The code does not state the currency of the amount '50000.00'.");
    expect(caveat?.anchors.map((a) => a.lineStart)).toEqual([422]);
  });

  test('a value compared with an expression says the field is not named', () => {
    const [rule] = deriveBusinessRules(program('  IF lo_order->amount( ) > 2500.\n    gv_ok = abap_true.\n  ENDIF.')).rules;
    expect(rule.parameters[0].subject).toBeNull();
    const sentence = rule.sentences.find((s) => s.key === 'subject-not-named');
    expect(sentence?.text).toBe('The code compares 2500 with an expression, not with a named field.');
    expect(sentence?.anchors[0].lineStart).toBe(6);
  });
});

/* ================================================================== *
 * Rules without a process element
 * ================================================================== */

test.describe('a rule tied to no process element says why', () => {
  test(`${PO}: three constants nobody tests, two routines nobody reaches`, () => {
    const set = deriveBusinessRules(read(PO));
    const without = set.rules
      .filter((r) => r.withoutProcessElement)
      .map((r) => `${r.id} ${r.withoutProcessElement?.reason} ${r.label}`);
    expect(without).toEqual([
      "BR-001 declaration-only c_doc_type VALUE 'NB'",
      "BR-002 declaration-only c_release_group VALUE 'ZE'",
      "BR-003 declaration-only c_purch_org VALUE '1000'",
      "BR-007 unreached CASE gs_eban-knttp: 'K', 'F'",
      "BR-008 unreached lv_mmsta = '01' OR lv_mmsta = 'Z9'",
    ]);
    expect(ruleAt(set, 314)?.withoutProcessElement?.detail)
      .toBe('CHECK_MATERIAL_STATUS is not reached from any event block in this source, so the process skeleton does not draw it.');
  });

  test(`${LEGACY}:638 — a log level in a technical helper`, () => {
    const rule = ruleAt(deriveBusinessRules(read(LEGACY)), 638);
    expect(rule?.withoutProcessElement?.reason).toBe('technical-helper');
    expect(rule?.parameters.map((p) => p.values[0])).toEqual(['WARN', 'ERROR']);
  });

  test('Z_ORDER_INTEGRITY_CHECK.txt:48 — a method, which the skeleton does not draw', () => {
    const [rule] = deriveBusinessRules(read('Z_ORDER_INTEGRITY_CHECK.txt')).rules;
    expect(rule.withoutProcessElement?.reason).toBe('not-in-skeleton');
    expect(rule.sources).toEqual([{
      program: 'Z_ORDER_INTEGRITY_CHECK',
      include: null,
      routine: 'CALCULATE_TAX',
      routineKind: 'method',
      className: 'LCL_CREDIT_NOTE_DOCUMENT',
    }]);
  });
});
