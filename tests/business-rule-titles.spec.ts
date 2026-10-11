import { test, expect } from '@playwright/test';
import { readSource } from '../lib/first-look';
import { plainWordingFor } from '../lib/business-card';
import { editorRules } from '../lib/rules-editor';
import { MAX_RULE_TITLE, UNREAD_CONDITION, plainContext, ruleConditionText } from '../lib/abap/plain-language';

/**
 * Owner report 11.10.2026, on the business rules of a real FI project: "Such
 * business rules are not readable, not usable." Three of six titles were the
 * ABAP condition itself and one named a field by its technical name. The cause:
 * the title came from the process-map wording, which stops at a label's 48
 * characters, so every compound condition fell back to the code; and the
 * fields of an invoice reference were not in the glossary.
 *
 * Pure: the source below has the shape of that program (credit memos checked
 * against their invoice reference); the titles are what the rule list shows.
 */

const FI = `REPORT zfi_credit_memo_check.

DATA: gt_items TYPE STANDARD TABLE OF bseg,
      gs_item  TYPE bseg.

START-OF-SELECTION.
  SELECT * FROM bseg INTO TABLE gt_items WHERE bukrs = '1000'.
  LOOP AT gt_items INTO gs_item.
    PERFORM check_item USING gs_item.
  ENDLOOP.

FORM check_item USING ps_item TYPE bseg.
  DATA: ls_ref TYPE bseg.

  IF ps_item-shkzg = 'H'.
    WRITE: / 'Credit line', ps_item-belnr.
  ENDIF.

  IF ps_item-shkzg = 'H' AND ps_item-rebzg IS NOT INITIAL AND ps_item-rebzg <> 'V'.
    IF ps_item-rebzg CN '0123456789' OR ps_item-rebzj IS INITIAL OR ps_item-rebzz IS INITIAL.
      MESSAGE 'Invoice reference incomplete' TYPE 'E'.
    ENDIF.
    SELECT SINGLE * FROM bseg INTO ls_ref
      WHERE bukrs = ps_item-bukrs
        AND belnr = ps_item-rebzg
        AND gjahr = ps_item-rebzj
        AND buzei = ps_item-rebzz.
    IF sy-subrc <> 0 OR ls_ref-koart <> 'D' OR ls_ref-kunnr <> ps_item-kunnr.
      MESSAGE 'Invoice reference does not belong to the customer' TYPE 'E'.
    ENDIF.
  ENDIF.

  IF ps_item-shkzg = 'H' AND ps_item-rebzg IS INITIAL.
    WRITE: / 'Credit without invoice reference', ps_item-belnr.
  ENDIF.

  IF ps_item-shkzg = 'H' AND ps_item-rebzg = 'V'.
    WRITE: / 'Credit with reference V', ps_item-belnr.
  ENDIF.
ENDFORM.
`;

const reading = readSource(FI);
const rules = editorRules(reading.ruleSet, plainWordingFor(FI, reading.skeleton));
const byCode = (code: string) => {
  const rule = rules.find((r) => r.code === code);
  if (!rule) throw new Error(`no rule for ${code}: ${rules.map((r) => r.code).join(' | ')}`);
  return rule;
};

/** What a title must never contain: a component selector, a quote, an ABAP operator or keyword. */
const RAW_ABAP = /\b(?:ps_item|ls_ref|sy)-|'|<>|\bsy-subrc\b|\bIS (?:NOT )?INITIAL\b|\b(?:CN|CO|NE|EQ)\b|\bAND\b|\bOR\b/;

