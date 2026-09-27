*&---------------------------------------------------------------------*
*&  Include           ZCO_PLANUPLOAD_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  DATEI_LESEN
*&---------------------------------------------------------------------*
FORM datei_lesen.
  DATA: lv_line  TYPE string,
        lv_nr    TYPE i,
        ls_zeile TYPE zcl_co_plan_pruefer=>ty_zeile,
        lv_wert  TYPE string,
        lv_perio TYPE string.

  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING UTF-8
                      IGNORING CONVERSION ERRORS.
  IF sy-subrc <> 0.
    MESSAGE e010 WITH p_file.
  ENDIF.

  DO.
    READ DATASET p_file INTO lv_line.
    IF sy-subrc <> 0.
      EXIT.
    ENDIF.
    ADD 1 TO lv_nr.
*   Kopfzeile ueberspringen
    CHECK lv_nr > 1.

    CLEAR ls_zeile.
    SPLIT lv_line AT gc_sep INTO ls_zeile-kostl ls_zeile-kstar
                                 lv_perio lv_wert ls_zeile-waers.
    ls_zeile-perio    = lv_perio.
    TRANSLATE lv_wert USING ',.'.
    ls_zeile-wert     = lv_wert.
    ls_zeile-zeilennr = lv_nr.
    APPEND ls_zeile TO gt_zeilen.
    APPEND lv_line TO gt_roh.
  ENDDO.

  CLOSE DATASET p_file.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  ZEILEN_PRUEFEN
*&---------------------------------------------------------------------*
FORM zeilen_pruefen.
  DATA: ls_zeile  TYPE zcl_co_plan_pruefer=>ty_zeile,
        ls_fehler TYPE ty_fehler,
        lx_plan   TYPE REF TO zcx_co_plan.

  LOOP AT gt_zeilen INTO ls_zeile.
    TRY.
        go_pruefer->pruefe_zeile( ls_zeile ).
        APPEND ls_zeile TO gt_ok.
      CATCH zcx_co_plan INTO lx_plan.
        ls_fehler-zeilennr = ls_zeile-zeilennr.
        ls_fehler-text     = lx_plan->get_text( ).
        READ TABLE gt_roh INTO ls_fehler-rohzeile INDEX sy-tabix.
        APPEND ls_fehler TO gt_fehler.
    ENDTRY.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  FEHLERDATEI_SCHREIBEN
*&---------------------------------------------------------------------*
FORM fehlerdatei_schreiben.
  DATA: ls_fehler TYPE ty_fehler,
        lv_out    TYPE string,
        lv_nr     TYPE string.

  IF p_errf IS INITIAL.
    RETURN.
  ENDIF.

  OPEN DATASET p_errf FOR OUTPUT IN TEXT MODE ENCODING UTF-8.
  IF sy-subrc <> 0.
    MESSAGE i011 WITH p_errf.
    RETURN.
  ENDIF.

  LOOP AT gt_fehler INTO ls_fehler.
    lv_nr = ls_fehler-zeilennr.
    CONCATENATE lv_nr ls_fehler-rohzeile ls_fehler-text
      INTO lv_out SEPARATED BY gc_sep.
    TRANSFER lv_out TO p_errf.
  ENDLOOP.

  CLOSE DATASET p_errf.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  BUCHEN
*&---------------------------------------------------------------------*
*       eine Planbuchung ueber alle korrekten Zeilen, Perioden 1-12
*----------------------------------------------------------------------*
FORM buchen.
  DATA: ls_head   TYPE bapiplnhdr,
        lt_index  TYPE STANDARD TABLE OF bapiacpstru,
        ls_index  TYPE bapiacpstru,
        lt_obj    TYPE STANDARD TABLE OF bapipcpobj,
        ls_obj    TYPE bapipcpobj,
        lt_val    TYPE STANDARD TABLE OF bapipcpval,
        ls_val    TYPE bapipcpval,
        ls_zeile  TYPE zcl_co_plan_pruefer=>ty_zeile,
        ls_return TYPE bapiret2,
        lv_feld   TYPE string,
        lv_idx    TYPE i.
  FIELD-SYMBOLS <lv_per> TYPE any.

  ls_head-co_area     = p_kokrs.
  ls_head-fisc_year   = p_gjahr.
  ls_head-period_from = '001'.
  ls_head-period_to   = '012'.
  ls_head-version     = p_versn.
  ls_head-doc_hdr_tx  = 'Planupload'.
  ls_head-plan_currtype = 'C'.

* je korrekter Zeile ein Objekt/Wert-Paar (Verdichtung macht das BAPI)
  LOOP AT gt_ok INTO ls_zeile.
    lv_idx = sy-tabix.
    CLEAR: ls_obj, ls_val, ls_index.
    ls_obj-object_index = lv_idx.
    ls_obj-costcenter   = ls_zeile-kostl.
    APPEND ls_obj TO lt_obj.
    ls_val-value_index  = lv_idx.
    ls_val-cost_elem    = ls_zeile-kstar.
    ls_val-trans_curr   = ls_zeile-waers.
    lv_feld = |FIX_VAL_PER{ ls_zeile-perio WIDTH = 2 ALIGN = RIGHT PAD = '0' }|.
    ASSIGN COMPONENT lv_feld OF STRUCTURE ls_val TO <lv_per>.
    <lv_per> = ls_zeile-wert.
    APPEND ls_val TO lt_val.
    ls_index-object_index = lv_idx.
    ls_index-value_index  = lv_idx.
    APPEND ls_index TO lt_index.
  ENDLOOP.

  IF p_test = 'X'.
    CALL FUNCTION 'BAPI_COSTACTPLN_CHECKPRIMCOST'
      EXPORTING
        headerinfo     = ls_head
      TABLES
        indexstructure = lt_index
        coobject       = lt_obj
        pervalue       = lt_val
        return         = gt_return.
  ELSE.
    CALL FUNCTION 'BAPI_COSTACTPLN_POSTPRIMCOST'
      EXPORTING
        headerinfo     = ls_head
      TABLES
        indexstructure = lt_index
        coobject       = lt_obj
        pervalue       = lt_val
        return         = gt_return.
  ENDIF.

  LOOP AT gt_return INTO ls_return WHERE type CA 'EAX'.
    gv_bapi_err = 'X'.
    WRITE: / ls_return-type, ls_return-message.
  ENDLOOP.

  IF gv_bapi_err = 'X'.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    MESSAGE s040 DISPLAY LIKE 'E'.
  ELSEIF p_test IS INITIAL.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
    MESSAGE s041 WITH lines( gt_ok ).
  ELSE.
    MESSAGE s042 WITH lines( gt_ok ).
  ENDIF.
ENDFORM.
