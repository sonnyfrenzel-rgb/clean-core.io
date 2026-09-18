import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  personalDataHintKey,
  scanForPersonalDataHints,
  type PersonalDataHint,
} from '../lib/personal-data-hints';

/**
 * The hint about personal data, tested as a hint.
 *
 * The rule that outranks everything else in this feature is that it must never
 * claim to have found personal data. It finds **shapes that often indicate**
 * it. That rule has two halves and both are here:
 *
 *   - What the shapes are, so that a pattern cannot be quietly dropped. Every
 *     one of them was checked against the eight ABAP files this product ships
 *     in `public/starter-examples/` before it was kept, and three of those
 *     files carry a genuine match — the batch mailer's address constant, a
 *     personnel number left in a `PARAMETERS … DEFAULT`, and a literal written
 *     to `NAME1`.
 *   - What it deliberately lets pass. A detector that fires on
 *     `gs_fieldcat-fieldname = 'NAME1'` — a column heading handed to an ALV
 *     grid — teaches people to tick the box without reading, and a hint nobody
 *     reads is worse than none. The negatives below are the price of that, and
 *     they are stated as decisions rather than left as luck.
 *
 * The masking is tested as hard as the matching. The list is rendered on the
 * upload screen, so an excerpt that printed the value it points at would make
 * the warning a second copy of the data — including the *neighbouring* value,
 * which is how the first version of `excerptForLine` leaked.
 */

