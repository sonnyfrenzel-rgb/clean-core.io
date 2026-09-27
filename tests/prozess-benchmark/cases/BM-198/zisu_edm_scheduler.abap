*&---------------------------------------------------------------------*
*& Report ZISU_EDM_SCHEDULER
*&---------------------------------------------------------------------*
*& Steuerreport fuer die naechtliche Lastgangübermittlung (RLM-Zaehl-
*& punkte, Viertelstundenwerte) an Messstellenbetreiber / Netzbetreiber.
*&
*& Plant die Jobkette:
*&   1. ZISU_EDM_EXPORT  - Lastgaenge des Stichtags serialisieren/senden
*&   2. ZISU_EDM_RECON   - Versandstatus abgleichen, Nachversandliste
*&
*& Eingeplant taeglich 01:30 ueber SM36 (Job ZISU_EDM_NIGHTLY, Variante
*& NIGHTLY). Manuell nur nach Ruecksprache mit Team Marktkommunikation!
*&---------------------------------------------------------------------*
*& Aenderungshistorie
*& 2017-03-02  KMUELLER   Erstellt (MSCONS-Datei per FTP)
*& 2019-11-14  TSCHNEIDER Umstellung auf HTTP-Gateway, Job 2 neu
*& 2021-06-30  TSCHNEIDER Job 2 wahlweise per Ereignis (p_event)
*& 2022-01-12  AKRAUSE    Not-Aus ueber TVARVC (Incident INC0081544)
*&---------------------------------------------------------------------*
REPORT zisu_edm_scheduler MESSAGE-ID zisu_edm.

CONSTANTS: gc_job_export TYPE btcjob     VALUE 'ZISU_EDM_EXPORT',
           gc_job_recon  TYPE btcjob     VALUE 'ZISU_EDM_RECON',
           gc_event      TYPE btceventid VALUE 'ZISU_EDM_EXPORT_DONE'.

DATA: gv_jobcount_exp TYPE btcjobcnt,
      gv_jobcount_rec TYPE btcjobcnt,
      gv_evtparm      TYPE btcevtparm,
      gv_active       TYPE tvarvc-low.

PARAMETERS: p_date  TYPE sy-datum,
            p_mode  TYPE char1 DEFAULT 'X',              " X = XML, J = JSON
            p_dest  TYPE rfcdest DEFAULT 'ZEDM_MPO_GATEWAY',
            p_event AS CHECKBOX DEFAULT 'X',             " Job 2 per Ereignis
            p_test  AS CHECKBOX.

INITIALIZATION.
* Standard: Vortag (Lastgaenge liegen nach dem Import um 00:45 vor)
  p_date = sy-datum - 1.

AT SELECTION-SCREEN ON p_mode.
  IF p_mode <> 'X' AND p_mode <> 'J'.
    MESSAGE e001 WITH p_mode.
  ENDIF.

START-OF-SELECTION.
* Not-Aus: Betrieb kann die Uebermittlung ohne Transport abschalten
  SELECT SINGLE low FROM tvarvc INTO gv_active
    WHERE name = 'ZISU_EDM_EXPORT_ACTIVE'
      AND type = 'P'
      AND numb = '0000'.
  IF sy-subrc <> 0 OR gv_active <> 'X'.
    MESSAGE s002 DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.

*--- Job 1: Export ----------------------------------------------------*
  CALL FUNCTION 'JOB_OPEN'
    EXPORTING
      jobname          = gc_job_export
    IMPORTING
      jobcount         = gv_jobcount_exp
    EXCEPTIONS
      cant_create_job  = 1
      invalid_job_data = 2
      jobname_missing  = 3
      OTHERS           = 4.
  IF sy-subrc <> 0.
    MESSAGE e003 WITH gc_job_export.
  ENDIF.

  SUBMIT zisu_edm_export
    WITH p_date = p_date
    WITH p_mode = p_mode
    WITH p_dest = p_dest
    WITH p_test = p_test
    VIA JOB gc_job_export NUMBER gv_jobcount_exp
    AND RETURN.

  CALL FUNCTION 'JOB_CLOSE'
    EXPORTING
      jobcount             = gv_jobcount_exp
      jobname              = gc_job_export
      strtimmed            = 'X'
    EXCEPTIONS
      cant_start_immediate = 1
      invalid_startdate    = 2
      jobname_missing      = 3
      job_close_failed     = 4
      job_nosteps          = 5
      job_notex            = 6
      lock_failed          = 7
      OTHERS               = 8.
  IF sy-subrc <> 0.
    MESSAGE e004 WITH gc_job_export sy-subrc.
  ENDIF.

*--- Job 2: Abgleich / Nachversandliste -------------------------------*
  CALL FUNCTION 'JOB_OPEN'
    EXPORTING
      jobname          = gc_job_recon
    IMPORTING
      jobcount         = gv_jobcount_rec
    EXCEPTIONS
      cant_create_job  = 1
      invalid_job_data = 2
      jobname_missing  = 3
      OTHERS           = 4.
* IF sy-subrc <> 0.                    "AK 2022: Job 2 ist nur Komfort
*   MESSAGE e003 WITH gc_job_recon.
* ENDIF.

  SUBMIT zisu_edm_recon
    WITH p_date = p_date
    VIA JOB gc_job_recon NUMBER gv_jobcount_rec
    AND RETURN.

  IF p_event = 'X'.
*   Start erst, wenn der Export das Ereignis mit dem Stichtag ausloest
    gv_evtparm = p_date.
    CALL FUNCTION 'JOB_CLOSE'
      EXPORTING
        jobcount    = gv_jobcount_rec
        jobname     = gc_job_recon
        event_id    = gc_event
        event_param = gv_evtparm
      EXCEPTIONS
        OTHERS      = 8.
  ELSE.
*   alte Variante (bis 06/2021): direkter Nachfolger von Job 1
    CALL FUNCTION 'JOB_CLOSE'
      EXPORTING
        jobcount          = gv_jobcount_rec
        jobname           = gc_job_recon
        pred_jobcount     = gv_jobcount_exp
        pred_jobname      = gc_job_export
        predjob_checkstat = 'X'
      EXCEPTIONS
        OTHERS            = 8.
  ENDIF.
  IF sy-subrc <> 0.
    MESSAGE e004 WITH gc_job_recon sy-subrc.
  ENDIF.

  MESSAGE s005 WITH gv_jobcount_exp gv_jobcount_rec.

*---------------------------------------------------------------------*
* FORM schedule_remote - Einplanung direkt im Altsystem ISU_OLD_PRD
* (vor 2019, seit Umstellung auf HTTP nicht mehr aufgerufen)
*---------------------------------------------------------------------*
FORM schedule_remote.
  CALL FUNCTION 'Z_EDM_REMOTE_SCHEDULE' DESTINATION 'ISU_OLD_PRD'
    EXPORTING
      iv_date = p_date
      iv_mode = p_mode.
ENDFORM.
