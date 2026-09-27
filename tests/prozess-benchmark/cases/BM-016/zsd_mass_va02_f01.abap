*&---------------------------------------------------------------------*
*& Include ZSD_MASS_VA02_F01 - Datei lesen, Anwendungsprotokoll
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  DATEI_LESEN
*&---------------------------------------------------------------------*
FORM datei_lesen.
  DATA: lt_raw  TYPE STANDARD TABLE OF string,
        lv_line TYPE string,
        lv_file TYPE string,
        ls_up   TYPE ty_upload.

  lv_file = p_file.

  IF p_appl = abap_true.
    OPEN DATASET lv_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.
    IF sy-subrc <> 0.
      MESSAGE s602 WITH p_file DISPLAY LIKE 'E'.
      RETURN.
    ENDIF.
    DO.
      READ DATASET lv_file INTO lv_line.
      IF sy-subrc <> 0.
        EXIT.
      ENDIF.
      APPEND lv_line TO lt_raw.
    ENDDO.
    CLOSE DATASET lv_file.
  ELSE.
    CALL FUNCTION 'GUI_UPLOAD'
      EXPORTING
        filename = lv_file
        filetype = 'ASC'
      TABLES
        data_tab = lt_raw
      EXCEPTIONS
        OTHERS   = 17.
    IF sy-subrc <> 0.
      MESSAGE s602 WITH p_file DISPLAY LIKE 'E'.
      RETURN.
    ENDIF.
  ENDIF.

  DELETE lt_raw INDEX 1.                      "Überschriftszeile

  LOOP AT lt_raw INTO lv_line.
    CLEAR ls_up.
    SPLIT lv_line AT ';' INTO ls_up-vbeln ls_up-posnr ls_up-feld ls_up-wert.
    TRANSLATE ls_up-feld TO UPPER CASE.
    ls_up-vbeln = |{ ls_up-vbeln ALPHA = IN }|.
    ls_up-posnr = |{ ls_up-posnr ALPHA = IN }|.
    APPEND ls_up TO gt_upload.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  LOG_ANLEGEN
*&---------------------------------------------------------------------*
FORM log_anlegen.
  DATA ls_log TYPE bal_s_log.

  ls_log-object     = 'ZSD'.
  ls_log-subobject  = 'MASSVA02'.
  ls_log-extnumber  = p_file.
  ls_log-aluser     = sy-uname.
  ls_log-alprog     = sy-repid.

  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = ls_log
    IMPORTING
      e_log_handle = gv_log
    EXCEPTIONS
      OTHERS       = 1.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  LOG_SICHERN
*&---------------------------------------------------------------------*
FORM log_sichern.
  DATA lt_handle TYPE bal_t_logh.

  CHECK p_test = abap_false.

  APPEND gv_log TO lt_handle.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle = lt_handle
    EXCEPTIONS
      OTHERS         = 1.
  COMMIT WORK.
ENDFORM.
