*&---------------------------------------------------------------------*
*&  Include  ZFI_BANKSTMT_IN_F01 - Dateien, Sperren, Wiederaufsetzpunkt
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&  Form GET_FILES
*&---------------------------------------------------------------------*
FORM get_files.
  DATA lt_dir TYPE STANDARD TABLE OF eps2fili.

  CALL FUNCTION 'EPS2_GET_DIRECTORY_LISTING'
    EXPORTING
      iv_dir_name            = p_dir
      file_mask              = '*.csv'
    TABLES
      dir_list               = lt_dir
    EXCEPTIONS
      invalid_eps_subdir     = 1
      sapgparam_failed       = 2
      build_directory_failed = 3
      no_authorization       = 4
      read_directory_failed  = 5
      too_many_read_errors   = 6
      empty_directory_list   = 7
      OTHERS                 = 8.
  IF sy-subrc <> 0 AND sy-subrc <> 7.
    MESSAGE e102 WITH p_dir sy-subrc.
  ENDIF.

  LOOP AT lt_dir INTO DATA(ls_dir).
*   leere Dateien kommen bei Verbindungsabbruch der Bank vor
    CHECK ls_dir-size > 0.
    APPEND VALUE #( name = ls_dir-name size = ls_dir-size ) TO gt_files.
  ENDLOOP.
  SORT gt_files BY name.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form LOCK_FILE / UNLOCK_FILE - paralleler Lauf auf dieselbe Datei
*&---------------------------------------------------------------------*
FORM lock_file USING    pv_name   TYPE eps2filnam
               CHANGING pv_locked TYPE abap_bool.
  CALL FUNCTION 'ENQUEUE_EZFI_STMTFILE'
    EXPORTING
      filename       = pv_name
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  pv_locked = xsdbool( sy-subrc = 0 ).
ENDFORM.

FORM unlock_file USING pv_name TYPE eps2filnam.
  CALL FUNCTION 'DEQUEUE_EZFI_STMTFILE'
    EXPORTING
      filename = pv_name.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form READ_CHECKPOINT - erste noch nicht gebuchte Zeile
*&---------------------------------------------------------------------*
FORM read_checkpoint USING    pv_name  TYPE eps2filnam
                     CHANGING pv_start TYPE i.
  SELECT SINGLE last_line FROM zfi_stmt_chkpt INTO pv_start
    WHERE filename = pv_name.
  IF sy-subrc <> 0.
    pv_start = 1.                        "Zeile 1 = Ueberschrift
  ELSE.
    WRITE: / pv_name, 'Wiederaufsetzen nach Zeile'(013), pv_start.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form READ_FILE
*&---------------------------------------------------------------------*
FORM read_file USING    pv_name TYPE eps2filnam
               CHANGING pv_ok   TYPE abap_bool.
  DATA: lv_path TYPE string,
        lv_line TYPE string.

  CLEAR gt_lines.
  pv_ok = abap_false.
  lv_path = |{ p_dir }{ pv_name }|.

  OPEN DATASET lv_path FOR INPUT IN TEXT MODE ENCODING DEFAULT.
  IF sy-subrc <> 0.
    WRITE: / pv_name, 'nicht lesbar'(014).
    RETURN.
  ENDIF.
  DO.
    READ DATASET lv_path INTO lv_line.
    IF sy-subrc <> 0.
      EXIT.
    ENDIF.
    APPEND lv_line TO gt_lines.
  ENDDO.
  CLOSE DATASET lv_path.

* Ueberschrift pruefen - falsches Format geht ins Fehlerverzeichnis
  READ TABLE gt_lines INTO lv_line INDEX 1.
  IF lv_line NP 'BANKL;BANKN;*'.
    WRITE: / pv_name, 'unbekanntes Format'(015).
    RETURN.
  ENDIF.
  pv_ok = abap_true.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form MOVE_FILE - nach Archiv oder Fehlerverzeichnis verschieben
*&---------------------------------------------------------------------*
FORM move_file USING pv_name   TYPE eps2filnam
                     pv_target TYPE eps2filnam.
  DATA: lv_src  TYPE string,
        lv_dst  TYPE string,
        lv_line TYPE string.

  lv_src = |{ p_dir }{ pv_name }|.
  lv_dst = |{ pv_target }{ sy-datum }_{ pv_name }|.

  OPEN DATASET lv_dst FOR OUTPUT IN TEXT MODE ENCODING DEFAULT.
  IF sy-subrc <> 0.
    MESSAGE i103 WITH lv_dst.
    RETURN.
  ENDIF.
  LOOP AT gt_lines INTO lv_line.
    TRANSFER lv_line TO lv_dst.
  ENDLOOP.
  CLOSE DATASET lv_dst.
  DELETE DATASET lv_src.
ENDFORM.
