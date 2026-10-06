import { test, expect } from '@playwright/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { humaniseField, humaniseRoutine, plainLabels, stepName, MAX_LABEL, ORIGINAL_NOTE_ROOM } from '../lib/abap/plain-language';
import {
  isUntranslatable,
  translateGermanText,
  translateGermanWords,
  UNTRANSLATABLE,
} from '../lib/abap/german-terms';

/**
 * German ABAP names in English (owner report 06.10.2026).
 *
 * A German-named report showed "Daten lesen", "ALV list ausgabe" and "Any
 * ausgabes?" in its process overview. Everything shown is English; the German
 * original may follow in parentheses; a name that cannot be read in full is
 * shown as the identifier, never as a German/English pseudo-word.
 *
 * Pure: no browser, no server, no model.
 */

const REPORT = `REPORT zsd_lieferstatus.
TYPES: BEGIN OF ty_ausgabe,
         vbeln TYPE vbak-vbeln,
         lfdat TYPE likp-lfdat,
       END OF ty_ausgabe.
DATA: gt_ausgabe  TYPE STANDARD TABLE OF ty_ausgabe,
      gt_fieldcat TYPE slis_t_fieldcat_alv.
SELECT-OPTIONS s_vbeln FOR vbak-vbeln.

START-OF-SELECTION.
  PERFORM daten_lesen.
  PERFORM daten_aufbereiten.
  IF gt_ausgabe[] IS NOT INITIAL.
    PERFORM feldkatalog_aufbauen.
    PERFORM alv_ausgabe.
  ENDIF.

FORM daten_lesen.
  SELECT vbeln FROM vbak INTO CORRESPONDING FIELDS OF TABLE gt_ausgabe WHERE vbeln IN s_vbeln.
ENDFORM.

FORM daten_aufbereiten.
  LOOP AT gt_ausgabe ASSIGNING FIELD-SYMBOL(<ls_ausgabe>).
    <ls_ausgabe>-lfdat = sy-datum.
  ENDLOOP.
ENDFORM.

FORM feldkatalog_aufbauen.
  CLEAR gt_fieldcat.
ENDFORM.

FORM alv_ausgabe.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program      = sy-repid
      i_callback_user_command = 'USER_COMMAND'
      it_fieldcat             = gt_fieldcat
    TABLES
      t_outtab                = gt_ausgabe.
ENDFORM.

FORM user_command USING r_ucomm LIKE sy-ucomm rs_selfield TYPE slis_selfield.
  CASE r_ucomm.
    WHEN '&IC1'.
      CALL TRANSACTION 'VA03' AND SKIP FIRST SCREEN.
    WHEN 'ERLED'.
      PERFORM status_erledigt_setzen.
    WHEN 'LDATUM'.
      PERFORM lieferdatum_aendern.
  ENDCASE.
ENDFORM.

FORM status_erledigt_setzen.
  MESSAGE 'Status wurde gesetzt' TYPE 'S'.
ENDFORM.

FORM lieferdatum_aendern.
  DATA lt_fields TYPE STANDARD TABLE OF sval.
  CALL FUNCTION 'POPUP_GET_VALUES'
    EXPORTING popup_title = 'Lieferdatum'
    TABLES fields = lt_fields.
  IF sy-subrc <> 0.
    MESSAGE 'Keine Daten gefunden' TYPE 'E'.
  ENDIF.
ENDFORM.
`;

