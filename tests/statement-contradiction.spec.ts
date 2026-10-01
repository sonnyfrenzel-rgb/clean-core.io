import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  CONTRADICTION_LABEL,
  checkStatementAgainstCode,
  contradictionSourceOf,
} from '../lib/statement-contradiction';

/**
 * The contradiction check of roadmap 17.10 — pure, against ABAP written for
 * this file and nowhere else (no benchmark case, no corpus case: a rule tuned
 * against the case it is tested on proves nothing).
 *
 * Every rule gets two kinds of test: it fires where the code settles the
 * matter, and it stays silent where anything at the anchors could make the
 * sentence true after all. The second kind is the one that matters — a mark
 * that is wrong teaches the reader to ignore marks.
 */

const lines = (...n: number[]) => n.map((l) => ({ lineStart: l, lineEnd: l }));
const check = (source: string, text: string, anchors: number[]) =>
  checkStatementAgainstCode(contradictionSourceOf(source), { text, anchors: lines(...anchors) });

const FORM_INTO = [
  'FORM pruefen_kopf.',                               // 1
  '  IF gs_kopf-werk IS INITIAL.',                     // 2
  '    gv_fehler = abap_true.',                        // 3
  '    MESSAGE e417(zpp) INTO gv_dummy.',              // 4
  '    RETURN.',                                       // 5
  '  ENDIF.',                                          // 6
  '  IF gs_kopf-menge = 0.',                           // 7
  "    MESSAGE e418(zpp) INTO gv_dummy.",              // 8
  "    WRITE: / 'Menge fehlt'.",                       // 9
  '  ENDIF.',                                          // 10
  'ENDFORM.',                                          // 11
].join('\n');

test.describe('message-into: "displayed" at MESSAGE … INTO', () => {
  test('contradicts when the anchored branch only fills the message variables', () => {
    const mark = check(FORM_INTO, 'Fehlt das Werk, wird ein Fehlerkennzeichen gesetzt und die Fehlermeldung E417(ZPP) ausgegeben.', [2]);
    expect(mark).toMatchObject({ verdict: 'contradicts', rule: 'message-into' });
    expect(mark?.lines).toEqual([{ lineStart: 4, lineEnd: 4 }]);
  });

  test('silent when the branch also writes to the list — "displayed" may be about that', () => {
    expect(check(FORM_INTO, 'Ist die Menge null, wird eine Meldung ausgegeben.', [7])).toBeNull();
  });

  test('silent when the sentence says nothing is displayed', () => {
    expect(check(FORM_INTO, 'Fehlt das Werk, wird keine Meldung angezeigt, sondern nur vermerkt.', [2])).toBeNull();
  });

  test('silent when the sentence does not claim display at all', () => {
    expect(check(FORM_INTO, 'Fehlt das Werk, wird die Meldung E417(ZPP) für das Protokoll bereitgestellt.', [2])).toBeNull();
  });
});

test.describe('message-raising: "displayed" at MESSAGE … RAISING', () => {
  const FM = [
    'FUNCTION z_lese_lagerplatz.',                                  // 1
    '  SELECT SINGLE * FROM zlagerplatz INTO es_platz',             // 2
    '    WHERE platz = iv_platz.',                                  // 3
    '  IF sy-subrc <> 0.',                                          // 4
    '    MESSAGE e020(zlg) WITH iv_platz RAISING platz_unbekannt.', // 5
    '  ENDIF.',                                                     // 6
    'ENDFUNCTION.',                                                 // 7
  ].join('\n');

  test('is not supported: the caller may handle the exception and nothing is shown', () => {
    const mark = check(FM, 'Gibt es den Lagerplatz nicht, wird die Fehlermeldung E020 ausgegeben und die Ausnahme PLATZ_UNBEKANNT ausgelöst.', [4]);
    expect(mark).toMatchObject({ verdict: 'unsupported', rule: 'message-raising' });
  });

  test('silent about the exception alone', () => {
    expect(check(FM, 'Gibt es den Lagerplatz nicht, wird die Ausnahme PLATZ_UNBEKANNT ausgelöst.', [4])).toBeNull();
  });
});

