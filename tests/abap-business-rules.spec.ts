import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readBusinessRules, type RuleCandidate } from '../lib/abap/business-rules';

/**
 * The numbers nobody wrote down — roadmap 2.8.
 *
 * `IF lv_dev_pct > 5.` stands in `Z_MM_PO_APPROVAL.abap` at line 412, under the
 * comment "Tolerance agreed with purchasing". Whoever agreed it has left; the
 * agreement is a `5` in a program. Everything here is measured against the eight
 * programs this product ships, not against snippets written to suit the reader,
 * and every count is pinned: an example that changes changes them, and that is a
 * decision somebody takes on purpose rather than a number that drifts.
 *
 * **Not vacuous.** Rolled back by hand on 2026-09-17, one change at a time, to
 * see the assertions bite:
 *
 *   1. dropping the `null-vergleich` rejection in `business-rules.ts` let
 *      `p_days LT 0` and `ls_eine-peinh > 0` through as rules — 5 tests red
 *      (the pinned counts of both large examples, the QA24-A10 count, the
 *      repeat chain of the copied FORMs, and the rejection reasons);
 *   2. letting `stripInlineComment` ignore `|…|` again — the state before this
 *      step — cut `IF lv_text = |He said "yes"|.` at the quote: 1 test red;
 *   3. classifying a field reference by every part of its name instead of its
 *      last segment made `cs_customer-land1` a master-data key, because the
 *      structure is called `customer`: 2 tests red, including the three-country
 *      exception list.
 *
 * All three were restored and the suite is green again.
 */

const EXAMPLES = join(process.cwd(), 'public/starter-examples');
const read = (name: string) => readFileSync(join(EXAMPLES, name), 'utf8');

const LEGACY = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const PO = 'Z_MM_PO_APPROVAL.abap';

/** Character offset of the first character of a 1-based line. */
function offsetOfLine(source: string, line: number): number {
  return source.split(/\r?\n/).slice(0, line - 1).join('\n').length + 1;
}

function classCount(candidates: RuleCandidate[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const candidate of candidates) {
    out[candidate.ruleClass] = (out[candidate.ruleClass] ?? 0) + 1;
  }
  return out;
}

