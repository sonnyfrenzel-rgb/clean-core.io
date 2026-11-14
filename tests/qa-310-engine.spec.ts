import { test, expect } from '@playwright/test';
import { readDemoSwitches } from '../lib/abap/demo-switches';
import { readSource } from '../lib/first-look';
import { readProgramDomain } from '../lib/abap/program-domain';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { explainBusinessRules } from '../lib/abap/business-rule-set-explain';
import { conditionToPhrase, conditionToQuestion, plainContext } from '../lib/abap/plain-language';

/**
 * QA review of 981971e79cc9 (the 3.1.0 history), engine findings. Each reading changed here is gated on
 * `ENGINE_READS_310_FROM`; a run signed by an earlier engine reads as before.
 *
 * Server-free: pure engine functions over inline ABAP.
 */

const BEFORE = '3.0.23';
const AFTER = '3.1.0';

test.describe('a test data switch by shape is set apart only while nothing else decides on it', () => {
  const arms = [1, 2, 3, 4, 5].map((n) => `    WHEN ${n}.\n      APPEND VALUE #( id = ${n} name = 'Case ${n}' ) TO lt_rows.`).join('\n');
  const program = (elsewhere: string) =>
    `REPORT zcases.\nPARAMETERS p_mode TYPE i.\nDATA: lt_rows TYPE TABLE OF zrow.\nSTART-OF-SELECTION.\n  PERFORM apply_case.\n${elsewhere}FORM apply_case.\n  CASE p_mode.\n${arms}\n  ENDCASE.\nENDFORM.\nFORM post_orders.\n  WRITE 'posted'.\nENDFORM.\n`;

  test('a business branch on the same parameter keeps the CASE among the rules', () => {
    const business = program('  IF p_mode = 1.\n    PERFORM post_orders.\n  ENDIF.\n');
    expect(readDemoSwitches(business, AFTER)).toBeNull();
    // An earlier engine reads as it signed.
    expect(readDemoSwitches(business, BEFORE)?.flag.name).toBe('P_MODE');
    const checked = program('  CHECK p_mode = 1.\n  PERFORM post_orders.\n');
    expect(readDemoSwitches(checked, AFTER)).toBeNull();
  });

  test('a check that only says a message still leaves the switch standing', () => {
    const validation = program("  IF p_mode < 1 OR p_mode > 5.\n    MESSAGE 'Unknown case' TYPE 'E'.\n  ENDIF.\n");
    expect(readDemoSwitches(validation, AFTER)?.flag.name).toBe('P_MODE');
    expect(readDemoSwitches(program(''), AFTER)?.flag.name).toBe('P_MODE');
  });
});

test.describe('a value of a thousand million is a technical cap only where the rule compares against it', () => {
  const program = (condition: string) => [
    'REPORT zsd_doc_check.',
    'DATA ls_doc TYPE vbak.',
    'START-OF-SELECTION.',
    '  SELECT SINGLE * FROM vbak INTO ls_doc.',
    `  IF ${condition}.`,
    "    MESSAGE 'Stop' TYPE 'E'.",
    '  ENDIF.',
    '',
  ].join('\n');
  const reasonOf = (source: string, engineVersion: string) => {
    const reading = readSource(source, engineVersion);
    const ex = explainBusinessRules(source, reading.ruleSet, buildProcessFacts(source), engineVersion);
    const rule = reading.ruleSet.rules.find((r) => /1000000000/.test(r.label));
    expect(rule, 'no rule on the value').toBeTruthy();
    return ex.rules.find((r) => r.id === rule!.id)!.basket.reason.text;
  };

  test('an equality test against such a value is not said as "no limit"', () => {
    const equal = program("ls_doc-vbeln = '1000000000'");
    expect(reasonOf(equal, AFTER)).not.toMatch(/no limit/);
    expect(reasonOf(equal, BEFORE)).toMatch(/no limit/);
  });

  test('a comparison against it still is', () => {
    expect(reasonOf(program('ls_doc-netwr > 1000000000'), AFTER)).toMatch(/no limit/);
  });
});

