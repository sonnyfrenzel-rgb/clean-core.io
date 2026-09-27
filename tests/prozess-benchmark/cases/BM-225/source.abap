REPORT zfi_umbuchung_vormerk.
*----------------------------------------------------------------------*
* Umbuchungen aus Vormerktabelle ZFI_UMB_VORM buchen
* (Sachkonto -> Sachkonto mit Kostenstelle), Monatsabschluss
*----------------------------------------------------------------------*
PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
            p_monat TYPE monat OBLIGATORY,
            p_gjahr TYPE gjahr OBLIGATORY.

DATA: gt_vorm   TYPE STANDARD TABLE OF zfi_umb_vorm,
      gs_vorm   TYPE zfi_umb_vorm,
      gs_header TYPE bapiache09,
      gt_gl     TYPE STANDARD TABLE OF bapiacgl09,
      gs_gl     TYPE bapiacgl09,
      gt_curr   TYPE STANDARD TABLE OF bapiaccr09,
      gs_curr   TYPE bapiaccr09,
      gt_return TYPE STANDARD TABLE OF bapiret2,
      gv_objkey TYPE bapiache09-obj_key,
      gv_fehler TYPE xfeld.

START-OF-SELECTION.
  SELECT * FROM zfi_umb_vorm INTO TABLE gt_vorm
    WHERE bukrs  = p_bukrs
      AND gjahr  = p_gjahr
      AND monat  = p_monat
      AND status = 'O'.
  IF sy-subrc <> 0.
    MESSAGE i200(zfi).
    STOP.
  ENDIF.

  LOOP AT gt_vorm INTO gs_vorm.
    PERFORM beleg_aufbauen.

    CALL FUNCTION 'BAPI_ACC_DOCUMENT_CHECK'
      EXPORTING
        documentheader = gs_header
      TABLES
        accountgl      = gt_gl
        currencyamount = gt_curr
        return         = gt_return.
    READ TABLE gt_return TRANSPORTING NO FIELDS
      WITH KEY type = 'E'.
    IF sy-subrc = 0.
      gv_fehler = 'X'.
      WRITE: / gs_vorm-lfdnr, 'Pruefung fehlgeschlagen'.
      CONTINUE.
    ENDIF.

    CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'
      EXPORTING
        documentheader = gs_header
      IMPORTING
        obj_key        = gv_objkey
      TABLES
        accountgl      = gt_gl
        currencyamount = gt_curr
        return         = gt_return.
    READ TABLE gt_return TRANSPORTING NO FIELDS
      WITH KEY type = 'E'.
    IF sy-subrc = 0.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      gv_fehler = 'X'.
      WRITE: / gs_vorm-lfdnr, 'Buchung fehlgeschlagen'.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = 'X'.
      UPDATE zfi_umb_vorm SET status = 'B'
                              belnr  = gv_objkey(10)
        WHERE lfdnr = gs_vorm-lfdnr.
      WRITE: / gs_vorm-lfdnr, 'gebucht', gv_objkey.
    ENDIF.
  ENDLOOP.

* IF gv_fehler = 'X'.
*   MESSAGE s201(zfi) DISPLAY LIKE 'E'.
* ENDIF.

*&---------------------------------------------------------------------*
FORM beleg_aufbauen.
  CLEAR: gs_header, gt_gl, gt_curr, gt_return.
  gs_header-comp_code  = gs_vorm-bukrs.
  gs_header-doc_date   = sy-datum.
  gs_header-pstng_date = gs_vorm-budat.
  gs_header-doc_type   = 'SA'.
  gs_header-username   = sy-uname.
  gs_header-header_txt = 'Umbuchung Vormerkung'.

  gs_gl-itemno_acc = 1.
  gs_gl-gl_account = gs_vorm-hkont_von.
  gs_gl-costcenter = gs_vorm-kostl_von.
  APPEND gs_gl TO gt_gl.
  gs_gl-itemno_acc = 2.
  gs_gl-gl_account = gs_vorm-hkont_nach.
  gs_gl-costcenter = gs_vorm-kostl_nach.
  APPEND gs_gl TO gt_gl.

  gs_curr-itemno_acc = 1.
  gs_curr-currency   = gs_vorm-waers.
  gs_curr-amt_doccur = gs_vorm-betrag * -1.
  APPEND gs_curr TO gt_curr.
  gs_curr-itemno_acc = 2.
  gs_curr-amt_doccur = gs_vorm-betrag.
  APPEND gs_curr TO gt_curr.
ENDFORM.