test.describe('German names — the owner example', () => {
  test('the steps of the process overview read English, the German original in parentheses', () => {
    expect(humaniseRoutine('DATEN_LESEN')).toBe('Read data (Daten lesen)');
    expect(humaniseRoutine('DATEN_AUFBEREITEN')).toBe('Prepare data (Daten aufbereiten)');
    expect(humaniseRoutine('FELDKATALOG_AUFBAUEN')).toBe('Build field catalog (Feldkatalog aufbauen)');
    expect(humaniseRoutine('ALV_AUSGABE')).toBe('Output ALV list (ALV-Ausgabe)');
    expect(humaniseRoutine('STATUS_ERLEDIGT_SETZEN')).toBe('Set status to completed (Status erledigt setzen)');
    expect(humaniseRoutine('LIEFERDATUM_AENDERN')).toBe('Change delivery date (Lieferdatum ändern)');
    expect(humaniseRoutine('lieferdatum_aendern')).toBe('Change delivery date (Lieferdatum ändern)');
  });

  test('the decisions read English: output lines, the user command, function codes as identifiers', () => {
    const skeleton = buildProcessSkeleton(REPORT);
    const labels = plainLabels(skeleton, REPORT);
    const label = (kind: string, technical: RegExp) => {
      const node = skeleton.nodes.find((n) => n.kind === kind && technical.test(n.label));
      expect(node, `${kind} ${technical}`).toBeDefined();
      return labels.nodes.get(node?.id ?? '') ?? '';
    };
    expect(label('gateway', /gt_ausgabe/)).toBe('Any output lines?');
    expect(label('gateway', /^r_ucomm$/)).toBe('User command?');
    expect(label('user-task', /^ALV_AUSGABE$/)).toBe('Output ALV list (ALV-Ausgabe)');
    expect(label('user-task', /^LIEFERDATUM_AENDERN$/)).toBe('Change delivery date (Lieferdatum ändern)');
    expect(label('user-task', /^POPUP_GET_VALUES$/)).toBe('Ask for values');
    expect(label('end-error', /MESSAGE/)).toBe('Stop: no data found');

    const command = skeleton.nodes.find((n) => n.kind === 'gateway' && n.label === 'r_ucomm');
    const arms = skeleton.edges.filter((e) => e.from === command?.id).map((e) => labels.flow(e));
    expect(arms).toEqual(expect.arrayContaining(['Double-click (&IC1)', 'ERLED', 'LDATUM']));

    // The line anchors and the technical names are untouched.
    const routine = skeleton.nodes.find((n) => n.label === 'LIEFERDATUM_AENDERN' && n.kind === 'user-task');
    expect(labels.technical(routine?.id ?? '')).toBe('LIEFERDATUM_AENDERN');
    expect(routine?.anchor?.lineStart).toBe(REPORT.split('\n').findIndex((l) => /PERFORM lieferdatum_aendern/.test(l)) + 1);
  });

  test('no label of the example mixes German and English', () => {
    const skeleton = buildProcessSkeleton(REPORT);
    const labels = plainLabels(skeleton, REPORT);
    const german = /\b(daten|lesen|aufbereiten|aufbauen|ausgabe|ausgabes|erledigt|setzen|aendern|lieferdatum|feldkatalog|ucomm)\b/i;
    for (const node of skeleton.nodes) {
      const text = labels.nodes.get(node.id) ?? '';
      // The German original is allowed in parentheses — and only there.
      const english = text.replace(/\s*\([^()]*\)$/, '');
      expect(english, `${node.label} → ${text}`).not.toMatch(german);
      expect(text.length, text).toBeLessThanOrEqual(MAX_LABEL + ORIGINAL_NOTE_ROOM);
      expect(english.length, text).toBeLessThanOrEqual(MAX_LABEL);
    }
  });
});

