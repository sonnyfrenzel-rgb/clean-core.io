*----------------------------------------------------------------------*
***INCLUDE ZFI_PAYFILE_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form CHECK_RUN - Berechtigung und Zahllaufstatus
*&---------------------------------------------------------------------*
FORM check_run.
  AUTHORITY-CHECK OBJECT 'F_REGU_BUK'
    ID 'FBTCH' FIELD '25'
    ID 'BUKRS' FIELD p_zbukr.
  IF sy-subrc <> 0.
    MESSAGE e010 WITH p_zbukr.
  ENDIF.

  SELECT SINGLE * FROM reguv INTO gs_reguv
    WHERE laufd = p_laufd
      AND laufi = p_laufi.
  IF sy-subrc <> 0 OR gs_reguv-xecht IS INITIAL.
    MESSAGE e011 WITH p_laufd p_laufi.
  ENDIF.

* CR-812: Doppelerzeugung prueft die Bank, hier deaktiviert
*  SELECT COUNT(*) FROM zfi_payfile_log
*    WHERE laufd = p_laufd AND laufi = p_laufi AND zbukr = p_zbukr.
*  IF sy-subrc = 0.
*    MESSAGE e012 WITH p_laufd p_laufi.
*  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form BUILD_RECORDS - Datensaetze je Zahlung
*&---------------------------------------------------------------------*
FORM build_records.
  DATA: lt_xblnr  TYPE STANDARD TABLE OF xblnr1,
        lv_zweck  TYPE string,
        lv_betrag TYPE rwbtr,
        lv_amount TYPE string,
        lv_line   TYPE string.
  FIELD-SYMBOLS <ls_reguh> TYPE reguh.

  LOOP AT gt_reguh ASSIGNING <ls_reguh>.
    IF <ls_reguh>-ziban IS INITIAL OR <ls_reguh>-zswif IS INITIAL.
      CLEAR gs_err.
      gs_err-vblnr = <ls_reguh>-vblnr.
      gs_err-empfg = <ls_reguh>-empfg.
      gs_err-text  = 'IBAN/BIC fehlt - Zahlung nicht in Datei'.
      APPEND gs_err TO gt_err.
      CONTINUE.
    ENDIF.

*   Verwendungszweck = Referenzen der bezahlten Rechnungen
    SELECT xblnr FROM regup INTO TABLE lt_xblnr
      WHERE laufd = <ls_reguh>-laufd
        AND laufi = <ls_reguh>-laufi
        AND xvorl = space
        AND zbukr = <ls_reguh>-zbukr
        AND lifnr = <ls_reguh>-lifnr
        AND kunnr = <ls_reguh>-kunnr
        AND empfg = <ls_reguh>-empfg
        AND vblnr = <ls_reguh>-vblnr.
    CONCATENATE LINES OF lt_xblnr INTO lv_zweck SEPARATED BY ','.
    IF strlen( lv_zweck ) > 140.
      lv_zweck = lv_zweck(140).
    ENDIF.

*   RWBTR ist bei Ausgangszahlungen negativ
    lv_betrag = abs( <ls_reguh>-rwbtr ).
    lv_amount = |{ lv_betrag CURRENCY = <ls_reguh>-waers }|.
    lv_line = |D;{ <ls_reguh>-vblnr };{ <ls_reguh>-znme1 };{ <ls_reguh>-ziban };|
           && |{ <ls_reguh>-zswif };{ lv_amount };{ <ls_reguh>-waers };{ lv_zweck }|.
    APPEND lv_line TO gt_lines.
    gv_count = gv_count + 1.
    gv_sum   = gv_sum + lv_betrag.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form WRITE_FILE - Datei auf Applikationsserver
*&---------------------------------------------------------------------*
FORM write_file.
  DATA lv_line TYPE string.

  OPEN DATASET p_file FOR OUTPUT IN TEXT MODE ENCODING UTF-8.
  IF sy-subrc <> 0.
    MESSAGE e020 WITH p_file.
  ENDIF.

* Kopfsatz
  lv_line = |H;{ p_zbukr };{ p_laufd };{ p_laufi };{ sy-datum }|.
  TRANSFER lv_line TO p_file.
* Einzelsaetze
  LOOP AT gt_lines INTO lv_line.
    TRANSFER lv_line TO p_file.
  ENDLOOP.
* Summensatz
  lv_line = |T;{ gv_count };{ gv_sum }|.
  TRANSFER lv_line TO p_file.
  CLOSE DATASET p_file.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form LOG_RUN - Erzeugung protokollieren
*&---------------------------------------------------------------------*
FORM log_run.
  DATA ls_log TYPE zfi_payfile_log.

  ls_log-laufd  = p_laufd.
  ls_log-laufi  = p_laufi.
  ls_log-zbukr  = p_zbukr.
  ls_log-fname  = p_file.
  ls_log-anzahl = gv_count.
  ls_log-summe  = gv_sum.
  ls_log-ernam  = sy-uname.
  ls_log-erdat  = sy-datum.
  ls_log-erzeit = sy-uzeit.
  INSERT zfi_payfile_log FROM ls_log.
  IF sy-subrc <> 0.
*   Satz existiert schon (erneute Erzeugung) - Datei trotzdem geschrieben
    MESSAGE s021 WITH p_laufd p_laufi DISPLAY LIKE 'W'.
  ENDIF.
ENDFORM.
