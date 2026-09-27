*----------------------------------------------------------------------*
* Include ZMM_NIEDERSTWERT_F02 - Buchung (MR21), Historie, Ausgabe
*----------------------------------------------------------------------*

DEFINE bdc_dynpro.
  CLEAR ls_bdc.
  ls_bdc-program  = &1.
  ls_bdc-dynpro   = &2.
  ls_bdc-dynbegin = 'X'.
  APPEND ls_bdc TO gt_bdc.
END-OF-DEFINITION.

DEFINE bdc_field.
  CLEAR ls_bdc.
  ls_bdc-fnam = &1.
  ls_bdc-fval = &2.
  APPEND ls_bdc TO gt_bdc.
END-OF-DEFINITION.

FORM preise_aendern.
  DATA: ls_bdc   TYPE bdcdata,
        lv_preis TYPE char20,
        lv_datum TYPE char10,
        ls_opt   TYPE ctu_params.
  FIELD-SYMBOLS <ls_bew> TYPE ty_bew.

  ls_opt-dismode  = p_mode.
  ls_opt-updmode  = 'S'.
  ls_opt-racommit = 'X'.
  WRITE p_stich TO lv_datum DD/MM/YYYY.

  LOOP AT gt_bew ASSIGNING <ls_bew> WHERE kandidat = abap_true.
*   seit 2020 nur Standardpreis-Materialien (V-Preis ueber ML-Abschluss)
    IF <ls_bew>-vprsv <> 'S'.
      <ls_bew>-status  = icon_red_light.
      <ls_bew>-meldung = 'V-Preis: manuelle Abwertung erforderlich'.
      CONTINUE.
    ENDIF.

    CALL FUNCTION 'ENQUEUE_EMMBEWE'
      EXPORTING
        matnr          = <ls_bew>-matnr
        bwkey          = <ls_bew>-bwkey
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      <ls_bew>-status  = icon_red_light.
      <ls_bew>-meldung = 'Material gesperrt'.
      CONTINUE.
    ENDIF.
    CALL FUNCTION 'DEQUEUE_EMMBEWE'
      EXPORTING
        matnr = <ls_bew>-matnr
        bwkey = <ls_bew>-bwkey.

    CLEAR: gt_bdc, gt_bdcmsg.
    WRITE <ls_bew>-neupr TO lv_preis CURRENCY 'EUR' NO-GROUPING LEFT-JUSTIFIED.
    bdc_dynpro 'SAPRCKM_MR21' '0201'.
    bdc_field  'MR21HEAD-BUDAT' lv_datum.
    bdc_field  'MR21HEAD-BUKRS' p_bukrs.
    bdc_field  'MR21HEAD-WERKS' <ls_bew>-bwkey.
    bdc_field  'BDC_OKCODE'     '=ENTR'.
    bdc_dynpro 'SAPRCKM_MR21' '0201'.
    bdc_field  'CKI_MR21_0250-MATNR(01)'    <ls_bew>-matnr.
    bdc_field  'CKI_MR21_0250-NEWVALPR(01)' lv_preis.
    bdc_field  'BDC_OKCODE'     '=SAVE'.

    CALL TRANSACTION 'MR21' USING gt_bdc
                            OPTIONS FROM ls_opt
                            MESSAGES INTO gt_bdcmsg.

    READ TABLE gt_bdcmsg INTO DATA(ls_msg) WITH KEY msgtyp = 'E'.
    IF sy-subrc = 0.
      <ls_bew>-status = icon_red_light.
      MESSAGE ID ls_msg-msgid TYPE 'E' NUMBER ls_msg-msgnr
        WITH ls_msg-msgv1 ls_msg-msgv2 ls_msg-msgv3 ls_msg-msgv4
        INTO <ls_bew>-meldung.
    ELSE.
      <ls_bew>-status  = icon_green_light.
      <ls_bew>-meldung = 'Preis geaendert'.
    ENDIF.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM historie_schreiben.
  DATA: lt_hist TYPE STANDARD TABLE OF zmm_nsw_hist,
        ls_hist TYPE zmm_nsw_hist.

  LOOP AT gt_bew INTO DATA(ls_bew) WHERE kandidat = abap_true.
    CLEAR ls_hist.
    MOVE-CORRESPONDING ls_bew TO ls_hist.
    ls_hist-bukrs = p_bukrs.
    ls_hist-stich = p_stich.
    ls_hist-uname = sy-uname.
    ls_hist-gebucht = xsdbool( ls_bew-status = icon_green_light ).
    APPEND ls_hist TO lt_hist.
  ENDLOOP.
  IF lt_hist IS INITIAL.
    RETURN.
  ENDIF.
  MODIFY zmm_nsw_hist FROM TABLE lt_hist.
  COMMIT WORK.
