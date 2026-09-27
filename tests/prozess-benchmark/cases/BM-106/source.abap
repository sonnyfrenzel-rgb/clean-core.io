REPORT zpm_zaehler_upload.
*----------------------------------------------------------------------*
* Upload Zählerstände aus BDE-Datei (Applikationsserver) -> Messbelege
* Satzaufbau: Equipment;Messpunkt;Datum(JJJJMMTT);Uhrzeit;Zählerstand
* 2015-04 MBR  Erstellung
* 2017-03 MBR  Plausibilisierung über Z_PM_ZAEHLER_PLAUSI
* 2021-09 EXT  TRY/CATCH um Konvertierung (Dump bei Dezimalkomma)
*----------------------------------------------------------------------*
PARAMETERS: p_file TYPE rlgrap-filename LOWER CASE
                   DEFAULT '/usr/sap/trans/bde/zaehler.csv',
            p_test AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_rec,
         equnr TYPE equi-equnr,
         point TYPE imrg-point,
         idate TYPE imrg-idate,
         itime TYPE imrg-itime,
         recdc TYPE c LENGTH 22,
       END OF ty_rec.

DATA: gs_rec   TYPE ty_rec,
      gv_line  TYPE string,
      gv_readg TYPE imrc_readg,
      gv_diff  TYPE imrc_readg,
      gv_mdocm TYPE imrg-mdocm.

START-OF-SELECTION.
  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.
  IF sy-subrc <> 0.
    MESSAGE e050(zpm) WITH p_file.
  ENDIF.

  DO.
    READ DATASET p_file INTO gv_line.
    IF sy-subrc <> 0.
      EXIT.
    ENDIF.
    CLEAR gs_rec.
    SPLIT gv_line AT ';' INTO gs_rec-equnr gs_rec-point
                              gs_rec-idate gs_rec-itime gs_rec-recdc.
    TRY.
        gv_readg = gs_rec-recdc.
      CATCH cx_sy_conversion_no_number.
        WRITE: / 'Satz fehlerhaft:', gv_line.
        CONTINUE.
    ENDTRY.

    CALL FUNCTION 'Z_PM_ZAEHLER_PLAUSI'
      EXPORTING
        iv_point        = gs_rec-point
        iv_readg        = gv_readg
        iv_idate        = gs_rec-idate
      IMPORTING
        ev_diff         = gv_diff
      EXCEPTIONS
        reading_too_low = 1
        OTHERS          = 2.
    IF sy-subrc <> 0.
      WRITE: / gs_rec-point, gs_rec-recdc, 'kleiner als letzter Zählerstand'.
      CONTINUE.
    ENDIF.

    IF p_test = 'X'.
      WRITE: / gs_rec-point, gs_rec-recdc, 'Testlauf, Zuwachs:', gv_diff.
      CONTINUE.
    ENDIF.

    CALL FUNCTION 'MEASUREM_DOCUM_RFC_SINGLE_001'
      EXPORTING
        measurement_point    = gs_rec-point
        reading_date         = gs_rec-idate
        reading_time         = gs_rec-itime
        recorded_value       = gs_rec-recdc
        short_text           = 'BDE-Upload'
        origin_indicator     = 'A'
        commit_work          = space
      IMPORTING
        measurement_document = gv_mdocm
      EXCEPTIONS
        no_authority         = 1
        point_not_found      = 2
        OTHERS               = 3.
    IF sy-subrc <> 0.
      WRITE: / gs_rec-point, 'Fehler beim Anlegen', sy-msgid, sy-msgno.
      CONTINUE.
    ENDIF.
    COMMIT WORK.
  ENDDO.

  CLOSE DATASET p_file.
