*&---------------------------------------------------------------------*
*& Include ZRE_INDEXMIETE_F02 - Vertragsänderung und Mieterbrief
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form VERTRAEGE_AENDERN
*&   neue Konditionszeile ab Wirksamkeitsdatum, Basis fortschreiben
*&---------------------------------------------------------------------*
FORM vertraege_aendern.
  DATA: lt_cond TYPE STANDARD TABLE OF bapi_re_condition,
        lt_ret  TYPE STANDARD TABLE OF bapiret2.
  FIELD-SYMBOLS <ls_erg> TYPE ty_erg.

  LOOP AT gt_erg ASSIGNING <ls_erg> WHERE status = 'B'.
    CLEAR: lt_cond, lt_ret.

    CALL FUNCTION 'ENQUEUE_EZRE_INDEX'
      EXPORTING
        bukrs          = <ls_erg>-bukrs
        recnnr         = <ls_erg>-recnnr
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      <ls_erg>-status = 'G'.
      <ls_erg>-text   = |Gesperrt durch { sy-msgv1 }|.
      CONTINUE.
    ENDIF.

    lt_cond = VALUE #( ( condtype      = <ls_erg>-condtype
                         condvalidfrom = p_ab
                         unitprice     = <ls_erg>-miete_neu ) ).

    CALL FUNCTION 'BAPI_RE_CN_CHANGE'
      EXPORTING
        compcode       = <ls_erg>-bukrs
        contractnumber = <ls_erg>-recnnr
      TABLES
        condition      = lt_cond
        return         = lt_ret.

    IF line_exists( lt_ret[ type = 'E' ] ) OR line_exists( lt_ret[ type = 'A' ] ).
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      <ls_erg>-status = 'F'.
      <ls_erg>-text   = VALUE #( lt_ret[ type = 'E' ]-message OPTIONAL ).
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = 'X'.
      UPDATE zre_index_vtr
         SET basis_wert  = <ls_erg>-akt_wert
             basis_monat = p_monat
             letzte_anp  = p_ab
       WHERE bukrs  = <ls_erg>-bukrs
         AND recnnr = <ls_erg>-recnnr.
      <ls_erg>-status = 'A'.
    ENDIF.

    CALL FUNCTION 'DEQUEUE_EZRE_INDEX'
      EXPORTING
        bukrs  = <ls_erg>-bukrs
        recnnr = <ls_erg>-recnnr.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form BRIEFE_DRUCKEN - Mieterbrief je angepasstem Vertrag (Smart Form)
*&---------------------------------------------------------------------*
FORM briefe_drucken.
  DATA: lv_fm      TYPE rs38l_fnam,
        lv_aktiv   TYPE tvarvc-low,
        ls_ctrl    TYPE ssfctrlop,
        ls_options TYPE ssfcompop.
  FIELD-SYMBOLS <ls_erg> TYPE ty_erg.

  CHECK p_brief = 'X'.

* Briefdruck zentral abschaltbar (z. B. während Mieterportal-Versand)
  SELECT SINGLE low FROM tvarvc INTO lv_aktiv
    WHERE name = 'ZRE_INDEX_BRIEF_AKTIV'
      AND type = 'P'.
  IF lv_aktiv <> 'X'.
    RETURN.
  ENDIF.

  CALL FUNCTION 'SSF_FUNCTION_MODULE_NAME'
    EXPORTING
      formname           = gc_brief_form
    IMPORTING
      fm_name            = lv_fm
    EXCEPTIONS
      no_form            = 1
      no_function_module = 2
      OTHERS             = 3.
  IF sy-subrc <> 0.
    MESSAGE s212 WITH gc_brief_form DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  ls_ctrl-no_dialog  = abap_true.
  ls_options-tddest  = 'LOCL'.
  ls_options-tdimmed = abap_true.
* Test AKR: nur Vorschau, nicht drucken
  IF sy-uname = 'AKR_TEST'.
    ls_ctrl-preview   = abap_true.
    ls_ctrl-no_dialog = abap_false.
  ENDIF.

  LOOP AT gt_erg ASSIGNING <ls_erg> WHERE status = 'A'.
    CALL FUNCTION lv_fm
      EXPORTING
        control_parameters = ls_ctrl
        output_options     = ls_options
        is_erg             = <ls_erg>
        iv_ab              = p_ab
      EXCEPTIONS
        formatting_error   = 1
        internal_error     = 2
        send_error         = 3
        user_canceled      = 4
        OTHERS             = 5.
    IF sy-subrc <> 0.
      <ls_erg>-status = 'D'.
      <ls_erg>-text   = |Brief nicht gedruckt ({ sy-subrc })|.
    ENDIF.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form BRIEF_SAPSCRIPT - alter Mieterbrief (bis 2016), SAPscript
*&---------------------------------------------------------------------*
FORM brief_sapscript USING is_erg TYPE ty_erg.
  CALL FUNCTION 'OPEN_FORM'
    EXPORTING
      form     = 'ZRE_INDEX_BRIEF'
      language = sy-langu
    EXCEPTIONS
      OTHERS   = 1.
  CHECK sy-subrc = 0.
  CALL FUNCTION 'WRITE_FORM'
    EXPORTING
      element = 'ANPASSUNG'
      window  = 'MAIN'.
  CALL FUNCTION 'CLOSE_FORM'.
  UPDATE zre_index_vtr SET brief_am = sy-datum
    WHERE bukrs  = is_erg-bukrs
      AND recnnr = is_erg-recnnr.
ENDFORM.