test.describe('every business rule has a readable title (owner, 11.10.2026)', () => {
  test('no title is the ABAP condition, and the condition stays underneath as the code', () => {
    expect(rules.length).toBe(6);
    for (const rule of rules) {
      expect(rule.titleIsCode, `${rule.id}: ${rule.title}`).toBe(false);
      expect(rule.title, rule.id).not.toMatch(RAW_ABAP);
      expect(rule.title.length, rule.id).toBeLessThanOrEqual(MAX_RULE_TITLE);
      expect(rule.code, rule.id).toMatch(/ps_item-|sy-subrc/);
      expect(rule.anchors.length, rule.id).toBeGreaterThan(0);
    }
  });

  test('the six titles of the report, in words', () => {
    expect(byCode("ps_item-shkzg = 'H'").title).toBe('Debit/credit indicator H (credit)');
    expect(byCode("ps_item-shkzg = 'H' AND ps_item-rebzg IS NOT INITIAL AND ps_item-rebzg <> 'V'").title)
      .toBe('Debit/credit indicator H (credit), invoice reference is filled and not V');
    expect(byCode("ps_item-shkzg = 'H' AND ps_item-rebzg IS INITIAL").title)
      .toBe('Debit/credit indicator H (credit) and invoice reference is empty');
    expect(byCode("ps_item-shkzg = 'H' AND ps_item-rebzg = 'V'").title)
      .toBe('Debit/credit indicator H (credit) and invoice reference V');
  });

  test('a condition too long for a line: a short title, the whole of it in words below', () => {
    const reference = byCode("ps_item-rebzg CN '0123456789' OR ps_item-rebzj IS INITIAL OR ps_item-rebzz IS INITIAL");
    expect(reference.title).toBe('Invoice reference contains non-digits, or 2 more conditions');
    expect(reference.sentence).toBe(
      'Invoice reference contains non-digits, fiscal year of the invoice reference is empty '
        + 'or line item of the invoice reference is empty',
    );
    const customer = byCode("sy-subrc <> 0 OR ls_ref-koart <> 'D' OR ls_ref-kunnr <> ps_item-kunnr");
    // sy-subrc is named after the SELECT SINGLE on BSEG before it.
    expect(customer.title).toBe('No accounting document item found, or 2 more conditions');
    expect(customer.sentence).toBe(
      'No accounting document item found, account type not D (customer) '
        + 'or customer number of the reference differs from that of the item',
    );
    for (const rule of [reference, customer]) expect(rule.sentence ?? '').not.toMatch(RAW_ABAP);
  });
});

test.describe('the wording of a rule condition — never more than the code says', () => {
  const ctx = plainContext('');

  test('a value is given its meaning only where SAP fixes it for every system', () => {
    expect(ruleConditionText("ls-shkzg = 'S'", ctx).title).toBe('Debit/credit indicator S (debit)');
    expect(ruleConditionText("ls-koart = 'K'", ctx).title).toBe('Account type K (supplier)');
    // A value the domain does not list, and a customizable field, stay as written.
    expect(ruleConditionText("ls-koart = 'Z'", ctx).title).toBe('Account type Z');
    expect(ruleConditionText("ls-auart = 'ZTAS'", ctx).title).toBe('Order type ZTAS');
  });

  test('CO and CN with the ten digits read as digits; any other set is named as its characters', () => {
    expect(ruleConditionText("lv_ref CO '0123456789'", ctx).title).toBe('Reference contains only digits');
    expect(ruleConditionText("lv_ref CN '0123456789'", ctx).title).toBe('Reference contains non-digits');
    expect(ruleConditionText("lv_ref CN 'ABC'", ctx).title).toBe('Reference contains characters other than ABC');
  });

  test('sy-subrc without a known statement before it is the previous step, never "Failed" alone', () => {
    expect(ruleConditionText('sy-subrc <> 0', ctx).title).toBe('The previous step failed');
    const read = plainContext('READ TABLE gt_items INTO gs_item INDEX 1.\nIF sy-subrc <> 0.\nENDIF.');
    expect(ruleConditionText('sy-subrc <> 0', read, 2).title).toBe('The previous read found nothing');
  });

  test('a part of a field is a part, not a call', () => {
    expect(ruleConditionText("gs_konv-kschl(1) = 'Z'", ctx).title).toBe('First character of condition type Z');
    expect(ruleConditionText("lv_text+2(3) = 'ABC'", ctx).title).toBe('Characters 3 to 5 of text ABC');
  });

  test('what cannot be read is said in words, and the full wording is absent rather than guessed', () => {
    expect(ruleConditionText('lv_a lv_b lv_c', ctx)).toEqual({ title: UNREAD_CONDITION, full: null });
  });
});
