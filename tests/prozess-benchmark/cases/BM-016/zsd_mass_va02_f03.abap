*&---------------------------------------------------------------------*
*& Include ZSD_MASS_VA02_F03 - Ausführung per CALL TRANSACTION, Anzeige
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  AENDERUNGEN_AUSFUEHREN
*&---------------------------------------------------------------------*
FORM aenderungen_ausfuehren.
  DATA: ls_opt  TYPE ctu_params,
        lv_text TYPE bapi_msg.

  ls_opt-dismode  = p_mode.
  ls_opt-updmode  = 'S'.
  ls_opt-defsize  = abap_true.
  ls_opt-racommit = abap_true.

  LOOP AT gt_result ASSIGNING FIELD-SYMBOL(<ls_res>)
       WHERE ampel = icon_green_light.

    IF p_test = abap_true.
      <ls_res>-ampel = icon_yellow_light.
      <ls_res>-text  = 'Testlauf: Zeile geprüft, nicht geändert'(t01).
      CONTINUE.
    ENDIF.

*   Vorabprüfung, ob jemand den Auftrag bearbeitet (VA02 sperrt selbst)
    CALL FUNCTION 'ENQUEUE_EVVBAKE'
      EXPORTING
        vbeln          = <ls_res>-vbeln
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      PERFORM zeile_fehler USING 'Auftrag in Bearbeitung'(e07)
                           CHANGING <ls_res>.
      CONTINUE.
    ENDIF.
    CALL FUNCTION 'DEQUEUE_EVVBAKE'
      EXPORTING
        vbeln = <ls_res>-vbeln.

    PERFORM bdc_aufbauen USING <ls_res>.

    CLEAR gt_bdcmsg.
    CALL TRANSACTION 'VA02' USING gt_bdcdata
                            OPTIONS FROM ls_opt
                            MESSAGES INTO gt_bdcmsg.

    READ TABLE gt_bdcmsg INTO DATA(ls_msg) WITH KEY msgtyp = 'E'.
    IF sy-subrc = 0.
      MESSAGE ID ls_msg-msgid TYPE 'E' NUMBER ls_msg-msgnr
              WITH ls_msg-msgv1 ls_msg-msgv2 ls_msg-msgv3 ls_msg-msgv4
              INTO lv_text.
      PERFORM zeile_fehler USING lv_text CHANGING <ls_res>.
    ELSE.
*     V1 311: "... wurde gesichert"
      READ TABLE gt_bdcmsg TRANSPORTING NO FIELDS
           WITH KEY msgid = 'V1' msgnr = '311'.
      IF sy-subrc = 0.
        gv_ok = gv_ok + 1.
        <ls_res>-text = 'Geändert'(t02).
      ELSE.
        PERFORM zeile_fehler USING 'Keine Sicherungsmeldung'(e08)
                             CHANGING <ls_res>.
      ENDIF.
    ENDIF.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  BDC_AUFBAUEN
*&---------------------------------------------------------------------*
*       Bildfolge VA02 je nach geändertem Feld
*----------------------------------------------------------------------*
FORM bdc_aufbauen USING is_res TYPE ty_result.
  CLEAR gt_bdcdata.

  bdc_dynpro 'SAPMV45A' '0102'.
  bdc_field  'VBAK-VBELN' is_res-vbeln.
  bdc_field  'BDC_OKCODE' '/00'.

  CASE is_res-feld.
    WHEN gc_lifsk.
*     Kopf - Versand
      bdc_dynpro 'SAPMV45A' '4001'.
      bdc_field  'BDC_OKCODE' '=KKAU'.
      bdc_dynpro 'SAPMV45A' '4002'.
      bdc_field  'VBAK-LIFSK' is_res-wert.
    WHEN OTHERS.
*     Position über "Position suchen" auf die erste Zeile holen
      bdc_dynpro 'SAPMV45A' '4001'.
      bdc_field  'BDC_OKCODE' '=POPO'.
      bdc_dynpro 'SAPMV45A' '0251'.
      bdc_field  'RV45A-POSNR' is_res-posnr.
      bdc_field  'BDC_OKCODE' '=POSI'.
      bdc_dynpro 'SAPMV45A' '4001'.
      CASE is_res-feld.
        WHEN gc_menge.
          bdc_field 'RV45A-KWMENG(01)' is_res-wert.
        WHEN gc_abgru.
          bdc_field 'VBAP-ABGRU(01)' is_res-wert.
        WHEN gc_edatu.
          bdc_field 'RV45A-ETDAT(01)' is_res-wert.
      ENDCASE.
  ENDCASE.

  bdc_field 'BDC_OKCODE' '=SICH'.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  ERGEBNIS_ANZEIGEN
*&---------------------------------------------------------------------*
FORM ergebnis_anzeigen.
  DATA: lo_alv TYPE REF TO cl_salv_table,
        lx_alv TYPE REF TO cx_salv_msg.

  MESSAGE s603 WITH lines( gt_result ) gv_ok gv_err.

  TRY.
      cl_salv_table=>factory(
        IMPORTING r_salv_table = lo_alv
        CHANGING  t_table      = gt_result ).
    CATCH cx_salv_msg INTO lx_alv.
      MESSAGE lx_alv TYPE 'I'.
      RETURN.
  ENDTRY.

  lo_alv->get_functions( )->set_all( abap_true ).
  lo_alv->get_columns( )->set_optimize( abap_true ).
  lo_alv->display( ).
ENDFORM.
