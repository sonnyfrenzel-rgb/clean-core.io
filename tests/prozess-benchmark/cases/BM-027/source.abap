REPORT zmm_po_sammelfreigabe.
*----------------------------------------------------------------------*
* Sammelfreigabe Bestellungen fuer einen Freigabecode
* Nur Bestellungen, bei denen der eigene Code als naechster dran ist.
* (Ersatz fuer ME28 im Werk Nord, Wunsch Einkaufsleitung 2013)
*----------------------------------------------------------------------*
TABLES ekko.
SELECT-OPTIONS: s_ebeln FOR ekko-ebeln,
                s_ekorg FOR ekko-ekorg.
PARAMETERS: p_frggr TYPE ekko-frggr OBLIGATORY,
            p_frgco TYPE t16fs-frgc1 OBLIGATORY.

DATA: gt_ekko   TYPE STANDARD TABLE OF ekko,
      gs_ekko   TYPE ekko,
      gs_t16fs  TYPE t16fs,
      gv_pos    TYPE i,
      gv_rel    TYPE bapimmpara-rel_status,
      gt_return TYPE STANDARD TABLE OF bapireturn,
      gv_ok     TYPE i,
      gv_err    TYPE i.

FIELD-SYMBOLS <lv_code> TYPE t16fs-frgc1.

START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'M_EINK_FRG'
    ID 'FRGGR' FIELD p_frggr
    ID 'FRGCO' FIELD p_frgco.
  IF sy-subrc <> 0.
    MESSAGE e010(zmm) WITH p_frgco.
  ENDIF.

  SELECT * FROM ekko INTO TABLE gt_ekko
    WHERE ebeln IN s_ebeln
      AND ekorg IN s_ekorg
      AND frggr = p_frggr
      AND frgke = 'B'
      AND loekz = space.

  LOOP AT gt_ekko INTO gs_ekko.
*   Position des eigenen Codes in der Strategie bestimmen
    SELECT SINGLE * FROM t16fs INTO gs_t16fs
      WHERE frggr = gs_ekko-frggr
        AND frgsx = gs_ekko-frgsx.
    CHECK sy-subrc = 0.
    CLEAR gv_pos.
    DO 8 TIMES.
      ASSIGN COMPONENT sy-index + 3 OF STRUCTURE gs_t16fs TO <lv_code>.
      IF <lv_code> = p_frgco.
        gv_pos = sy-index.
        EXIT.
      ENDIF.
    ENDDO.
*   FRGZU enthaelt je erteilter Freigabe ein 'X'
    IF gv_pos = 0 OR strlen( gs_ekko-frgzu ) <> gv_pos - 1.
      CONTINUE.
    ENDIF.

    CLEAR gt_return.
    CALL FUNCTION 'BAPI_PO_RELEASE'
      EXPORTING
        purchaseorder = gs_ekko-ebeln
        po_rel_code   = p_frgco
      IMPORTING
        rel_status_new = gv_rel
      TABLES
        return        = gt_return
      EXCEPTIONS
        authority_check_fail   = 1
        document_not_found     = 2
        enqueue_fail           = 3
        prerequisite_fail      = 4
        release_already_posted = 5
        responsibility_fail    = 6
        OTHERS                 = 7.
    IF sy-subrc = 0.
      gv_ok = gv_ok + 1.
      WRITE: / gs_ekko-ebeln, 'freigegeben, neuer Status', gv_rel.
    ELSE.
      gv_err = gv_err + 1.
      WRITE: / gs_ekko-ebeln, 'nicht freigegeben, Grund', sy-subrc.
    ENDIF.
  ENDLOOP.

  ULINE.
  WRITE: / 'Freigegeben:', gv_ok, 'Fehler:', gv_err.