test.describe('write-to: "output" at WRITE … TO', () => {
  const SRC = [
    'FORM betrag_aufbereiten.',                       // 1
    '  WRITE gv_betrag TO gv_text CURRENCY gv_waers.', // 2
    '  CONDENSE gv_text.',                             // 3
    'ENDFORM.',                                        // 4
    'FORM betrag_drucken.',                            // 5
    '  WRITE: / gv_betrag CURRENCY gv_waers.',         // 6
    'ENDFORM.',                                        // 7
  ].join('\n');

  test('contradicts: WRITE … TO formats into a field and prints nothing', () => {
    expect(check(SRC, 'Der Betrag wird in der Belegwährung ausgegeben.', [2])).toMatchObject({ verdict: 'contradicts', rule: 'write-to' });
  });

  test('silent at a real list output', () => {
    expect(check(SRC, 'Der Betrag wird in der Belegwährung ausgegeben.', [6])).toBeNull();
  });
});

test.describe('program-end: "the program ends" at an exit that leaves one block', () => {
  const REPORT = [
    'REPORT z_bestand_liste.',             // 1
    'START-OF-SELECTION.',                 // 2
    '  SELECT * FROM zbestand INTO TABLE gt_bestand.', // 3
    '  IF gt_bestand IS INITIAL.',         // 4
    '    MESSAGE s010(zbs).',              // 5
    '    RETURN.',                         // 6
    '  ENDIF.',                            // 7
    '  PERFORM summieren.',                // 8
    'END-OF-SELECTION.',                   // 9
    '  PERFORM protokoll_zeigen.',         // 10
    'FORM summieren.',                     // 11
    '  CHECK gv_modus = abap_true.',       // 12
    '  RETURN.',                           // 13
    'ENDFORM.',                            // 14
  ].join('\n');

  test('contradicts: RETURN in START-OF-SELECTION, and END-OF-SELECTION still runs', () => {
    const mark = check(REPORT, 'Wurde kein Bestand gefunden, wird die Meldung S010 ausgegeben und das Programm beendet.', [4]);
    expect(mark).toMatchObject({ verdict: 'contradicts', rule: 'program-end' });
    expect(mark?.reason).toContain('line 9');
  });

  test('not supported: RETURN in a routine leaves the routine', () => {
    expect(check(REPORT, 'Danach wird das Programm beendet.', [13])).toMatchObject({ verdict: 'unsupported', rule: 'program-end' });
  });

  test('silent without END-OF-SELECTION — then the RETURN may well end the run', () => {
    const noEnd = REPORT.split('\n').slice(0, 8).join('\n');
    expect(check(noEnd, 'Wurde kein Bestand gefunden, wird das Programm beendet.', [4])).toBeNull();
  });

  test('silent when the sentence only says the step stops', () => {
    expect(check(REPORT, 'Wurde kein Bestand gefunden, wird die Verarbeitung dieses Schritts abgebrochen.', [4])).toBeNull();
  });

  test('silent at LEAVE PROGRAM', () => {
    const leave = REPORT.replace('    RETURN.', '    LEAVE PROGRAM.');
    expect(check(leave, 'Wurde kein Bestand gefunden, wird das Programm beendet.', [4])).toBeNull();
  });
});