const ROOT = path.resolve(__dirname, '..');
const EXAMPLES = path.join(ROOT, 'public', 'starter-examples');
const BIG_EXAMPLE = path.join(EXAMPLES, 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');

const kinds = (source: string) => scanForPersonalDataHints(source).map((h) => h.kind);
const one = (source: string): PersonalDataHint => {
  const hints = scanForPersonalDataHints(source);
  expect(hints, `expected exactly one hint for:\n${source}`).toHaveLength(1);
  return hints[0];
};

/* ==================================================================== *
 * The shapes it knows.
 * ==================================================================== */

test.describe('the shapes that often indicate personal data', () => {
  test('an e-mail address, wherever it stands', () => {
    expect(one("lv_to = 'hans.mueller@firma.de'.").kind).toBe('email-address');
    // A string template is text too, and `|…|` is the literal form the other
    // ABAP readers in this repo kept forgetting.
    expect(kinds('lv = |write to hans.mueller@firma.de today|.')).toEqual(['email-address']);
  });

  test('an IBAN — structure, length and check digits', () => {
    expect(one("lv_iban = 'DE89370400440532013000'.").kind).toBe('iban');
    // One digit changed. The structure still fits and the mod-97 does not, and
    // that is the whole reason the checksum is computed rather than skipped:
    // without it every long uppercase token would be offered as a bank account.
    expect(kinds("lv_iban = 'DE89370400440532013001'.")).toEqual([]);
  });

  test('a phone number with an international dialling code', () => {
    expect(one("lv_tel = '+49 171 1234567'.").kind).toBe('phone-number');
    expect(one("lv_tel = '+4917112345678'.").kind).toBe('phone-number');
    // Too few digits to be dialled: a time zone offset, a length, an amount.
    expect(kinds("lv_off = '+0100'.")).toEqual([]);
  });

  test('a German tax identification number, but only with a word about tax beside it', () => {
    expect(one("lv_id = '12345678901'. \" Steuer-ID").kind).toBe('tax-id');
    expect(one("ls_p-stcd3 = '12345678901'.").kind).toBe('tax-id');
    // The comment naming the field stands one line above the assignment more
    // often than beside it — legacy ABAP is written that way.
    expect(one("* Steuer-ID des Mitarbeiters\nlv_id = '12345678901'.").kind).toBe('tax-id');
  });

  test('a fixed value in an ABAP field that names a person by definition', () => {
    expect(one("lv_pernr = '00010234'.").kind).toBe('personnel-number');
    expect(one("ls_p-gbdat = '19800101'.").kind).toBe('date-of-birth');
    expect(one("gs_kna1-name1 = 'Mueller GmbH'.").kind).toBe('person-name');
    expect(one("ls_p-vorna = 'Hans'.").kind).toBe('person-name');
    expect(one("ls_p-nachn = 'Mueller'.").kind).toBe('person-name');
  });

  test('SY-UNAME compared with a fixed user name', () => {
    expect(one("IF sy-uname = 'MUELLERH'.\nENDIF.").kind).toBe('user-name');
    expect(one("IF sy-uname EQ 'MUELLERH'.\nENDIF.").kind).toBe('user-name');
    expect(one("IF sy-uname NE 'BATCH01'.\nENDIF.").kind).toBe('user-name');
    // A program that copies the system field into its own log structure and
    // then compares that carries the same user id. Reporting only `sy-uname`
    // would miss it, which is why the rule is the field name, not the prefix.
    expect(one("IF gs_log-uname = 'MUELLERH'.\nENDIF.").kind).toBe('user-name');
  });

  test('the field is reached the four ways ABAP reaches a field', () => {
    for (const written of [
      "lv_pernr = '00010234'.",
      "gs_trip-pernr = '00010234'.",
      "lo_request->pernr = '00010234'.",
      "<fs_line>-pernr = '00010234'.",
    ]) {
      expect(kinds(written), written).toEqual(['personnel-number']);
    }
  });

  test('and where the value is declared rather than assigned', () => {
    // Both of these stand in the shipped examples, and neither is an
    // assignment: the person is named by the declaration — once by the
    // dictionary type it borrows, once by the name of the parameter itself.
    expect(one("CONSTANTS c_m TYPE adr6-smtp_addr VALUE 'batch@firma.de'.").kind)
      .toBe('mail-address-field');
    expect(one("PARAMETERS: p_pernr TYPE c LENGTH 8 DEFAULT '00010234'.").kind)
      .toBe('personnel-number');
  });

  test('a column of a tabular export that is named after a person', () => {
    const hints = scanForPersonalDataHints('OBJECT_NAME;CALLS;USER;TERMINAL\nZSD;12;MUELLERH;T01\n');
    expect(hints.map((h) => h.kind)).toEqual(['table-column', 'table-column']);
    // The heading is metadata about the file, not anybody's data, so it is the
    // one excerpt that is shown as it stands. The values under it are never
    // read and never printed.
    expect(hints.map((h) => h.excerpt)).toEqual(['Column “USER”', 'Column “TERMINAL”']);
    expect(kinds('OBJECT_NAME\tUSER_NAME\tCALLS\n')).toEqual(['table-column']);
    expect(kinds('OBJECT_NAME,USERID,CALLS\n')).toEqual(['table-column']);
    // A title line or a blank line above the heading is normal in an export.
    expect(kinds('\nSCMON export\nOBJECT;USER\n')).toEqual(['table-column']);
  });

  test('a usage export with nothing about a person in its headings says nothing', () => {
    expect(kinds('OBJECT_NAME;CALLS;LAST_USED\nZSD_ORDERS;12;2026-04-05\n')).toEqual([]);
  });
});

/* ==================================================================== *
 * The shapes it deliberately lets pass.
 * ==================================================================== */

test.describe('what it lets pass, on purpose', () => {
  test('a column name handed to an ALV field catalogue is not a name', () => {
    // `gs_fieldcat-fieldname = 'NAME1'` stands in Z_BUSINESS_PARTNER_SYNC.txt.
    // The literal is the string "NAME1"; the field being written is
    // `fieldname`, which names nobody. Matching on the left-hand field rather
    // than on the literal is what tells the two apart.
    expect(kinds("gs_fieldcat-fieldname = 'NAME1'.")).toEqual([]);
  });

  test('a declaration without a value is not a value', () => {
    expect(kinds('DATA: name1 TYPE kna1-name1,\n      pernr TYPE pernr_d.')).toEqual([]);
    expect(kinds('SELECT SINGLE pernr FROM pa0105 INTO lv_pernr WHERE usrid = lv_u.')).toEqual([]);
    expect(kinds('gs_log-uname = sy-uname.')).toEqual([]);
    expect(kinds("lv_pernr = ''.")).toEqual([]);
  });

  test('ABAP offset syntax and ABAP arithmetic are not phone numbers', () => {
    // `lv_text+10(200)` follows an identifier character; `'+49 …'` follows a
    // quote. That single guard is what separates them, and it is why the
    // pattern insists on a digit immediately after the plus.
    expect(kinds('lv_x = lv_text+10(200).\nlv_y = lv_a+1000(10000).')).toEqual([]);
    expect(kinds('lv_x = lv_y + 12345678901234.')).toEqual([]);
  });

  test('eleven digits on their own are a document number', () => {
    expect(kinds("lv_belnr = '12345678901'.\nlv_other = '98765432109'.")).toEqual([]);
    // A German tax id never starts with zero.
    expect(kinds("* Steuer\nlv_x = '01234567890'.")).toEqual([]);
    // And the word has to be near. Two lines away is prose about something else.
    expect(kinds("* Steuer\nWRITE / 1.\nlv_x = '12345678901'.")).toEqual([]);
  });

  test('a line of ABAP that happens to contain a comma is not a heading row', () => {
    expect(kinds('DATA: lv_user TYPE string, lv_b TYPE i.')).toEqual([]);
    // And a heading-shaped row further down the file is data, not a heading.
    expect(kinds('REPORT z.\n* note\nDATA lv TYPE i.\nUSER;TERMINAL;CALLS\n')).toEqual([]);
  });

  test('the false positive it keeps, named rather than hidden', () => {
    // `gs_bp_data-name1 = 'Unknown Partner'` is in Z_BUSINESS_PARTNER_SYNC.txt
    // and is a placeholder, not a person. It is reported anyway: the shape is
    // exactly the shape of a real name written to a name field, and a module
    // that tried to tell "Unknown Partner" from "Hans Mueller" would be
    // claiming to recognise personal data — which is the one thing this must
    // never do. A reader looks at the line and dismisses it in a second.
    expect(one("gs_bp_data-name1 = 'Unknown Partner'.").kind).toBe('person-name');
  });
});

/* ==================================================================== *
 * Comments.
 * ==================================================================== */

test.describe('a comment is not code, and an address in a comment is still an address', () => {
  test('a commented-out assignment is not an assignment', () => {
    // The rule `lib/abap/statement-reader.ts` exists for, applied through its
    // own `maskComments` rather than through a fourteenth private copy of it.
    expect(kinds("* lv_pernr = '00010234'.\nWRITE / 1.")).toEqual([]);
    expect(kinds("WRITE / 1. \" lv_pernr = '00010234'.")).toEqual([]);
  });

  test('but an address, an IBAN or a phone number in a comment is reported', () => {
    // The Terms name "names of colleagues or customers in comments" as one of
    // the things to strip, so the generic shapes read the source as handed in.
    expect(kinds('* ask hans.mueller@firma.de about this\nWRITE / 1.')).toEqual(['email-address']);
    expect(kinds("* account DE89370400440532013000\nWRITE / 1.")).toEqual(['iban']);
  });
});

/* ==================================================================== *
 * The list must not become a copy of the data.
 * ==================================================================== */

test.describe('the hint list is not a second copy of the data', () => {
  test('the excerpt never carries the value it points at', () => {
    const hint = one("lv_to = 'hans.mueller@firma.de'.");
    expect(hint.excerpt).not.toContain('hans.mueller@firma.de');
    expect(hint.excerpt).not.toContain('mueller');
    // Enough is left to recognise the line without opening the file again.
    expect(hint.excerpt).toContain('lv_to');
    expect(hint.excerpt).toContain('•');
  });

  test('nor the value beside it', () => {
    // One line, two addresses. Masking only the one being reported printed the
    // other in full inside its own excerpt.
    const hints = scanForPersonalDataHints("lv_a = 'x@y.de'. lv_b = 'p@q.de'.");
    expect(hints).toHaveLength(2);
    for (const hint of hints) {
      expect(hint.excerpt).not.toContain('x@y.de');
      expect(hint.excerpt).not.toContain('p@q.de');
    }
  });

  test('a long line is cut down rather than printed whole', () => {
    const padding = 'lv_dummy_value_for_padding = 1. '.repeat(12);
    const hint = one(`${padding}lv_to = 'hans.mueller@firma.de'.`);
    expect(hint.excerpt.length).toBeLessThanOrEqual(120);
  });

  test('the same value found twice on one line is one thing to look at', () => {
    // An address inside an SMTP_ADDR constant is recognised both as an address
    // and as the field it sits in. The ABAP reason is the more specific one and
    // is the one that is kept.
    const hints = scanForPersonalDataHints("CONSTANTS c TYPE adr6-smtp_addr VALUE 'a.b@c.de'.");
    expect(hints.map((h) => h.kind)).toEqual(['mail-address-field']);
  });

  test('every hint says where it is and why, in plain English', () => {
    for (const hint of scanForPersonalDataHints(
      "lv_pernr = '00010234'.\nlv_to = 'hans@firma.de'.\nlv_iban = 'DE89370400440532013000'.",
    )) {
      expect(hint.line).toBeGreaterThan(0);
      expect(hint.why.length).toBeGreaterThan(30);
      expect(hint.excerpt.length).toBeGreaterThan(0);
    }
  });

  test('the line numbers are the source’s own, counted from one', () => {
    const hints = scanForPersonalDataHints(
      ['REPORT z.', '* a comment', '', "lv_pernr = '00010234'."].join('\n'),
    );
    expect(hints.map((h) => h.line)).toEqual([4]);
  });
});

/* ==================================================================== *
 * The eight files this product ships.
 * ==================================================================== */

test.describe('the shipped ABAP examples, which is where every pattern was checked', () => {
  const read = (name: string) => fs.readFileSync(path.join(EXAMPLES, name), 'utf8');

  test('the three that carry something, and what it is', () => {
    expect(kinds(read('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap'))).toEqual([
      'mail-address-field',
    ]);
    expect(kinds(read('Z_EMPLOYEE_EXPENSE_VAL.txt'))).toEqual(['personnel-number']);
    expect(kinds(read('Z_BUSINESS_PARTNER_SYNC.txt'))).toEqual(['person-name']);
  });

  test('and the five that carry nothing', () => {
    for (const name of [
      'Z_INVOICE_EXTRACTOR.txt',
      'Z_MATERIAL_STOCK_CALC.txt',
      'Z_MM_PO_APPROVAL.abap',
      'Z_ORDER_INTEGRITY_CHECK.txt',
      'Z_SALES_ORDER_CREATOR.txt',
    ]) {
      expect(kinds(read(name)), `${name} produced a hint it did not use to`).toEqual([]);
    }
  });

  test('no ABAP file is mistaken for a table with a heading row', () => {
    for (const name of fs.readdirSync(EXAMPLES)) {
      expect(kinds(read(name)), `${name} was read as a delimited export`).not.toContain(
        'table-column',
      );
    }
  });
});

/* ==================================================================== *
 * Fast enough to sit behind a textarea.
 * ==================================================================== */

test('the 37 kB example is read in milliseconds, not in a pause the typist feels', () => {
  const source = fs.readFileSync(BIG_EXAMPLE, 'utf8');
  // Guard against measuring nothing: this has to be the big file.
  expect(source.length, 'the example shrank — the measurement below would be vacuous').toBeGreaterThan(
    30000,
  );

  // The first call pays for the regex compilation and the JIT. What the person
  // at the keyboard experiences is every call after it.
  scanForPersonalDataHints(source);
  const started = Date.now();
  for (let i = 0; i < 3; i++) scanForPersonalDataHints(source);
  const elapsed = Date.now() - started;
  expect(
    elapsed,
    `three passes over ${source.length} bytes took ${elapsed} ms. This runs on every keystroke in ` +
      'the upload textarea, so it has to stay cheap.',
  ).toBeLessThan(300);
});

test('the same text always produces the same list', () => {
  const source = fs.readFileSync(BIG_EXAMPLE, 'utf8');
  expect(JSON.stringify(scanForPersonalDataHints(source))).toBe(
    JSON.stringify(scanForPersonalDataHints(source)),
  );
  expect(scanForPersonalDataHints('')).toEqual([]);
});

/* ==================================================================== *
 * The acknowledgement is bound to what was acknowledged.
 * ==================================================================== */

test.describe('an acknowledgement belongs to the lines it was made for', () => {
  test('editing the source makes the old tick stop counting', () => {
    const before = personalDataHintKey(scanForPersonalDataHints("lv_pernr = '00010234'."));
    const after = personalDataHintKey(scanForPersonalDataHints("lv_pernr = '00019999'."));
    expect(before).not.toBe('');
    expect(after, 'a different value produced the same key, so a stale tick would carry over').not.toBe(
      before,
    );
  });

  test('and nothing to acknowledge has no key at all', () => {
    // The screens compare `ackFor === key` and treat an empty key as nothing
    // acknowledged, so an empty string here is what keeps a fresh page from
    // counting as already ticked.
    expect(personalDataHintKey([])).toBe('');
  });
});