test.describe('German names — the translation itself', () => {
  test('German word order: the verb at the end goes to the front', () => {
    expect(translateGermanWords(['kunden', 'pruefen'])).toEqual({ english: 'Check customers', original: 'Kunden prüfen' });
    expect(translateGermanWords(['berechtigung', 'pruefen'])).toEqual({ english: 'Check authorization', original: 'Berechtigung prüfen' });
    expect(translateGermanWords(['pruefe', 'auftrag'])).toEqual({ english: 'Check order', original: 'Prüfe Auftrag' });
    expect(translateGermanWords(['auftrag', 'neu', 'einplanen'])).toEqual({ english: 'Schedule order again', original: 'Auftrag neu einplanen' });
    expect(translateGermanWords(['markierte', 'freigeben'])).toEqual({ english: 'Release marked entries', original: 'Markierte freigeben' });
  });

  test('umlauts: spelled out or written, the same word', () => {
    expect(translateGermanWords(['preise', 'aendern'])).toEqual({ english: 'Change prices', original: 'Preise ändern' });
    expect(translateGermanWords(['preise', 'ändern'])).toEqual({ english: 'Change prices', original: 'Preise ändern' });
    expect(translateGermanWords(['periode', 'schliessen'])).toEqual({ english: 'Close period', original: 'Periode schließen' });
  });

  test('compound nouns and inflected adjectives', () => {
    expect(translateGermanWords(['steuerkonten', 'abstimmen'])).toEqual({ english: 'Reconcile tax accounts', original: 'Steuerkonten abstimmen' });
    expect(translateGermanWords(['buchungslauf', 'einplanen'])).toEqual({ english: 'Schedule posting run', original: 'Buchungslauf einplanen' });
    expect(translateGermanWords(['offene', 'posten', 'lesen'])).toEqual({ english: 'Read open items', original: 'Offene Posten lesen' });
    expect(translateGermanWords(['lieferdatum'], 'field')).toEqual({ english: 'Delivery date', original: 'Lieferdatum' });
  });

  test('a verbal noun alone is the step, next to a verb it is the object', () => {
    expect(translateGermanWords(['ausgabe'])).toEqual({ english: 'Output', original: 'Ausgabe' });
    expect(translateGermanWords(['ausgabe'], 'item')).toEqual({ english: 'Output line', original: 'Ausgabe' });
    expect(translateGermanWords(['abrechnung', 'berechnen'])).toEqual({ english: 'Calculate settlement', original: 'Abrechnung berechnen' });
  });

  test('a name mixing English and German is translated; its original is the identifier', () => {
    expect(translateGermanWords(['get', 'daten'])).toEqual({ english: 'Get data', original: null });
    expect(humaniseRoutine('GET_DATEN')).toBe('Get data (GET_DATEN)');
  });

  test('never a pseudo-word: a German name with an unknown word is shown as written', () => {
    expect(translateGermanWords(['trommel', 'xyzzy', 'ermitteln'])).toBe(UNTRANSLATABLE);
    expect(isUntranslatable(translateGermanWords(['xyzzy', 'lesen']))).toBe(true);
    expect(humaniseRoutine('XYZZY_LESEN')).toBe('XYZZY_LESEN');
    expect(humaniseField('gv_xyzzy_daten')).toBe('XYZZY_DATEN');
    // An unknown three-letter word is not an abbreviation (QA review of 1c402c400e05).
    expect(humaniseRoutine('GUT_DATEN_LESEN')).toBe('GUT_DATEN_LESEN');
  });

  test('English names are not touched', () => {
    for (const words of [['read', 'requisition'], ['check', 'authority'], ['select', 'all'], ['charge', 'customer'], ['status']]) {
      expect(translateGermanWords(words), words.join('_')).toBeNull();
    }
    expect(humaniseRoutine('READ_REQUISITION')).toBe('Read requisition');
    expect(humaniseRoutine('Z_CREDIT_EXPOSURE_READ')).toBe('Credit exposure read');
    expect(humaniseRoutine('CONSTRUCTOR')).toBe('Constructor');
  });

  test('variables: states, directions, the user command', () => {
    expect(humaniseField('gv_erledigt')).toBe('Completed');
    expect(humaniseField('lv_lgort_von')).toBe('Storage location from');
    expect(humaniseField('von')).toBe('From');
    expect(humaniseField('r_ucomm')).toBe('User command');
    expect(humaniseField('ok_code')).toBe('User command');
    expect(humaniseField('gs_kopf-lifnr')).toBe('Supplier number');
  });

  test('message texts: word by word when every word is known, else as written', () => {
    expect(translateGermanText('Keine Daten gefunden')?.english).toBe('No data found');
    expect(translateGermanText('Bitte Werk eingeben')?.english).toBe('Please enter plant');
    expect(translateGermanText('Fehler beim Lesen der Datei')?.english).toBe('Error when reading file');
    expect(translateGermanText('Job konnte nicht angelegt werden')?.english).toBe('Job could not be created');
    expect(translateGermanText('Xyzzy nicht gefunden')).toBeNull();
    expect(translateGermanText('No data found')).toBeNull();
  });

  test('deterministic and total', () => {
    expect(translateGermanWords([])).toBeNull();
    expect(translateGermanWords(undefined as unknown as string[])).toBeNull();
    expect(translateGermanText(undefined as unknown as string)).toBeNull();
    expect(translateGermanWords(['constructor', 'tostring'])).toBeNull();
    expect(stepName({ id: 'n', kind: 'task', label: 'DATEN_LESEN' } as never)).toBe('Read data (Daten lesen)');
  });
});
