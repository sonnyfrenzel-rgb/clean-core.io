*&---------------------------------------------------------------------*
*& Include ZHR_EMP_EXPORT_F02 - Ausgabe Datei / RFC / Vorschau
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form DISPLAY_PREVIEW - Testlauf: nur anzeigen
*&---------------------------------------------------------------------*
FORM display_preview.
  DATA lo_alv TYPE REF TO cl_salv_table.

  TRY.
      cl_salv_table=>factory(
        IMPORTING
          r_salv_table = lo_alv
        CHANGING
          t_table      = gt_rec ).
      lo_alv->display( ).
    CATCH cx_salv_msg.
      MESSAGE 'Vorschau nicht möglich' TYPE 'I'.
  ENDTRY.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form WRITE_FILE - CSV für den Payroll-Provider
*&---------------------------------------------------------------------*
FORM write_file.
  DATA: lv_line  TYPE string,
        lv_gbdat TYPE c LENGTH 10,
        ls_rec   TYPE ty_rec,
        ls_err   TYPE ty_error.

  OPEN DATASET p_file FOR OUTPUT IN TEXT MODE ENCODING UTF-8.
  IF sy-subrc <> 0.
    ls_err-text = |Datei { p_file } nicht beschreibbar|.
    APPEND ls_err TO gt_error.
    RETURN.
  ENDIF.

  TRANSFER 'SATZART;PERNR;NACHNAME;VORNAME;GEBDAT;BUKRS;KOSTL;ORGEH;STRASSE;PLZ;ORT;EMAIL'
        TO p_file.
  LOOP AT gt_rec INTO ls_rec.
    WRITE ls_rec-gbdat TO lv_gbdat DD/MM/YYYY.
    CONCATENATE ls_rec-satzart ls_rec-pernr ls_rec-nachn ls_rec-vorna
                lv_gbdat ls_rec-bukrs ls_rec-kostl ls_rec-orgeh
                ls_rec-stras ls_rec-pstlz ls_rec-ort01 ls_rec-email
           INTO lv_line SEPARATED BY ';'.
    TRANSFER lv_line TO p_file.
  ENDLOOP.
  CLOSE DATASET p_file.
  gv_file_ok = 'X'.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SEND_TIME_SYSTEM - Stammsätze an Zeiterfassung
*&---------------------------------------------------------------------*
FORM send_time_system.
  DATA: lv_msg TYPE c LENGTH 200,
        ls_err TYPE ty_error.

  IF gt_time IS INITIAL.
    RETURN.
  ENDIF.

  CALL FUNCTION 'Z_TIME_EMP_SYNC'
    DESTINATION p_dest
    TABLES
      it_employees          = gt_time
    EXCEPTIONS
      communication_failure = 1 MESSAGE lv_msg
      system_failure        = 2 MESSAGE lv_msg
      OTHERS                = 3.
  IF sy-subrc <> 0.
    ls_err-text = lv_msg.
    APPEND ls_err TO gt_error.
  ELSE.
    gv_rfc_ok = 'X'.
  ENDIF.
ENDFORM.
