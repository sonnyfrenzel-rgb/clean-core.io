*&---------------------------------------------------------------------*
*&  Include  ZFI_BANKSTMT_IN_F02 - Buchen mit Wiederholung
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&  Form POST_LINES - ab Wiederaufsetzpunkt, Abbruch bei erstem Fehler
*&---------------------------------------------------------------------*
FORM post_lines USING    pv_name   TYPE eps2filnam
                         pv_start  TYPE i
                CHANGING pv_errors TYPE i.
  DATA: ls_stmt  TYPE ty_stmt,
        lv_ok    TYPE abap_bool,
        lv_msg   TYPE bapi_msg,
        lv_belnr TYPE belnr_d,
        ls_chk   TYPE zfi_stmt_chkpt,
        ls_err   TYPE zfi_stmt_err,
        lv_from  TYPE i.

  CLEAR pv_errors.
  ls_chk-filename = pv_name.
  lv_from = pv_start + 1.

  LOOP AT gt_lines INTO DATA(lv_line) FROM lv_from.
    DATA(lv_lineno) = sy-tabix.

    PERFORM map_line USING lv_line CHANGING ls_stmt lv_ok lv_msg.
    IF lv_ok = abap_true.
*     Nullbetraege (Saldenzeilen) nicht buchen
      IF ls_stmt-amount = 0.
        CONTINUE.
      ENDIF.
*     nach Abbruch zwischen Buchung und Wiederaufsetzpunkt nicht doppelt buchen
      PERFORM check_duplicate USING ls_stmt CHANGING lv_belnr.
      IF lv_belnr IS INITIAL.
        PERFORM post_with_retry USING ls_stmt CHANGING lv_ok lv_msg lv_belnr.
      ENDIF.
    ENDIF.

    IF lv_ok = abap_false.
      pv_errors = pv_errors + 1.
      gv_restart_line = lv_lineno.
      ls_err-filename = pv_name.
      ls_err-lineno   = lv_lineno.
      ls_err-msgtxt   = lv_msg.
      ls_err-erdat    = sy-datum.
      MODIFY zfi_stmt_err FROM ls_err.
      COMMIT WORK.
*     Reihenfolge der Umsaetze muss erhalten bleiben -> Datei hier abbrechen
      EXIT.
    ENDIF.

    ls_chk-last_line = lv_lineno.
    MODIFY zfi_stmt_chkpt FROM ls_chk.
    COMMIT WORK.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form MAP_LINE - CSV-Zeile -> Umsatz, Bankkonto -> Sachkonto
*&---------------------------------------------------------------------*
FORM map_line USING    pv_line TYPE string
              CHANGING ps_stmt TYPE ty_stmt
                       pv_ok   TYPE abap_bool
                       pv_msg  TYPE bapi_msg.
  DATA: lv_amount TYPE string,
        lv_budat  TYPE string,
        lv_valut  TYPE string.

  CLEAR: ps_stmt, pv_msg.
  pv_ok = abap_false.
  SPLIT pv_line AT ';' INTO ps_stmt-bankl ps_stmt-bankn lv_budat lv_valut
                            lv_amount ps_stmt-waers ps_stmt-ref ps_stmt-text.
  ps_stmt-budat = lv_budat.
  ps_stmt-valut = lv_valut.
  TRY.
      ps_stmt-amount = lv_amount.
    CATCH cx_sy_conversion_no_number.
      pv_msg = |Betrag { lv_amount } ungueltig|.
      RETURN.
  ENDTRY.

  SELECT SINGLE hkont FROM zfi_bank_map INTO @DATA(lv_hkont)
    WHERE bukrs = @p_bukrs
      AND bankl = @ps_stmt-bankl
      AND bankn = @ps_stmt-bankn.
  IF sy-subrc <> 0.
    pv_msg = |Bankkonto { ps_stmt-bankn } ohne Sachkontozuordnung|.
    RETURN.
  ENDIF.
  pv_ok = abap_true.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form CHECK_DUPLICATE - Beleg mit derselben Bankreferenz schon da?
*&---------------------------------------------------------------------*
FORM check_duplicate USING    ps_stmt  TYPE ty_stmt
                     CHANGING pv_belnr TYPE belnr_d.
  CLEAR pv_belnr.
  SELECT SINGLE belnr FROM bkpf INTO pv_belnr
    WHERE bukrs = p_bukrs
      AND blart = gc_blart
      AND budat = ps_stmt-budat
      AND xblnr = ps_stmt-ref
      AND stblg = space.
  IF sy-subrc = 0.
    WRITE: / 'Bereits gebucht:'(016), ps_stmt-ref, pv_belnr.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form POST_WITH_RETRY - Bankbuchung Bank an Verrechnung
*&---------------------------------------------------------------------*
FORM post_with_retry USING    ps_stmt  TYPE ty_stmt
                     CHANGING pv_ok    TYPE abap_bool
                              pv_msg   TYPE bapi_msg
                              pv_belnr TYPE belnr_d.
  DATA: ls_header TYPE bapiache09,
        lt_gl     TYPE STANDARD TABLE OF bapiacgl09,
        lt_curr   TYPE STANDARD TABLE OF bapiaccr09,
        lt_return TYPE STANDARD TABLE OF bapiret2,
        lv_key    TYPE bapiache09-obj_key,
        lv_hkont  TYPE hkont,
        lv_clear  TYPE hkont.

  pv_ok = abap_false.
  SELECT SINGLE hkont clear_hkont FROM zfi_bank_map INTO (lv_hkont, lv_clear)
    WHERE bukrs = p_bukrs
      AND bankl = ps_stmt-bankl
      AND bankn = ps_stmt-bankn.

  ls_header-comp_code  = p_bukrs.
  ls_header-doc_type   = gc_blart.
  ls_header-pstng_date = ps_stmt-budat.
  ls_header-doc_date   = ps_stmt-valut.
  ls_header-ref_doc_no = ps_stmt-ref.
  ls_header-username   = sy-uname.
  lt_gl = VALUE #( ( itemno_acc = 1 gl_account = lv_hkont item_text = ps_stmt-text )
                   ( itemno_acc = 2 gl_account = lv_clear item_text = ps_stmt-text ) ).
  lt_curr = VALUE #( ( itemno_acc = 1 currency = ps_stmt-waers amt_doccur = ps_stmt-amount )
                     ( itemno_acc = 2 currency = ps_stmt-waers amt_doccur = - ps_stmt-amount ) ).

  DO gc_max_retry TIMES.
    CLEAR lt_return.
    CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'
      EXPORTING
        documentheader = ls_header
      IMPORTING
        obj_key        = lv_key
      TABLES
        accountgl      = lt_gl
        currencyamount = lt_curr
        return         = lt_return.

    READ TABLE lt_return INTO DATA(ls_ret) WITH KEY type = 'E'.
    IF sy-subrc <> 0.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = abap_true.
      pv_ok    = abap_true.
      pv_belnr = lv_key(10).
      RETURN.
    ENDIF.

    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    pv_msg = ls_ret-message.

*   nur Sperrmeldungen (ZFI_RETRY_MSG) lohnen einen neuen Versuch
    SELECT SINGLE msgid FROM zfi_retry_msg INTO @DATA(lv_msgid)
      WHERE msgid = @ls_ret-id
        AND msgno = @ls_ret-number.
    IF sy-subrc <> 0.
      EXIT.
    ENDIF.
    WAIT UP TO 2 SECONDS.
  ENDDO.
ENDFORM.
