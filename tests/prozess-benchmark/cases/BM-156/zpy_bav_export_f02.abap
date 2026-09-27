*&---------------------------------------------------------------------*
*& Include ZPY_BAV_EXPORT_F02  - Datei und Protokoll
*&---------------------------------------------------------------------*

FORM open_file.
  OPEN DATASET p_file FOR OUTPUT IN TEXT MODE ENCODING UTF-8.
  IF sy-subrc <> 0.
    MESSAGE e004 WITH p_file.
  ENDIF.
  gv_file_open = abap_true.

* Kopfsatz
  CLEAR gv_line.
  add_field 'K'.
  add_field p_trag.
  add_field gv_inper.
  add_field sy-datum.
  TRANSFER gv_line TO p_file.
ENDFORM.

*----------------------------------------------------------------------*
FORM write_record USING is_rec TYPE ty_record.
  DATA: lv_ag  TYPE string,
        lv_an  TYPE string,
        lv_ytd TYPE string.

  lv_ag  = |{ is_rec-ag  DECIMALS = 2 }|.
  lv_an  = |{ is_rec-an  DECIMALS = 2 }|.
  lv_ytd = |{ is_rec-ytd DECIMALS = 2 }|.

  CLEAR gv_line.
  add_field 'D'.
  add_field is_rec-satzart.
  add_field is_rec-pernr.
  add_field is_rec-vertrag.
  add_field is_rec-fpper.
  add_field lv_ag.
  add_field lv_an.
  add_field lv_ytd.

* traegerspezifische Aufbereitung (z. B. Vertragsnummer mit Pruefziffer)
  PERFORM format_record IN PROGRAM (gv_prog) CHANGING gv_line IF FOUND.

  TRANSFER gv_line TO p_file.
  gv_count_rec = gv_count_rec + 1.
  gv_sum_ag    = gv_sum_ag + is_rec-ag.
  gv_sum_an    = gv_sum_an + is_rec-an.
ENDFORM.

*----------------------------------------------------------------------*
FORM write_trailer.
  DATA: lv_cnt TYPE string,
        lv_ag  TYPE string,
        lv_an  TYPE string.

  CHECK gv_file_open = abap_true.
  lv_cnt = gv_count_rec.
  lv_ag  = |{ gv_sum_ag DECIMALS = 2 }|.
  lv_an  = |{ gv_sum_an DECIMALS = 2 }|.
  CLEAR gv_line.
  add_field 'S'.
  add_field lv_cnt.
  add_field lv_ag.
  add_field lv_an.
  TRANSFER gv_line TO p_file.
ENDFORM.

*----------------------------------------------------------------------*
FORM close_and_register.
  CHECK gv_file_open = abap_true.
  CLOSE DATASET p_file.

  IF p_test = abap_true.
*   Testlauf: Datei wieder entfernen, nichts vermerken
    DELETE DATASET p_file.
    PERFORM log_add USING 'I' space 'Testlauf - Datei geloescht'.
    RETURN.
  ENDIF.

  IF gv_count_rec = 0.
    PERFORM log_add USING 'W' space 'Keine Saetze - Periode nicht vermerkt'.
    RETURN.
  ENDIF.

  gv_last = gv_inper.
  EXPORT last_period = gv_last
    TO DATABASE indx(zb) ID 'ZBAV_LAST_PERIOD'.
  COMMIT WORK.
  PERFORM log_add USING 'S' space 'Datei erstellt, Periode vermerkt'.
ENDFORM.

*----------------------------------------------------------------------*
FORM log_create.
  DATA ls_log TYPE bal_s_log.
  ls_log-object    = 'ZPY'.
  ls_log-subobject = 'BAV'.
  ls_log-extnumber = |{ p_trag } { gv_inper }|.
  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = ls_log
    IMPORTING
      e_log_handle = gv_log
    EXCEPTIONS
      OTHERS       = 1.
ENDFORM.

*----------------------------------------------------------------------*
FORM log_add USING pv_type  TYPE symsgty
                   pv_pernr TYPE clike
                   pv_text  TYPE clike.
  DATA lv_text TYPE bal_s_msg-msgv1.
  lv_text = |{ pv_pernr } { pv_text }|.
  CALL FUNCTION 'BAL_LOG_MSG_ADD_FREE_TEXT'
    EXPORTING
      i_log_handle = gv_log
      i_msgty      = pv_type
      i_text       = lv_text
    EXCEPTIONS
      OTHERS       = 1.
ENDFORM.

*----------------------------------------------------------------------*
FORM log_display.
  DATA lt_handle TYPE bal_t_logh.
  APPEND gv_log TO lt_handle.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle = lt_handle
    EXCEPTIONS
      OTHERS         = 1.
  IF sy-batch = abap_false.
    CALL FUNCTION 'BAL_DSP_LOG_DISPLAY'
      EXPORTING
        i_t_log_handle = lt_handle
      EXCEPTIONS
        OTHERS         = 1.
  ENDIF.
ENDFORM.
