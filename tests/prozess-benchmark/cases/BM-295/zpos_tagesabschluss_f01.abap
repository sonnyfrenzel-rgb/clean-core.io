*&---------------------------------------------------------------------*
*&  Include           ZPOS_TAGESABSCHLUSS_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  ZAEHLUNG_PRUEFEN
*&---------------------------------------------------------------------*
FORM zaehlung_pruefen.

  gv_diff = gv_ist - gv_soll.

  IF abs( gv_diff ) > gc_toleranz.
*   Differenz ueber Toleranz: Filialleiter muss Grund angeben
    MESSAGE w530(zpos) WITH gv_diff p_waers.
    IF gv_grund IS INITIAL.
      MESSAGE e531(zpos).
    ENDIF.
  ELSE.
    MESSAGE s532(zpos) WITH gv_diff p_waers.
  ENDIF.

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  ABSCHLUSS_BUCHEN
*&---------------------------------------------------------------------*
FORM abschluss_buchen.

  DATA: ls_header TYPE bapiache09,
        lt_gl     TYPE tt_gl,
        lt_curr   TYPE tt_curr,
        lt_return TYPE STANDARD TABLE OF bapiret2,
        lv_objkey TYPE bapiache09-obj_key,
        ls_abs    TYPE zpos_abschluss,
        ls_abs_alt TYPE zpos_abschluss,
        lo_buch   TYPE REF TO lcl_buchung,
        lv_objid  TYPE cdobjectv.

  CALL FUNCTION 'POPUP_TO_CONFIRM'
    EXPORTING
      titlebar              = 'Tagesabschluss'(t01)
      text_question         = 'Abschluss buchen? Danach keine Bons mehr.'(q01)
      default_button        = '2'
      display_cancel_button = space
    IMPORTING
      answer                = gv_answer.
  CHECK gv_answer = '1'.

  ls_header-comp_code  = p_bukrs.
  ls_header-doc_date   = p_datum.
  ls_header-pstng_date = p_datum.
  ls_header-doc_type   = gc_blart.
  ls_header-username   = sy-uname.
  ls_header-header_txt = |Kasse { p_kasse } { p_datum DATE = USER }|.

* Umsatz der Bons: Kasse an Erloes
  APPEND VALUE #( itemno_acc = 1 gl_account = gc_konto_kasse comp_code = p_bukrs ) TO lt_gl.
  APPEND VALUE #( itemno_acc = 1 currency = p_waers amt_doccur = gv_bons ) TO lt_curr.
  APPEND VALUE #( itemno_acc = 2 gl_account = gc_konto_erl comp_code = p_bukrs ) TO lt_gl.
  APPEND VALUE #( itemno_acc = 2 currency = p_waers amt_doccur = gv_bons * -1 ) TO lt_curr.

* Einlagen/Entnahmen je nach Art gegen ihr Konto
  LOOP AT gt_bew INTO DATA(ls_bew).
    TRY.
        lo_buch = lcl_buchung=>erzeugen( ls_bew ).
      CATCH lcx_kasse INTO gx_kasse.
        MESSAGE gx_kasse TYPE 'E'.
    ENDTRY.
    lo_buch->gl_zeilen( CHANGING ct_gl = lt_gl ct_curr = lt_curr ).
  ENDLOOP.

* Kassendifferenz gegen Differenzkonto
  IF gv_diff <> 0.
    APPEND VALUE #( itemno_acc = 90 gl_account = gc_konto_diff
                    item_text = gv_grund comp_code = p_bukrs ) TO lt_gl.
    APPEND VALUE #( itemno_acc = 90 currency = p_waers amt_doccur = gv_diff * -1 ) TO lt_curr.
    APPEND VALUE #( itemno_acc = 91 gl_account = gc_konto_kasse comp_code = p_bukrs ) TO lt_gl.
    APPEND VALUE #( itemno_acc = 91 currency = p_waers amt_doccur = gv_diff ) TO lt_curr.
  ENDIF.

  CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'
    EXPORTING
      documentheader = ls_header
    IMPORTING
      obj_key        = lv_objkey
    TABLES
      accountgl      = lt_gl
      currencyamount = lt_curr
      return         = lt_return.
  IF line_exists( lt_return[ type = 'E' ] ) OR line_exists( lt_return[ type = 'A' ] ).
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    READ TABLE lt_return INTO DATA(ls_ret) WITH KEY type = 'E'.
    MESSAGE ls_ret-message TYPE 'I' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  SELECT SINGLE * FROM zpos_abschluss INTO ls_abs_alt
    WHERE kasse = p_kasse AND datum = p_datum.
  ls_abs = VALUE #( kasse = p_kasse datum = p_datum anfang = gv_anfang
                    soll = gv_soll ist = gv_ist diff = gv_diff grund = gv_grund
                    endbestand = gv_ist belnr = lv_objkey(10) status = 'G'
                    ernam = sy-uname erdat = sy-datum ).
  MODIFY zpos_abschluss FROM ls_abs.

  lv_objid = |{ p_kasse }{ p_datum }|.
  CALL FUNCTION 'ZPOS_ABSCHL_WRITE_DOCUMENT' IN UPDATE TASK
    EXPORTING
      objectid             = lv_objid
      tcode                = sy-tcode
      utime                = sy-uzeit
      udate                = sy-datum
      username             = sy-uname
      n_zpos_abschluss     = ls_abs
      o_zpos_abschluss     = ls_abs_alt
      upd_zpos_abschluss   = 'U'.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.

  PERFORM entsperren.
  MESSAGE s533(zpos) WITH p_kasse lv_objkey(10).
  LEAVE TO SCREEN 0.

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  ENTSPERREN
*&---------------------------------------------------------------------*
FORM entsperren.
  CALL FUNCTION 'DEQUEUE_EZPOS_ABSCHL'
    EXPORTING
      kasse = p_kasse
      datum = p_datum.
ENDFORM.
