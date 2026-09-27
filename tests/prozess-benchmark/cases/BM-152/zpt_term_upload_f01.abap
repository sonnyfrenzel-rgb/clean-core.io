*&---------------------------------------------------------------------*
*& Include ZPT_TERM_UPLOAD_F01
*&---------------------------------------------------------------------*

FORM lock_file.
  CALL FUNCTION 'ENQUEUE_EZPT_TERMFILE'
    EXPORTING
      filename       = p_file
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
*   paralleler Lauf -> Job hart abbrechen, naechster Lauf in 15 Min.
    MESSAGE a001 WITH p_file.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM log_create.
  DATA ls_log TYPE bal_s_log.
  ls_log-object    = 'ZPT'.
  ls_log-subobject = 'TERMINAL'.
  ls_log-extnumber = p_file.
  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = ls_log
    IMPORTING
      e_log_handle = gv_log
    EXCEPTIONS
      OTHERS       = 1.
ENDFORM.

*----------------------------------------------------------------------*
FORM log_add USING pv_type TYPE symsgty
                   pv_text TYPE clike.
  CALL FUNCTION 'BAL_LOG_MSG_ADD_FREE_TEXT'
    EXPORTING
      i_log_handle = gv_log
      i_msgty      = pv_type
      i_text       = pv_text
    EXCEPTIONS
      OTHERS       = 1.
  IF pv_type CA 'EA'.
    gv_errors = gv_errors + 1.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM read_file.
  DATA: lv_line  TYPE string,
        lv_date  TYPE string,
        lv_time  TYPE string,
        ls_raw   TYPE ty_raw.

  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING UTF-8.
  IF sy-subrc <> 0.
    PERFORM log_add USING 'E' 'Datei nicht lesbar'.
    RETURN.
  ENDIF.

  DO.
    READ DATASET p_file INTO lv_line.
    IF sy-subrc <> 0.
      EXIT.
    ENDIF.
    APPEND lv_line TO gt_lines.
    CLEAR ls_raw.
    SPLIT lv_line AT ';' INTO ls_raw-terminal ls_raw-zausw
                              lv_date lv_time ls_raw-kind.
    CATCH SYSTEM-EXCEPTIONS conversion_errors = 1.
      ls_raw-ldate = lv_date.
      ls_raw-ltime = lv_time.
    ENDCATCH.
    IF sy-subrc = 1 OR ls_raw-ldate IS INITIAL.
      PERFORM log_add USING 'E' lv_line.
      CONTINUE.
    ENDIF.
    APPEND ls_raw TO gt_raw.
  ENDDO.
  CLOSE DATASET p_file.
ENDFORM.

*----------------------------------------------------------------------*
FORM map_events.
  TYPES: BEGIN OF ty_badge,
           zausw TYPE pa0050-zausw,
           pernr TYPE pernr_d,
         END OF ty_badge,
         BEGIN OF ty_teven,
           pernr TYPE pernr_d,
           ldate TYPE ldate,
           ltime TYPE ltime,
         END OF ty_teven.
  DATA: lt_badge TYPE SORTED TABLE OF ty_badge WITH UNIQUE KEY zausw,
        lt_teven TYPE STANDARD TABLE OF ty_teven,
        ls_raw   TYPE ty_raw,
        ls_badge TYPE ty_badge,
        ls_teven TYPE ty_teven,
        ls_event TYPE bapicc1uptevent,
        lv_dup   TYPE abap_bool.

  SELECT zausw pernr FROM pa0050 INTO TABLE lt_badge
    FOR ALL ENTRIES IN gt_raw
    WHERE zausw = gt_raw-zausw
      AND begda <= sy-datum
      AND endda >= sy-datum.

  IF lt_badge IS NOT INITIAL.
    SELECT pernr ldate ltime FROM teven INTO TABLE lt_teven
      FOR ALL ENTRIES IN lt_badge
      WHERE pernr = lt_badge-pernr
        AND ldate >= sy-datum - 7.
  ENDIF.

  LOOP AT gt_raw INTO ls_raw.
    READ TABLE lt_badge INTO ls_badge WITH TABLE KEY zausw = ls_raw-zausw.
    IF sy-subrc <> 0.
      PERFORM log_add USING 'E' |Ausweis { ls_raw-zausw } unbekannt|.
      CONTINUE.
    ENDIF.

    CLEAR ls_event.
    CASE ls_raw-kind.
      WHEN 'K'.
        ls_event-timetype = 'P10'.
      WHEN 'G'.
        ls_event-timetype = 'P20'.
      WHEN 'PB'.
        ls_event-timetype = 'P15'.
      WHEN 'PE'.
        ls_event-timetype = 'P25'.
      WHEN OTHERS.
        PERFORM log_add USING 'W' |Buchungsart { ls_raw-kind } ignoriert|.
        CONTINUE.
    ENDCASE.

*   Dublette? (Terminal sendet nach Netzausfall erneut)
    lv_dup = abap_false.
    LOOP AT lt_teven INTO ls_teven WHERE pernr = ls_badge-pernr.
      IF ls_teven-ldate = ls_raw-ldate AND ls_teven-ltime = ls_raw-ltime.
        lv_dup = abap_true.
        EXIT.
      ENDIF.
    ENDLOOP.
    IF lv_dup = abap_true.
      CONTINUE.
    ENDIF.

    ls_event-pernr      = ls_badge-pernr.
    ls_event-logdate    = ls_raw-ldate.
    ls_event-logtime    = ls_raw-ltime.
    ls_event-terminalid = ls_raw-terminal.
    APPEND ls_event TO gt_events.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM post_events.
  IF gt_events IS INITIAL OR p_test = abap_true.
    PERFORM log_add USING 'I' |{ lines( gt_events ) } Ereignisse (Test/leer)|.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_CC1_UPLOAD_TIMEEVENT'
    TABLES
      timeevents = gt_events
      return     = gt_return.

  LOOP AT gt_return TRANSPORTING NO FIELDS WHERE type CA 'EA'.
    EXIT.
  ENDLOOP.
  IF sy-subrc = 0.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    PERFORM log_add USING 'E' 'Upload abgelehnt, nichts gebucht'.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    gv_posted = abap_true.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM archive_file.
  DATA: lv_target TYPE string,
        lv_line   TYPE string.
  lv_target = |{ p_arch }buchungen_{ sy-datum }{ sy-uzeit }.csv|.
  OPEN DATASET lv_target FOR OUTPUT IN TEXT MODE ENCODING UTF-8.
  IF sy-subrc <> 0.
    PERFORM log_add USING 'E' 'Archivdatei nicht anlegbar'.
    RETURN.
  ENDIF.
  LOOP AT gt_lines INTO lv_line.
    TRANSFER lv_line TO lv_target.
  ENDLOOP.
  CLOSE DATASET lv_target.
  DELETE DATASET p_file.
ENDFORM.

*----------------------------------------------------------------------*
FORM log_save.
  DATA lt_handle TYPE bal_t_logh.
  APPEND gv_log TO lt_handle.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle = lt_handle
    EXCEPTIONS
      OTHERS         = 1.
  IF sy-batch IS INITIAL.
    CALL FUNCTION 'BAL_DSP_LOG_DISPLAY'
      EXPORTING
        i_t_log_handle = lt_handle
      EXCEPTIONS
        OTHERS         = 1.
  ENDIF.
ENDFORM.