ENDFORM.

*----------------------------------------------------------------------*
FORM ausgabe.
  DATA: lt_fcat TYPE slis_t_fieldcat_alv,
        ls_layo TYPE slis_layout_alv.

  IF gt_bew IS INITIAL.
    RETURN.
  ENDIF.
  SORT gt_bew BY abw_wert DESCENDING.
* im Hintergrund nur Summenprotokoll (Spool)
  IF sy-batch = abap_true.
    PERFORM protokoll_batch.
    RETURN.
  ENDIF.
  CALL FUNCTION 'REUSE_ALV_FIELDCATALOG_MERGE'
    EXPORTING
      i_program_name         = sy-repid
      i_internal_tabname     = 'GT_BEW'
      i_inclname             = 'ZMM_NIEDERSTWERT_TOP'
    CHANGING
      ct_fieldcat            = lt_fcat
    EXCEPTIONS
      OTHERS                 = 1.
  ls_layo-zebra = 'X'.
  ls_layo-colwidth_optimize = 'X'.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program = sy-repid
      i_callback_user_command = 'USER_COMMAND'
      is_layout          = ls_layo
      it_fieldcat        = lt_fcat
      i_grid_title       = 'Niederstwertpruefung'
    TABLES
      t_outtab           = gt_bew
    EXCEPTIONS
      OTHERS             = 1.
ENDFORM.

*----------------------------------------------------------------------*
FORM protokoll_batch.
  DATA: lv_anz_k TYPE i,
        lv_anz_g TYPE i,
        lv_summe TYPE salk3.

  LOOP AT gt_bew INTO DATA(ls_bew) WHERE kandidat = abap_true.
    lv_anz_k = lv_anz_k + 1.
    lv_summe = lv_summe + ls_bew-abw_wert.
    IF ls_bew-status = icon_green_light.
      lv_anz_g = lv_anz_g + 1.
    ENDIF.
  ENDLOOP.
  WRITE: / 'Buchungskreis', p_bukrs, 'Stichtag', p_stich DD/MM/YYYY.
  WRITE: / 'Materialien mit Bestand  :', lines( gt_bew ).
  WRITE: / 'Abwertungskandidaten     :', lv_anz_k.
  WRITE: / 'davon Preis geaendert    :', lv_anz_g.
  WRITE: / 'Abwertungsbetrag gesamt  :', lv_summe CURRENCY 'EUR'.
ENDFORM.

*----------------------------------------------------------------------*
FORM user_command USING pv_ucomm    TYPE sy-ucomm
                        ps_selfield TYPE slis_selfield.
  READ TABLE gt_bew INTO DATA(ls_bew) INDEX ps_selfield-tabindex.
  CHECK sy-subrc = 0.
  CASE pv_ucomm.
    WHEN '&IC1'.
      SET PARAMETER ID 'MAT' FIELD ls_bew-matnr.
      SET PARAMETER ID 'WRK' FIELD ls_bew-bwkey.
      CALL TRANSACTION 'MM03' AND SKIP FIRST SCREEN.
  ENDCASE.
ENDFORM.