test.describe('the eight programs this product ships', () => {
  // Pinned: how many rule candidates each example holds, and of which class.
  const PINNED: Array<[string, number, Record<string, number>]> = [
    [LEGACY, 121, {
      organisationseinheit: 16,
      toleranz: 22,
      ausnahmeliste: 37,
      'stammdatenschlüssel': 1,
      datumsgrenze: 2,
      sonstiges: 43,
    }],
    [PO, 14, {
      sonstiges: 6,
      organisationseinheit: 2,
      ausnahmeliste: 4,
      toleranz: 2,
    }],
    ['Z_BUSINESS_PARTNER_SYNC.txt', 0, {}],
    ['Z_EMPLOYEE_EXPENSE_VAL.txt', 1, { sonstiges: 1 }],
    ['Z_INVOICE_EXTRACTOR.txt', 0, {}],
    ['Z_MATERIAL_STOCK_CALC.txt', 3, { 'stammdatenschlüssel': 3 }],
    ['Z_ORDER_INTEGRITY_CHECK.txt', 1, { toleranz: 1 }],
    ['Z_SALES_ORDER_CREATOR.txt', 0, {}],
  ];

  for (const [file, total, classes] of PINNED) {
    test(`${file} — ${total} rule candidates`, () => {
      const report = readBusinessRules(read(file));
      expect(report.candidates).toHaveLength(total);
      expect(classCount(report.candidates)).toEqual(classes);
    });
  }

  test('a file with no candidate has none because its literals were weighed and dropped', () => {
    // Three of the eight state no rule in a condition. That is an answer, not a
    // silence: the reader saw literals in all three and says why it dropped
    // them. A zero that means "found nothing to look at" would be worthless.
    const sync = readBusinessRules(read('Z_BUSINESS_PARTNER_SYNC.txt'));
    expect(sync.candidates).toEqual([]);
    expect(sync.rejected.map((r) => r.reason)).toEqual(['systemfeld']);

    const invoice = readBusinessRules(read('Z_INVOICE_EXTRACTOR.txt'));
    expect(invoice.candidates).toEqual([]);
    expect(invoice.rejected.map((r) => r.reason)).toEqual(['systemfeld', 'systemfeld']);

    const creator = readBusinessRules(read('Z_SALES_ORDER_CREATOR.txt'));
    expect(creator.candidates).toEqual([]);
    expect(creator.rejected.map((r) => r.text)).toEqual(['gv_err_count = 0']);
  });

  test('a limit that comes from the selection screen is not a rule in the code', () => {
    // Z_EMPLOYEE_EXPENSE_VAL.txt:93 is `IF lv_total > p_limit.` — the limit is
    // typed in by whoever runs the report. Reporting it as a hard-coded rule
    // would be the most expensive kind of false positive: it sends somebody
    // looking for a number that is not there.
    const report = readBusinessRules(read('Z_EMPLOYEE_EXPENSE_VAL.txt'));
    expect(report.candidates.map((c) => c.lineStart)).toEqual([74]);
  });

  test('every candidate is anchored, and the offset points at the value', () => {
    for (const file of PINNED.map(([name]) => name)) {
      const source = read(file);
      const lineCount = source.split(/\r?\n/).length;
      for (const candidate of readBusinessRules(source).candidates) {
        const where = `${file} ${candidate.id}`;
        expect(candidate.lineStart, `${where} has no line`).toBeGreaterThan(0);
        expect(candidate.lineEnd, `${where} ends before it starts`)
          .toBeGreaterThanOrEqual(candidate.lineStart);
        expect(candidate.lineEnd, `${where} points past the file`)
          .toBeLessThanOrEqual(lineCount);

        // The line alone is not an anchor when a condition states three rules.
        // The offset has to land on the token the value came from: the literal,
        // or the constant's name where the value arrived through one.
        const token = candidate.viaConstant
          ? candidate.viaConstant.name
          : candidate.literal.split(/,\s*| AND /)[0];
        expect(
          candidate.conditionText.slice(candidate.valueOffset),
          `${where}: offset ${candidate.valueOffset} does not point at ${token}`,
        ).toContain(token);
        expect(candidate.conditionText.indexOf(token), `${where}: token not in the text`)
          .toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('nothing is invented: no subject without a field, no value without a literal', () => {
    for (const file of PINNED.map(([name]) => name)) {
      for (const candidate of readBusinessRules(read(file)).candidates) {
        const where = `${file} ${candidate.id}`;
        if (candidate.subject === null) {
          expect(candidate.subjectKind, `${where} has no subject but claims one`)
            .toBe('not-derivable');
        } else {
          // A subject is a name out of the source, never a business term.
          expect(read(file), `${where}: ${candidate.subject} is not in the source`)
            .toContain(candidate.subject);
        }
        expect(candidate.values.length, `${where} carries no value`).toBeGreaterThan(0);
      }
    }
  });
});

test.describe('the rule the whole step is named after', () => {
  test(`${PO}:412 — the price tolerance agreed with purchasing`, () => {
    const report = readBusinessRules(read(PO));
    const tolerance = report.candidates.find((c) => c.lineStart === 412);

    expect(tolerance, 'the price tolerance at L412 is missing').toBeTruthy();
    expect(tolerance?.conditionText).toBe('lv_dev_pct > 5');
    expect(tolerance?.subject).toBe('lv_dev_pct');
    expect(tolerance?.operator).toBe('>');
    expect(tolerance?.literal).toBe('5');
    expect(tolerance?.values).toEqual(['5']);
    expect(tolerance?.ruleClass).toBe('toleranz');
    expect(tolerance?.origin).toBe('if');
    expect(tolerance?.container, 'the FORM it decides in').toBe('CHECK_PRICE');
    expect(tolerance?.branchId, 'the gateway 2.1 draws from the same IF').toBe('BR-031');

    // The anchor has to land on the line a reader would open.
    expect(read(PO).split(/\r?\n/)[411].trim()).toBe('IF lv_dev_pct > 5.');
  });
});

test.describe('a rule outside the first 1,000 characters (QA24-A10)', () => {
  test('the 1,000-line example states 119 of its 121 rules beyond character 1,000', () => {
    const source = read(LEGACY);
    const report = readBusinessRules(source);
    const beyond = report.candidates.filter((c) => offsetOfLine(source, c.lineStart) > 1000);

    expect(report.candidates).toHaveLength(121);
    expect(beyond).toHaveLength(119);

    // The first one past the mark, named, so the proof is a place and not a count.
    expect(beyond[0].id).toBe('RC-003');
    expect(beyond[0].lineStart, 'c_max_items is declared at L21').toBe(21);
    expect(offsetOfLine(source, 21)).toBe(1082);

    // And a rule in a *condition*, far beyond anything a 1,000-character
    // excerpt could reach: L185 is character 6,742 of 37,551.
    const inCondition = beyond.filter((c) => c.origin !== 'constant');
    expect(inCondition).toHaveLength(116);
    expect(inCondition[0].lineStart).toBe(185);
    expect(offsetOfLine(source, 185)).toBe(6742);

    // The last rule in the file sits at character 35,968 — 96% of the way in.
    const last = report.candidates[report.candidates.length - 1];
    expect(last.lineStart).toBe(990);
    expect(last.container).toBe('LEGACY_BUSINESS_RULE_014');
    expect(offsetOfLine(source, 990)).toBe(35968);
    // Measured on the line-feed form, like every offset above it. The shipped
    // example is checked out with the platform's line endings — 37,551
    // characters on Windows, 36,551 on Linux — so a raw length pins the machine
    // rather than the file, and this assertion went red in CI while passing
    // here. What the acceptance asks (QA24-A10) is how far into the file a rule
    // still appears, and that distance is the same on both.
    expect(source.replace(/\r\n/g, '\n').length).toBe(36551);
  });

  test('the fourteen copied FORMs state twenty rules, and say which are repeats', () => {
    // Lines 691-990 are the same check copied fourteen times. Reporting 98
    // rules there is honest; reporting them without saying that six of them are
    // one rule said fourteen times is not.
    const report = readBusinessRules(read(LEGACY));
    const block = report.candidates.filter((c) => c.lineStart >= 691 && c.lineStart <= 990);

    expect(block).toHaveLength(98);
    expect(block.filter((c) => c.repeatOf)).toHaveLength(78);

    const distinct = new Set(block.map((c) => `${c.subject}|${c.operator}|${c.values.join(',')}`));
    expect(distinct.size, 'six shared rules plus one per copy on a renamed variable').toBe(20);

    const plant = block.find((c) => c.lineStart === 713 && c.subject === 'is_order-vkorg');
    expect(plant?.repeatOf, 'the second copy points back at the first').toBe('RC-025');
  });
});

test.describe('what the code does not say', () => {
  test('an amount stays an amount — the reader never names a currency', () => {
    const po = readBusinessRules(read(PO));
    const approval = po.candidates.find((c) => c.lineStart === 422);

    expect(approval?.literal).toBe("'50000.00'");
    expect(approval?.values).toEqual(['50000.00']);
    expect(approval?.caveat).toBe('Betrag, Währung nicht aus dem Code ableitbar');

    // The program converts to EUR at L69-71 — which is exactly why the number
    // at L422 reads like euros and is not evidence of any. Nothing this reader
    // emits may turn it into one.
    const legacy = readBusinessRules(read(LEGACY));
    const amount = legacy.candidates.find((c) => c.lineStart === 695 && c.subject === 'lv_amount');
    expect(amount?.literal).toBe('100000');
    expect(amount?.caveat).toBe('Betrag, Währung nicht aus dem Code ableitbar');

    for (const candidate of [...po.candidates, ...legacy.candidates]) {
      expect(candidate.caveat ?? '', `${candidate.id} names a currency`).not.toMatch(/€|EUR|USD/);
    }
  });

  test('a subject the code does not state is null, not a plausible business term', () => {
    const report = readBusinessRules(
      'FORM t.\n  IF lo_order->amount( ) > 2500.\n    WRITE \'x\'.\n  ENDIF.\nENDFORM.',
    );
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0].subject).toBeNull();
    expect(report.candidates[0].subjectKind).toBe('not-derivable');
    expect(report.candidates[0].literal, 'the number is still reported').toBe('2500');
    expect(report.candidates[0].caveat, 'and no amount is claimed either').toBeUndefined();
  });
});

test.describe('a named constant is still an undocumented decision', () => {
  test('the declaration and every place it takes effect are both reported', () => {
    const report = readBusinessRules(read(LEGACY));

    const declaration = report.candidates.find((c) => c.lineStart === 22);
    expect(declaration?.subject).toBe('c_critical_score');
    expect(declaration?.operator).toBe('VALUE');
    expect(declaration?.literal).toBe('80');
    expect(declaration?.ruleClass).toBe('toleranz');

    const applied = report.candidates.find((c) => c.lineStart === 388);
    expect(applied?.conditionText).toBe('<fs_order>-risk_score GE c_critical_score');
    expect(applied?.literal, 'resolved, not left as a name').toBe('80');
    expect(applied?.viaConstant?.name).toBe('c_critical_score');
    expect(applied?.viaConstant?.declaredAt.lineStart).toBe(22);

    // The dictionary type decides what a constant is about. `c_purch_org TYPE
    // ekorg VALUE '1000'` is a purchasing organisation; by its name alone the
    // 1000 reads as a threshold.
    const purchasing = readBusinessRules(read(PO)).candidates.find((c) => c.lineStart === 19);
    expect(purchasing?.subject).toBe('c_purch_org');
    expect(purchasing?.ruleClass).toBe('organisationseinheit');
  });

  test('a constant that binds the program to a technical thing is not a rule', () => {
    const report = readBusinessRules(read(LEGACY));
    const technical = report.constants.filter((c) => c.technical).map((c) => c.written);

    // A hard-coded RFC destination, a transaction code, a path and a sender
    // address are all worth knowing and none of them is a business rule.
    expect(technical).toEqual([
      'c_program', 'c_destination', 'c_tcode_va02', 'c_local_path', 'c_mail_sender',
    ]);
    expect(report.constants.filter((c) => !c.technical).map((c) => c.written)).toEqual([
      'c_default_vkorg', 'c_default_werks', 'c_max_items', 'c_critical_score', 'c_medium_score',
    ]);
    for (const name of technical) {
      expect(
        report.rejected.some((r) => r.reason === 'technische-konstante' && r.text.startsWith(name)),
        `${name} was dropped without saying why`,
      ).toBe(true);
    }
  });
});

test.describe('what is not a rule candidate', () => {
  test('the technical comparisons are seen and dropped with a reason', () => {
    const legacy = readBusinessRules(read(LEGACY));
    const reasons = (line: number) =>
      legacy.rejected.filter((r) => r.lineStart === line).map((r) => `${r.reason}: ${r.text}`);

    expect(reasons(200), 'sy-subrc is the return code of a statement, not a rule')
      .toEqual(['systemfeld: sy-subrc <> 0']);
    expect(reasons(304), "'X' is how ABAP writes true").toEqual(["technischer-wert: cs_customer-sperr = 'X'"]);
    expect(reasons(188), 'a bound at zero is a guard').toEqual(['null-vergleich: p_days LT 0']);
    expect(reasons(658)).toEqual(['null-vergleich: lv_count GT 0']);
    expect(reasons(517), 'a commit interval is arithmetic, not a decision')
      .toEqual(['beide-seiten-literal: 50 = 0']);
    expect(reasons(680), 'the OK codes of a screen are not an exception list')
      .toEqual(["systemfeld: sy-ucomm = 'BACK' OR 'CANC' OR 'EXIT'"]);

    expect(legacy.rejected).toHaveLength(35);
    expect(readBusinessRules(read(PO)).rejected).toHaveLength(26);
  });

  test('a branch inside a macro body states no rule here', () => {
    // The body is expanded wherever the macro is used, not where it is written,
    // so neither the condition nor its line describes code that runs at this
    // place — `control-flow.ts` refuses to draw a gateway from it for the same
    // reason.
    const report = readBusinessRules(
      "DEFINE m.\n  IF gs_x-werks = '1000'.\n  ENDIF.\nEND-OF-DEFINITION.",
    );
    expect(report.candidates).toEqual([]);
  });
});

test.describe('the two traps in a string template', () => {
  test('a template that builds a sentence carries no rule literal', () => {
    // `|Toleranz: { 5 }|` holds a 5 that is part of a sentence being assembled.
    const embedded = readBusinessRules(
      'FORM t.\n  IF lv_text = |Toleranz: { 5 }|.\n    WRITE \'x\'.\n  ENDIF.\nENDFORM.',
    );
    expect(embedded.candidates).toEqual([]);
    expect(embedded.rejected.map((r) => r.reason)).toEqual(['stringtemplate']);

    // An assignment is not a condition at all — and the period inside the
    // template must not end the statement, or the IF after it disappears.
    const assigned = readBusinessRules(
      "FORM t.\n  lv_text = |Toleranz: { 5 } Prozent.|.\n  IF lv_a = 'Z1'.\n    WRITE 'x'.\n  ENDIF.\nENDFORM.",
    );
    expect(assigned.candidates.map((c) => c.literal)).toEqual(["'Z1'"]);
    expect(assigned.candidates[0].lineStart).toBe(3);
  });

  test('a template with a fixed text is a value, and a quote inside one is not a comment', () => {
    const fixed = readBusinessRules(
      'FORM t.\n  IF lv_status = |Status: ok|.\n    WRITE \'x\'.\n  ENDIF.\nENDFORM.',
    );
    expect(fixed.candidates).toHaveLength(1);
    expect(fixed.candidates[0].values).toEqual(['Status: ok']);

    // `"` opens a comment everywhere except inside a literal. Read as a comment,
    // the condition loses its right-hand side and the rule with it.
    const quoted = readBusinessRules(
      'FORM t.\n  IF lv_text = |He said "yes"|.\n    WRITE \'x\'.\n  ENDIF.\nENDFORM.',
    );
    expect(quoted.candidates).toHaveLength(1);
    expect(quoted.candidates[0].values).toEqual(['He said "yes"']);
  });
});

test.describe('lists, dates and where they come from', () => {
  test('one field against three countries is one list', () => {
    const report = readBusinessRules(read(LEGACY));
    const countries = report.candidates.filter((c) => c.lineStart === 307);

    expect(countries.map((c) => c.values[0])).toEqual(['DE', 'AT', 'CH']);
    for (const country of countries) {
      expect(country.ruleClass).toBe('ausnahmeliste');
      expect(country.valueSetId, 'the three belong together').toBe('BR-011#cs_customer-land1');
    }

    // Two thresholds on one field are two thresholds, never a list.
    const scores = report.candidates.filter((c) => c.lineStart === 388 || c.lineStart === 390);
    expect(scores.map((c) => c.ruleClass)).toEqual(['toleranz', 'toleranz']);
    expect(scores.map((c) => c.valueSetId)).toEqual([undefined, undefined]);
  });

  test('a CASE arm knows the selector it is compared against', () => {
    const report = readBusinessRules(read('Z_MATERIAL_STOCK_CALC.txt'));
    expect(report.candidates.map((c) => c.values[0])).toEqual(['ROH', 'HALB', 'FERT']);
    for (const candidate of report.candidates) {
      expect(candidate.origin).toBe('when');
      expect(candidate.subject, 'the value alone says nothing').toBe('gs_stock-mtart');
      expect(candidate.subjectKind).toBe('case-selector');
      expect(candidate.selectorAt?.lineStart, 'and the selector has its own line').toBe(57);
    }
  });

  test('IN, BETWEEN and a date literal are read the way they are written', () => {
    const list = readBusinessRules(
      "FORM t.\n  IF cs_cust-land1 IN ( 'DE', 'AT' ).\n    WRITE 'x'.\n  ENDIF.\nENDFORM.",
    );
    expect(list.candidates).toHaveLength(1);
    expect(list.candidates[0].operator).toBe('IN');
    expect(list.candidates[0].values).toEqual(['DE', 'AT']);
    expect(list.candidates[0].ruleClass).toBe('ausnahmeliste');

    // `IN s_vkorg` is a select-option: the values are typed in at run time and
    // the program states none of them.
    const selectOption = readBusinessRules(
      "FORM t.\n  IF gs_x-vkorg IN s_vkorg.\n    WRITE 'x'.\n  ENDIF.\nENDFORM.",
    );
    expect(selectOption.candidates).toEqual([]);

    const between = readBusinessRules(
      "FORM t.\n  IF gs_head-budat BETWEEN '20240101' AND '20241231'.\n    WRITE 'x'.\n  ENDIF.\nENDFORM.",
    );
    expect(between.candidates).toHaveLength(1);
    expect(between.candidates[0].values).toEqual(['20240101', '20241231']);
    expect(between.candidates[0].ruleClass).toBe('datumsgrenze');
  });

  test('a threshold in days is a date boundary, not a tolerance', () => {
    const report = readBusinessRules(read(LEGACY));
    const ages = report.candidates.filter((c) => c.subject === 'lv_days_old');
    expect(ages.map((c) => `${c.lineStart}:${c.operator} ${c.literal}`))
      .toEqual(['370:GT 180', '372:GT 90']);
    expect(ages.map((c) => c.ruleClass)).toEqual(['datumsgrenze', 'datumsgrenze']);
  });

  test('CHECK and WHILE state rules too', () => {
    const report = readBusinessRules(
      'FORM t.\n  CHECK gs_x-werks = \'1000\'.\n  WHILE lv_retry < 3.\n    ADD 1 TO lv_retry.\n  ENDWHILE.\nENDFORM.',
    );
    expect(report.candidates.map((c) => `${c.origin} ${c.literal}`))
      .toEqual(["check '1000'", 'while 3']);
  });
});