test.describe('persistence: "posted / in the database" where the anchors only read and decide', () => {
  const SRC = [
    'FORM kunde_pruefen.',                                           // 1
    '  SELECT SINGLE kunnr FROM kna1 INTO gv_kunnr WHERE kunnr = p_kunnr.', // 2
    '  IF sy-subrc <> 0.',                                           // 3
    '    gv_status = 3.',                                            // 4
    '  ENDIF.',                                                      // 5
    'ENDFORM.',                                                      // 6
    'FORM status_sichern.',                                          // 7
    "  IF gv_status = 3.",                                           // 8
    '    MODIFY zkunde_status FROM gs_status.',                      // 9
    '  ENDIF.',                                                      // 10
    'ENDFORM.',                                                      // 11
  ].join('\n');

  test('not supported: a status assigned in a branch is not stored in the database', () => {
    expect(check(SRC, 'Fehlt der Kunde, wird der Status 3 in der Datenbank gespeichert.', [3])).toMatchObject({ verdict: 'unsupported', rule: 'persistence' });
  });

  test('silent where a write stands at the anchors', () => {
    expect(check(SRC, 'Ist der Status 3, wird er in der Datenbank gespeichert.', [8])).toBeNull();
  });

  test('silent about an internal variable — "gespeichert" alone is not a database claim', () => {
    expect(check(SRC, 'Fehlt der Kunde, wird der Status 3 im Feld gespeichert.', [3])).toBeNull();
  });
});

test.describe('not-raised: an exception or event the source never names', () => {
  const SRC = [
    'METHOD pruefe_charge.',                       // 1
    '  IF iv_charge IS INITIAL.',                  // 2
    '    RAISE EXCEPTION TYPE zcx_charge_fehlt.',  // 3
    '  ENDIF.',                                    // 4
    'ENDMETHOD.',                                  // 5
  ].join('\n');

  test('contradicts an invented exception name', () => {
    expect(check(SRC, 'Fehlt die Charge, wird die Ausnahme CHARGE_GESPERRT ausgelöst.', [2])).toMatchObject({ verdict: 'contradicts', rule: 'not-raised' });
  });

  test('silent at the exception the code raises', () => {
    expect(check(SRC, 'Fehlt die Charge, wird die Ausnahme ZCX_CHARGE_FEHLT ausgelöst.', [2])).toBeNull();
  });

  test('silent about an ordinary word after "Ausnahme"', () => {
    expect(check(SRC, 'Fehlt die Charge, wird eine Ausnahme ausgelöst.', [2])).toBeNull();
  });
});

test.describe('display-transaction: "created" at a transaction that displays', () => {
  const SRC = [
    'AT LINE-SELECTION.',                               // 1
    "  SET PARAMETER ID 'AUN' FIELD gs_liste-vbeln.",   // 2
    "  CALL TRANSACTION 'VA03' AND SKIP FIRST SCREEN.", // 3
    'FORM anlegen.',                                    // 4
    "  CALL TRANSACTION 'VA01'.",                       // 5
    'ENDFORM.',                                         // 6
  ].join('\n');

  test('not supported: VA03 displays the order', () => {
    expect(check(SRC, 'Per Doppelklick wird der Kundenauftrag angelegt.', [2, 3])).toMatchObject({ verdict: 'unsupported', rule: 'display-transaction' });
  });

  test('silent at VA01', () => {
    expect(check(SRC, 'Der Kundenauftrag wird angelegt.', [5])).toBeNull();
  });
});

test('the sentence without anchors, or anchors on no statement, is never marked', () => {
  expect(check(FORM_INTO, 'Die Fehlermeldung E417 wird ausgegeben.', [])).toBeNull();
  expect(check(`${FORM_INTO}\n\n* Kommentar`, 'Die Fehlermeldung E417 wird ausgegeben.', [13])).toBeNull();
});

test('two verdicts, one wording each, in the interface language', () => {
  expect(CONTRADICTION_LABEL).toEqual({ contradicts: 'Contradicts the evidence', unsupported: 'Not supported by the code' });
});

test('the module is pure: no network, no model, no clock', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'statement-contradiction.ts'), 'utf8');
  const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  expect(imports).toEqual(['./abap/statement-reader']);
  expect(src).not.toMatch(/\bfetch\(|Date\.now|new Date\(|gemini/i);
});

