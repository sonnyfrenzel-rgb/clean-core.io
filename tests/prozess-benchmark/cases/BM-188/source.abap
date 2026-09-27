REPORT zret_pos_jobkette.
*----------------------------------------------------------------------*
* Jobkette POS-Abverkaufsverbuchung je Filiale
* Für jede Filiale mit unverbuchten Kassendaten des Buchungstags wird
* ein Job ZPOS_<Filiale>_<Datum> mit Report ZRET_POS_VERBUCHEN eingeplant.
* Die Jobs laufen nacheinander (Vorgängerjob), damit sich die
* Bestandsbuchungen der Filialen nicht gegenseitig sperren.
*----------------------------------------------------------------------*
TABLES t001w.
SELECT-OPTIONS s_werks FOR t001w-werks.
PARAMETERS: p_budat TYPE budat,
            p_test  AS CHECKBOX.

DATA: gv_jobname    TYPE btcjob,
      gv_jobcount   TYPE btcjobcnt,
      gv_prev_name  TYPE btcjob,
      gv_prev_count TYPE btcjobcnt,
      gv_anzahl     TYPE i.

INITIALIZATION.
  p_budat = sy-datum - 1.

START-OF-SELECTION.
  SELECT werks, name1 FROM t001w
    WHERE werks IN @s_werks
      AND vlfkz = 'A'
    INTO TABLE @DATA(lt_filialen).
  IF lt_filialen IS INITIAL.
    MESSAGE 'Keine Filialen selektiert' TYPE 'S' DISPLAY LIKE 'E'.
    STOP.
  ENDIF.

  LOOP AT lt_filialen INTO DATA(ls_fil).
    SELECT COUNT(*) FROM zret_pos_ein
      WHERE werks  = @ls_fil-werks
        AND budat  = @p_budat
        AND status = ' '.
    CHECK sy-dbcnt > 0.

    gv_jobname = |ZPOS_{ ls_fil-werks }_{ p_budat }|.
    CALL FUNCTION 'JOB_OPEN'
      EXPORTING
        jobname          = gv_jobname
      IMPORTING
        jobcount         = gv_jobcount
      EXCEPTIONS
        cant_create_job  = 1
        invalid_job_data = 2
        jobname_missing  = 3
        OTHERS           = 4.
    IF sy-subrc <> 0.
      WRITE: / 'Job konnte nicht angelegt werden:', ls_fil-werks.
      CONTINUE.
    ENDIF.

    SUBMIT zret_pos_verbuchen
      WITH p_werks = ls_fil-werks
      WITH p_budat = p_budat
      WITH p_test  = p_test
      VIA JOB gv_jobname NUMBER gv_jobcount
      AND RETURN.

    DATA(lv_sofort) = xsdbool( gv_prev_name IS INITIAL ).
    CALL FUNCTION 'JOB_CLOSE'
      EXPORTING
        jobcount          = gv_jobcount
        jobname           = gv_jobname
        strtimmed         = lv_sofort
        pred_jobcount     = gv_prev_count
        pred_jobname      = gv_prev_name
        predjob_checkstat = 'X'
      EXCEPTIONS
        OTHERS            = 1.
*   IF sy-subrc <> 0.  -> Fehlerbehandlung fehlt noch (Ticket 4711)

    gv_prev_name  = gv_jobname.
    gv_prev_count = gv_jobcount.
    gv_anzahl     = gv_anzahl + 1.
  ENDLOOP.

  WRITE: / gv_anzahl, 'Filialjobs eingeplant'.
