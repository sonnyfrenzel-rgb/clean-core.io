*----------------------------------------------------------------------*
***INCLUDE LZQM_LIMSF01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Prueflos und Vorgang pruefen
*&---------------------------------------------------------------------*
FORM pruefe_los CHANGING cv_ok TYPE abap_bool.
  DATA: ls_qals  TYPE qals,
        lv_vcode TYPE qvcode.

  cv_ok = abap_false.

  IF gs_kopf-prueflos IS INITIAL OR gt_pos IS INITIAL.
    gv_msg = 'IDoc ohne Kopf oder ohne Merkmale'.
    RETURN.
  ENDIF.

  SELECT SINGLE * FROM qals INTO ls_qals
    WHERE prueflos = gs_kopf-prueflos.
  IF sy-subrc <> 0.
    gv_msg = |Prueflos { gs_kopf-prueflos } unbekannt|.
    RETURN.
  ENDIF.

* Nach Verwendungsentscheid keine Ergebniserfassung mehr
  SELECT SINGLE vcode FROM qave INTO lv_vcode
    WHERE prueflos = gs_kopf-prueflos
      AND kzart    = 'L'.
  IF sy-subrc = 0.
    gv_msg = |Prueflos { gs_kopf-prueflos } hat bereits VE { lv_vcode }|.
    RETURN.
  ENDIF.

  SELECT SINGLE vorglfnr FROM qapo INTO gv_vorglfnr
    WHERE prueflos = gs_kopf-prueflos
      AND vornr    = gs_kopf-vornr.
  IF sy-subrc <> 0.
    gv_msg = |Vorgang { gs_kopf-vornr } nicht im Prueflos|.
    RETURN.
  ENDIF.

  cv_ok = abap_true.
ENDFORM.

*&---------------------------------------------------------------------*
*& Merkmalsergebnisse per BAPI erfassen
*&---------------------------------------------------------------------*
FORM ergebnisse_buchen CHANGING cv_ok TYPE abap_bool.
  DATA: lt_res    TYPE STANDARD TABLE OF bapi2045d2,
        ls_res    TYPE bapi2045d2,
        lt_retab  TYPE STANDARD TABLE OF bapiret2,
        ls_return TYPE bapiret2,
        ls_pos    TYPE gty_pos.

  cv_ok = abap_false.

  LOOP AT gt_pos INTO ls_pos.
    CLEAR ls_res.
    ls_res-insplot    = gs_kopf-prueflos.
    ls_res-inspoper   = gs_kopf-vornr.
    ls_res-inspchar   = ls_pos-merknr.
    ls_res-mean_value = ls_pos-mittelwrt.
    ls_res-evaluation = ls_pos-bewertung.
    ls_res-closed     = 'X'.
    ls_res-evaluated  = 'X'.
    ls_res-remark     = |LIMS { gs_kopf-labor }|.
    APPEND ls_res TO lt_res.
  ENDLOOP.

  CALL FUNCTION 'BAPI_INSPOPER_RECORDRESULTS'
    EXPORTING
      insplot      = gs_kopf-prueflos
      inspoper     = gs_kopf-vornr
    IMPORTING
      return       = ls_return
    TABLES
      char_results = lt_res
      returntable  = lt_retab.

  IF ls_return-type CA 'EA'.
    gv_msg = ls_return-message.
    RETURN.
  ENDIF.

  gv_msg = |{ lines( lt_res ) } Ergebnisse zu Los { gs_kopf-prueflos } erfasst|.
  cv_ok  = abap_true.
ENDFORM.

*&---------------------------------------------------------------------*
*& Qualitaetsmeldung bei zurueckgewiesenen Merkmalen (Wunsch aus LIMS)
*&---------------------------------------------------------------------*
FORM qmeldung_anlegen.
  DATA: ls_head   TYPE bapi2078_nothdri,
        ls_export TYPE bapi2078_nothdre,
        lt_return TYPE STANDARD TABLE OF bapiret2.

  ls_head-insp_lot   = gs_kopf-prueflos.
  ls_head-short_text = |LIMS: Merkmal zurueckgewiesen ({ gs_kopf-labor })|.

  CALL FUNCTION 'BAPI_QUALNOT_CREATE'
    EXPORTING
      notif_type         = gc_qmart
      notifheader        = ls_head
    IMPORTING
      notifheader_export = ls_export
    TABLES
      return             = lt_return.

  IF line_exists( lt_return[ type = 'E' ] ).
*   Meldung ist nice-to-have, IDoc bleibt trotzdem erfolgreich
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_QUALNOT_SAVE'
    EXPORTING
      number = ls_export-notif_no
    TABLES
      return = lt_return.
  gv_msg = |{ gv_msg }, Q-Meldung { ls_export-notif_no }|.
ENDFORM.

*&---------------------------------------------------------------------*
*& Statussatz fuer das IDoc
*&---------------------------------------------------------------------*
FORM status_setzen TABLES ct_status STRUCTURE bdidocstat
                   USING  iv_docnum TYPE edi_docnum
                          iv_status TYPE edi_status
                          iv_text   TYPE bapi_msg.
  DATA ls_stat TYPE bdidocstat.

  ls_stat-docnum = iv_docnum.
  ls_stat-status = iv_status.
  ls_stat-msgty  = COND #( WHEN iv_status = gc_status_ok THEN 'S' ELSE 'E' ).
  ls_stat-msgid  = 'ZQM'.
  ls_stat-msgno  = '100'.
  ls_stat-msgv1  = iv_text(50).
  ls_stat-msgv2  = iv_text+50(50).
  APPEND ls_stat TO ct_status.
ENDFORM.
