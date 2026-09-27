REPORT zhr_time_import.
* Import Kommen/Gehen-Buchungen aus Zutrittskontrollsystem
* Satzaufbau: PERNR;DATUM;UHRZEIT;SATZART  (P10 = Kommen, P20 = Gehen)
PARAMETERS: p_file TYPE string LOWER CASE
              DEFAULT '/interface/in/zeit/buchungen.csv',
            p_errf TYPE string LOWER CASE
              DEFAULT '/interface/err/zeit/fehler.csv'.

DATA: lv_line   TYPE string,
      ls_rec    TYPE zhr_timerec,
      lv_pernr  TYPE c LENGTH 8,
      lv_date   TYPE c LENGTH 8,
      lv_time   TYPE c LENGTH 6,
      lv_type   TYPE c LENGTH 3,
      lv_stat2  TYPE stat2,
      lv_ok     TYPE i,
      lv_err    TYPE i.

START-OF-SELECTION.
  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.
  IF sy-subrc <> 0.
    MESSAGE e001(zhr_if) WITH p_file.
  ENDIF.
  OPEN DATASET p_errf FOR OUTPUT IN TEXT MODE ENCODING DEFAULT.

  DO.
    READ DATASET p_file INTO lv_line.
    IF sy-subrc <> 0.
      EXIT.
    ENDIF.
    SPLIT lv_line AT ';' INTO lv_pernr lv_date lv_time lv_type.
    CLEAR ls_rec.
    ls_rec-pernr = lv_pernr.
    ls_rec-ldate = lv_date.
    ls_rec-ltime = lv_time.
    ls_rec-satza = lv_type.

    IF lv_type <> 'P10' AND lv_type <> 'P20'.
      TRANSFER lv_line TO p_errf.
      lv_err = lv_err + 1.
      CONTINUE.
    ENDIF.

*   Mitarbeiter muss zum Buchungstag aktiv sein
    SELECT SINGLE stat2 FROM pa0000 INTO lv_stat2
      WHERE pernr = ls_rec-pernr
        AND begda <= ls_rec-ldate
        AND endda >= ls_rec-ldate.
    IF sy-subrc <> 0 OR lv_stat2 <> '3'.
      TRANSFER lv_line TO p_errf.
      lv_err = lv_err + 1.
      CONTINUE.
    ENDIF.

    ls_rec-erdat = sy-datum.
    ls_rec-ernam = sy-uname.
    INSERT zhr_timerec FROM ls_rec.
    IF sy-subrc <> 0.                "Dublette
      TRANSFER lv_line TO p_errf.
      lv_err = lv_err + 1.
    ELSE.
      lv_ok = lv_ok + 1.
    ENDIF.
  ENDDO.

  CLOSE DATASET p_file.
  CLOSE DATASET p_errf.
  COMMIT WORK.
  IF lv_err = 0.
    DELETE DATASET p_file.
  ENDIF.
  WRITE: / 'Übernommen:', lv_ok.
  WRITE: / 'Fehler:', lv_err.