test.describe('limits on one amount in different currencies are asked with their currencies', () => {
  const SOURCE = [
    'REPORT zfi_release_check.',
    'DATA ls_doc TYPE bsik.',
    'START-OF-SELECTION.',
    '  SELECT SINGLE * FROM bsik INTO ls_doc.',
    "  IF ls_doc-waers = 'EUR' AND ls_doc-wrbtr > 1000.",
    "    MESSAGE 'Approval needed' TYPE 'E'.",
    '  ENDIF.',
    "  IF ls_doc-waers = 'USD' AND ls_doc-wrbtr > 1200.",
    "    MESSAGE 'Approval needed' TYPE 'E'.",
    '  ENDIF.',
    '',
  ].join('\n');
  const questionsOf = (engineVersion: string) => {
    const reading = readSource(SOURCE, engineVersion);
    return explainBusinessRules(SOURCE, reading.ruleSet, buildProcessFacts(SOURCE), engineVersion).questions.map((q) => q.statement.text);
  };

  test('each limit is said with its currency', () => {
    const asked = questionsOf(AFTER).find((t) => /1,?000/.test(t)) ?? '';
    expect(asked).toMatch(/1,?000 EUR/);
    expect(asked).toMatch(/1,?200 USD/);
    // An earlier engine said the first limit only.
    expect(questionsOf(BEFORE).join(' ')).not.toMatch(/USD/);
  });
});

test.describe('a value the program sets is its own marker only where no read fills the field', () => {
  const program = (read: string) => [
    'REPORT zsd_status_check.',
    'DATA ls_order TYPE zorder.',
    'START-OF-SELECTION.',
    read,
    '  IF ls_order-netwr > 100.',
    "    ls_order-status = 'A'.",
    '  ENDIF.',
    "  IF ls_order-status = 'A'.",
    "    MESSAGE 'Approved order' TYPE 'E'.",
    '  ENDIF.',
    '',
  ].join('\n');
  const basketOf = (source: string, engineVersion: string) => {
    const reading = readSource(source, engineVersion);
    const ex = explainBusinessRules(source, reading.ruleSet, buildProcessFacts(source), engineVersion);
    const rule = reading.ruleSet.rules.find((r) => /status = 'A'/.test(r.label));
    expect(rule, 'no rule on the status').toBeTruthy();
    return ex.rules.find((r) => r.id === rule!.id)!.basket;
  };

  test('a status read from the database and set in one branch is asked about', () => {
    const read = program('  SELECT SINGLE * FROM zorder INTO ls_order.');
    expect(basketOf(read, AFTER).kind).toBe('business');
    expect(basketOf(read, BEFORE).reason.text).toMatch(/marker of its own/);
  });

  test('a field only the program sets stays its marker', () => {
    expect(basketOf(program('  CLEAR ls_order.'), AFTER).reason.text).toMatch(/marker of its own/);
  });
});

test('two bounds read as a range only where they are in order', () => {
  const ctx = plainContext(['REPORT zt_range.', 'DATA lv_amount TYPE i.'].join('\n'), { engineVersion: AFTER });
  const ask = (condition: string) => conditionToQuestion(condition, ctx, 2).question;
  expect(ask('lv_amount < 100 OR lv_amount > 10')).not.toMatch(/outside/i);
  expect(ask('lv_amount >= 10 AND lv_amount <= 5')).not.toMatch(/between/i);
  expect(ask('lv_amount < 5 OR lv_amount > 10')).toBe('Amount outside 5 to 10?');
  // A bound the code does not state as a number has no known order.
  expect(ask('lv_amount < lv_min OR lv_amount > lv_max')).not.toMatch(/outside/i);
});

test('a routine called in a condition is said with the 3.1.0 vocabulary', () => {
  const src = ['REPORT z.', 'IF genehmige( ) > 5.', 'ENDIF.', ''].join('\n');
  expect(conditionToPhrase('genehmige( ) > 5', plainContext(src, { engineVersion: AFTER }))).toMatch(/^Approve/);
  expect(conditionToPhrase('genehmige( ) > 5', plainContext(src, { engineVersion: BEFORE }))).toMatch(/^Genehmige/);
});

test('a condition that only checks the tolerance entry against a fixed value does not apply it', () => {
  const declared = 'REPORT zmm_invoice_check.\nPARAMETERS p_tolerance TYPE p DECIMALS 2 DEFAULT 5.\nDATA gv_invoice TYPE belnr_d.\nSELECT SINGLE belnr FROM rbkp INTO gv_invoice.\n';
  const entryCheck = `${declared}IF p_tolerance > 0.\n  MESSAGE 'Tolerance given' TYPE 'S'.\nENDIF.\n`;
  expect(readProgramDomain(entryCheck)?.text ?? '').not.toMatch(/tolerance/);
  expect(readProgramDomain(`${declared}IF gv_invoice > p_tolerance.\n  WRITE / gv_invoice.\nENDIF.\n`)?.text ?? '').toMatch(/within a tolerance/);
});
