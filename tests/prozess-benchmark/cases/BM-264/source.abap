REPORT zhr_time_file_load.
*----------------------------------------------------------------------*
* Zeiterfassung Terminal-Export -> Staging ZHR_TIME_STG
* Wiederaufsetzbar: Zeilenzaehler in ZHR_IF_CHKPT, Commit je Paket
* 2014-09 TR  Anlage / 2017-02 TR Wiederaufsetzpunkt
*----------------------------------------------------------------------*
PARAMETERS: p_file TYPE string LOWER CASE
                   DEFAULT '/interface/hr/in/time_export.csv',
            p_pack TYPE i DEFAULT 500.

DATA: lv_line   TYPE string,
      lv_lineno TYPE i,
      lv_last   TYPE i,
      lv_okcnt  TYPE i,
      lv_errcnt TYPE i,
      ls_stg    TYPE zhr_time_stg,
      ls_chkpt  TYPE zhr_if_chkpt,
      lv_pernr  TYPE pernr_d,
      lv_datum  TYPE c LENGTH 8,
      lv_hours  TYPE c LENGTH 10.

START-OF-SELECTION.
  SELECT SINGLE * FROM zhr_if_chkpt INTO ls_chkpt
    WHERE ifname = 'TIME_IN'
      AND filename = p_file.
  IF sy-subrc = 0.
    lv_last = ls_chkpt-lineno.
    MESSAGE i000(zhr) WITH 'Wiederaufsetzen nach Zeile' lv_last.
  ELSE.
    ls_chkpt-ifname   = 'TIME_IN'.
    ls_chkpt-filename = p_file.
  ENDIF.

  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.
  IF sy-subrc <> 0.
    MESSAGE e001(zhr) WITH p_file.
  ENDIF.

  DO.
    READ DATASET p_file INTO lv_line.
    IF sy-subrc <> 0.
      EXIT.
    ENDIF.
    lv_lineno = lv_lineno + 1.
    IF lv_lineno <= lv_last.
      CONTINUE.                        "bereits verarbeitet
    ENDIF.

    SPLIT lv_line AT ';' INTO lv_pernr lv_datum lv_hours.
    SELECT SINGLE pernr FROM pa0001 INTO lv_pernr
      WHERE pernr = lv_pernr
        AND endda >= lv_datum
        AND begda <= lv_datum.
    IF sy-subrc <> 0.
      lv_errcnt = lv_errcnt + 1.
      WRITE: / 'Zeile', lv_lineno, 'Personalnummer unbekannt:', lv_pernr.
      CONTINUE.
    ENDIF.

    CLEAR ls_stg.
    ls_stg-pernr  = lv_pernr.
    ls_stg-datum  = lv_datum.
    ls_stg-anzhl  = lv_hours.
    ls_stg-status = 'N'.
    INSERT zhr_time_stg FROM ls_stg.
    lv_okcnt = lv_okcnt + 1.

    IF lv_lineno MOD p_pack = 0.
      ls_chkpt-lineno = lv_lineno.
      MODIFY zhr_if_chkpt FROM ls_chkpt.
      COMMIT WORK.
    ENDIF.
  ENDDO.
  CLOSE DATASET p_file.

* Datei komplett: Wiederaufsetzpunkt entfernen
  DELETE FROM zhr_if_chkpt WHERE ifname = 'TIME_IN' AND filename = p_file.
  COMMIT WORK.
  WRITE: / 'Uebernommen:', lv_okcnt, 'Fehler:', lv_errcnt.
