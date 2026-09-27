*&---------------------------------------------------------------------*
*&  Include           ZPE_TEILNBEST_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  SELECT_DATA
*&---------------------------------------------------------------------*
*       Veranstaltungen im Zeitraum, abgesagte raus, Teilnehmer lesen
*----------------------------------------------------------------------*
FORM select_data.

  DATA lt_1026 TYPE STANDARD TABLE OF hrp1026.

  SELECT objid begda endda stext FROM hrp1000
    INTO CORRESPONDING FIELDS OF TABLE gt_events
    WHERE plvar = p_plvar
      AND otype = 'E'
      AND objid IN s_evid
      AND endda IN s_endda
      AND istat = '1'
      AND langu = sy-langu.
  IF sy-subrc <> 0.
    MESSAGE s011 DISPLAY LIKE 'E'.
    STOP.
  ENDIF.
  SORT gt_events BY objid.

* abgesagte Veranstaltungen (IT1026) nicht bestaetigen
  SELECT * FROM hrp1026 INTO TABLE lt_1026
    FOR ALL ENTRIES IN gt_events
    WHERE plvar = p_plvar
      AND otype = 'E'
      AND objid = gt_events-objid
      AND cancr <> space.
  LOOP AT lt_1026 INTO DATA(ls_1026).
    DELETE gt_events WHERE objid = ls_1026-objid.
  ENDLOOP.

* Teilnahmebeziehungen Veranstaltung -> Teilnehmer (B025)
  SELECT objid sclas sobid FROM hrp1001
    INTO CORRESPONDING FIELDS OF TABLE gt_rel
    FOR ALL ENTRIES IN gt_events
    WHERE plvar = p_plvar
      AND otype = 'E'
      AND objid = gt_events-objid
      AND rsign = 'B'
      AND relat = gc_relat
      AND istat = '1'.
  SORT gt_rel BY objid sobid.

ENDFORM.                    " SELECT_DATA

*&---------------------------------------------------------------------*
*&      Form  PRINT_CONFIRMATION
*&---------------------------------------------------------------------*
*       Eine Teilnahmebestaetigung ausgeben und protokollieren
*----------------------------------------------------------------------*
FORM print_confirmation.

  DATA: ls_docpar TYPE sfpdocparams,
        ls_result TYPE fpformoutput,
        ls_log    TYPE zpe_tb_log.

  ls_docpar-langu   = sy-langu.
  ls_docpar-country = 'DE'.

* alter Smart-Forms-Aufruf bis 2016
* CALL FUNCTION 'SSF_FUNCTION_MODULE_NAME'
*   EXPORTING formname = gc_sform
*   IMPORTING fm_name  = lv_sf_fm.
* CALL FUNCTION lv_sf_fm
*   EXPORTING is_event = gs_event is_attendee = gs_attendee.

  CALL FUNCTION gv_fm_name
    EXPORTING
      /1bcdwb/docparams  = ls_docpar
      is_event           = gs_event
      is_attendee        = gs_attendee
    IMPORTING
      /1bcdwb/formoutput = ls_result
    EXCEPTIONS
      usage_error        = 1
      system_error       = 2
      internal_error     = 3
      OTHERS             = 4.
  IF sy-subrc <> 0.
    gv_err = gv_err + 1.
    WRITE: / icon_led_red AS ICON, gs_rel-objid, gs_rel-sobid(12),
             'Ausgabe fehlgeschlagen'(e01), sy-subrc.
    RETURN.
  ENDIF.

* in der Vorschau nichts protokollieren
  IF p_prev = abap_false.
    ls_log-plvar = p_plvar.
    ls_log-evtid = gs_rel-objid.
    ls_log-sclas = gs_rel-sclas.
    ls_log-sobid = gs_rel-sobid.
    ls_log-prdat = sy-datum.
    ls_log-prusr = sy-uname.
    MODIFY zpe_tb_log FROM ls_log.
  ENDIF.

  gv_ok      = gv_ok + 1.
  gv_evt_cnt = gv_evt_cnt + 1.

ENDFORM.                    " PRINT_CONFIRMATION

*&---------------------------------------------------------------------*
*&      Form  SEND_MAIL_LEGACY
*&---------------------------------------------------------------------*
*       Versand der Bestaetigung per Mail - Pilot 2014, nie produktiv
*----------------------------------------------------------------------*
FORM send_mail_legacy USING us_attendee TYPE ty_attendee.

  DATA: ls_doc   TYPE sodocchgi1,
        lt_recv  TYPE STANDARD TABLE OF somlreci1,
        ls_recv  TYPE somlreci1,
        lt_text  TYPE STANDARD TABLE OF solisti1.

  ls_doc-obj_descr = 'Teilnahmebestaetigung'(m01).
  ls_recv-receiver = us_attendee-sobid.
  ls_recv-rec_type = 'B'.
  APPEND ls_recv TO lt_recv.

  CALL FUNCTION 'SO_NEW_DOCUMENT_SEND_API1'
    EXPORTING
      document_data  = ls_doc
      commit_work    = 'X'
    TABLES
      object_content = lt_text
      receivers      = lt_recv
    EXCEPTIONS
      OTHERS         = 1.

ENDFORM.                    " SEND_MAIL_LEGACY