test.describe('QA review of 8f9ea35a000e', () => {
  test('a4cdb3b68967: a named MESSAGE … INTO whose text the branch writes out is not marked', () => {
    const src = [
      'FORM melden.',                                  // 1
      '  IF gv_menge < 0.',                            // 2
      '    MESSAGE e417(zpp) INTO gv_text.',           // 3
      '    WRITE: / gv_text.',                         // 4
      '  ENDIF.',                                      // 5
      'ENDFORM.',                                      // 6
    ].join('\n');
    expect(check(src, 'Ist die Menge negativ, wird die Fehlermeldung E417 ausgegeben.', [2])).toBeNull();
    // Without the WRITE the same sentence is still a contradiction.
    const quiet = src.replace('    WRITE: / gv_text.\n', '');
    expect(check(quiet, 'Ist die Menge negativ, wird die Fehlermeldung E417 ausgegeben.', [2])).toMatchObject({ rule: 'message-into' });
  });

  test('61f4478991ab: a read-only SELECT does not silence the persistence rule', () => {
    const src = [
      'FORM status_lesen.',                                              // 1
      '  SELECT SINGLE status FROM zauftrag INTO gv_status WHERE id = p_id.', // 2
      "  IF gv_status = 'F'.",                                           // 3
      "    gv_neu = 'A'.",                                               // 4
      '  ENDIF.',                                                        // 5
      'ENDFORM.',                                                        // 6
    ].join('\n');
    expect(check(src, 'Ist der Auftrag fertig, wird der Status A in der Datenbank gespeichert.', [2, 3]))
      .toMatchObject({ verdict: 'unsupported', rule: 'persistence' });
  });

  test('6fa011d784f8: a customer transaction ending in 03 is never assumed to display', () => {
    const src = [
      'FORM anlegen.',                       // 1
      "  CALL TRANSACTION 'ZVA03'.",         // 2
      "  CALL TRANSACTION 'ZZ3'.",           // 3
      'ENDFORM.',                            // 4
    ].join('\n');
    expect(check(src, 'Der Auftrag wird angelegt.', [2])).toBeNull();
    expect(check(src, 'Der Auftrag wird angelegt.', [3])).toBeNull();
  });
});

/*
 * Owner decision 01.10.2026 ("alles Englisch"): the model writes its business
 * statements in English (prompt version 2). Every rule above is held again on
 * English wording — firing where the code settles it, silent where it does not.
 * The German cases above stay: a sentence in either language is judged alike.
 */
