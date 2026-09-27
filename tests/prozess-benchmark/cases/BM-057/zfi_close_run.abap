*&---------------------------------------------------------------------*
*& Report ZFI_CLOSE_RUN
*&---------------------------------------------------------------------*
*& Monatsabschluss-Steuerung (Hintergrundjob ZFI_CLOSE_MONTH)
*& Fuehrt die im Customizing ZFI_CLOSE_STEP hinterlegten Abschluss-
*& schritte einer Laufart in der Reihenfolge SEQNO aus.
*&---------------------------------------------------------------------*
*& Historie
*& 2011-10-04 HBE  Erstversion (nur Abgrenzungen + AfA)
*& 2013-02-18 HBE  Parallelisierung je Buchungskreis (Pruefschritte)
*& 2015-11-30 KLA  Restart-Faehigkeit ueber ZFI_CLOSE_STAT
*& 2017-06-12 MSC  Mail via BCS statt SAPoffice-Express
*& 2019-03-07 KLA  Schritttyp 'B' (Funktionsbaustein aus Customizing)
*&---------------------------------------------------------------------*
REPORT zfi_close_run MESSAGE-ID zfi_close.

INCLUDE zfi_close_run_top.
INCLUDE zfi_close_run_f01.
INCLUDE zfi_close_run_f02.

START-OF-SELECTION.

* Anwendungsprotokoll anlegen (Objekt ZFI / Unterobjekt CLOSE)
  gs_bal_log-object     = 'ZFI'.
  gs_bal_log-subobject  = 'CLOSE'.
  gs_bal_log-extnumber  = p_runid.
  gs_bal_log-aldate_del = sy-datum + 180.
  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log                 = gs_bal_log
    IMPORTING
      e_log_handle            = gv_log
    EXCEPTIONS
      log_header_inconsistent = 1
      OTHERS                  = 2.

* Laufsperre - pro Lauf-ID und Periode darf nur ein Job laufen
  CALL FUNCTION 'ENQUEUE_EZFI_CLOSE_RUN'
    EXPORTING
      mode_zfi_close_run = 'E'
      mandt              = sy-mandt
      runid              = p_runid
      gjahr              = p_gjahr
      monat              = p_monat
    EXCEPTIONS
      foreign_lock       = 1
      system_failure     = 2
      OTHERS             = 3.
  IF sy-subrc <> 0.
*   Job-Log: Lauf &1 wird bereits von &2 bearbeitet
    MESSAGE i001 WITH p_runid sy-msgv1.
    RETURN.
  ENDIF.

* Perioden pruefen - nur Buchungskreise mit offener Periode laufen mit
  PERFORM check_periods.
  IF gt_bukrs IS INITIAL.
*   keine offene Periode -> nichts zu tun, Laufkopf bekommt Status E
*   MESSAGE e002 WITH p_gjahr p_monat.   "bricht Job ab - nicht gewollt
  ELSE.
*   Schrittliste aus Customizing, sortiert nach Reihenfolge
    SELECT * FROM zfi_close_step INTO TABLE gt_steps
      WHERE rtype  = p_rtype
        AND active = abap_true
      ORDER BY seqno.
*   bereits gelaufene Schritte dieses Laufs (Restart nach Abbruch)
    SELECT * FROM zfi_close_stat INTO TABLE gt_stat
      WHERE runid = p_runid
        AND gjahr = p_gjahr
        AND monat = p_monat.
    PERFORM execute_steps.
  ENDIF.

* PERFORM send_express_mail.   "2017 abgeloest, siehe SEND_MAIL
  PERFORM finish_run.