test.describe('the same rules on English sentences', () => {
  test('message-into: contradicts "is output" at MESSAGE … INTO, silent at "no message is displayed"', () => {
    expect(check(FORM_INTO, 'If the plant is missing, an error flag is set and the error message E417(ZPP) is output.', [2]))
      .toMatchObject({ verdict: 'contradicts', rule: 'message-into' });
    expect(check(FORM_INTO, 'If the quantity is zero, a message is output.', [7])).toBeNull();
    expect(check(FORM_INTO, 'If the plant is missing, no message is displayed; it is only noted.', [2])).toBeNull();
    expect(check(FORM_INTO, 'If the plant is missing, the message E417(ZPP) is provided for the log.', [2])).toBeNull();
  });

  test('message-raising: not supported when the message is said to be output with the exception', () => {
    const fm = [
      'FUNCTION z_lese_lagerplatz.',
      '  SELECT SINGLE * FROM zlagerplatz INTO es_platz',
      '    WHERE platz = iv_platz.',
      '  IF sy-subrc <> 0.',
      '    MESSAGE e020(zlg) WITH iv_platz RAISING platz_unbekannt.',
      '  ENDIF.',
      'ENDFUNCTION.',
    ].join('\n');
    expect(check(fm, 'If the storage bin does not exist, the error message E020 is output and the exception PLATZ_UNBEKANNT is raised.', [4]))
      .toMatchObject({ verdict: 'unsupported', rule: 'message-raising' });
    expect(check(fm, 'If the storage bin does not exist, the exception PLATZ_UNBEKANNT is raised.', [4])).toBeNull();
  });

  test('write-to: contradicts "is output" at WRITE … TO, silent at a real list output', () => {
    const src = [
      'FORM betrag_aufbereiten.',
      '  WRITE gv_betrag TO gv_text CURRENCY gv_waers.',
      '  CONDENSE gv_text.',
      'ENDFORM.',
      'FORM betrag_drucken.',
      '  WRITE: / gv_betrag CURRENCY gv_waers.',
      'ENDFORM.',
    ].join('\n');
    expect(check(src, 'The amount is output in the document currency.', [2])).toMatchObject({ verdict: 'contradicts', rule: 'write-to' });
    expect(check(src, 'The amount is output in the document currency.', [6])).toBeNull();
  });

  test('program-end: "the program ends" at a RETURN that leaves one block', () => {
    const report = [
      'REPORT z_bestand_liste.',
      'START-OF-SELECTION.',
      '  SELECT * FROM zbestand INTO TABLE gt_bestand.',
      '  IF gt_bestand IS INITIAL.',
      '    MESSAGE s010(zbs).',
      '    RETURN.',
      '  ENDIF.',
      'END-OF-SELECTION.',
      '  PERFORM protokoll_zeigen.',
    ].join('\n');
    expect(check(report, 'If no stock was found, the message S010 is output and the program is ended.', [4]))
      .toMatchObject({ verdict: 'contradicts', rule: 'program-end' });
    expect(check(report, 'If no stock was found, the processing of this step is stopped.', [4])).toBeNull();
  });

  test('persistence: "stored in the database" where the anchors only read and decide', () => {
    const src = [
      'FORM kunde_pruefen.',
      '  SELECT SINGLE kunnr FROM kna1 INTO gv_kunnr WHERE kunnr = p_kunnr.',
      '  IF sy-subrc <> 0.',
      '    gv_status = 3.',
      '  ENDIF.',
      'ENDFORM.',
      'FORM status_sichern.',
      "  IF gv_status = 3.",
      '    MODIFY zkunde_status FROM gs_status.',
      '  ENDIF.',
      'ENDFORM.',
    ].join('\n');
    expect(check(src, 'If the customer is missing, status 3 is stored in the database.', [3]))
      .toMatchObject({ verdict: 'unsupported', rule: 'persistence' });
    expect(check(src, 'If the status is 3, it is stored in the database.', [8])).toBeNull();
    expect(check(src, 'If the customer is missing, status 3 is stored in the field.', [3])).toBeNull();
  });

  test('not-raised: an invented exception name, not the one the code raises', () => {
    const src = [
      'METHOD pruefe_charge.',
      '  IF iv_charge IS INITIAL.',
      '    RAISE EXCEPTION TYPE zcx_charge_fehlt.',
      '  ENDIF.',
      'ENDMETHOD.',
    ].join('\n');
    expect(check(src, 'If the batch is missing, the exception CHARGE_GESPERRT is raised.', [2]))
      .toMatchObject({ verdict: 'contradicts', rule: 'not-raised' });
    expect(check(src, 'If the batch is missing, the exception ZCX_CHARGE_FEHLT is raised.', [2])).toBeNull();
    expect(check(src, 'If the batch is missing, an exception is raised.', [2])).toBeNull();
  });

  test('display-transaction: "created" at VA03, silent at VA01', () => {
    const src = [
      'AT LINE-SELECTION.',
      "  SET PARAMETER ID 'AUN' FIELD gs_liste-vbeln.",
      "  CALL TRANSACTION 'VA03' AND SKIP FIRST SCREEN.",
      'FORM anlegen.',
      "  CALL TRANSACTION 'VA01'.",
      'ENDFORM.',
    ].join('\n');
    expect(check(src, 'A double click creates the sales order.', [2, 3])).toMatchObject({ verdict: 'unsupported', rule: 'display-transaction' });
    expect(check(src, 'The sales order is created.', [5])).toBeNull();
  });
});
