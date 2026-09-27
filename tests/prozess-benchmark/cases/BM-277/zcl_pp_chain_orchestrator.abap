CLASS zcl_pp_chain_orchestrator DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Plant, ueberwacht und startet die Dispositionskette neu.
* Laufprotokoll: ZPP_CHAIN_RUN (je Schritt Jobname/-nummer/Status)
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_state,
             step_no TYPE zpp_step_no,
             jobname TYPE btcjob,
             status  TYPE btcstatus,
           END OF ty_state,
           ty_t_state TYPE STANDARD TABLE OF ty_state WITH EMPTY KEY.

    METHODS constructor
      IMPORTING iv_chain_id TYPE zpp_chain_id.
    METHODS plan
      IMPORTING iv_date          TYPE sy-datum
                iv_time          TYPE sy-uzeit
                iv_from_step     TYPE zpp_step_no DEFAULT 0
      RETURNING VALUE(rv_run_id) TYPE zpp_run_id
      RAISING   zcx_pp_chain.
    METHODS monitor
      IMPORTING iv_run_id       TYPE zpp_run_id
      RETURNING VALUE(rt_state) TYPE ty_t_state.
    METHODS restart
      IMPORTING iv_run_id TYPE zpp_run_id
      RAISING   zcx_pp_chain.

  PRIVATE SECTION.
    DATA: mv_chain_id TYPE zpp_chain_id,
          mt_planned  TYPE STANDARD TABLE OF zcl_pp_chain_step=>ty_job WITH EMPTY KEY.

    METHODS cancel_planned.
ENDCLASS.



CLASS zcl_pp_chain_orchestrator IMPLEMENTATION.

  METHOD constructor.
    mv_chain_id = iv_chain_id.
  ENDMETHOD.


  METHOD plan.
    DATA: lt_def  TYPE STANDARD TABLE OF zpp_chain_step,
          ls_pred TYPE zcl_pp_chain_step=>ty_job,
          ls_job  TYPE zcl_pp_chain_step=>ty_job,
          ls_run  TYPE zpp_chain_run,
          lo_step TYPE REF TO zcl_pp_chain_step.

    SELECT * FROM zpp_chain_step INTO TABLE lt_def
      WHERE chain_id = mv_chain_id
        AND step_no >= iv_from_step
        AND inactive = abap_false
      ORDER BY step_no.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_pp_chain
        EXPORTING
          textid = zcx_pp_chain=>no_steps.
    ENDIF.

*   Lauf-ID = Zeitstempel (UUID war fuer die Anzeige zu unhandlich)
    rv_run_id = |{ sy-datum }{ sy-uzeit }|.

    CLEAR mt_planned.
    LOOP AT lt_def INTO DATA(ls_def).
      TRY.
          lo_step = zcl_pp_chain_step=>create( ls_def ).
          ls_job = lo_step->schedule( is_pred = ls_pred
                                      iv_date = iv_date
                                      iv_time = iv_time ).
        CLEANUP.
*         Kette nie halb eingeplant stehen lassen
          cancel_planned( ).
      ENDTRY.
      APPEND ls_job TO mt_planned.
      ls_pred = ls_job.

      ls_run-run_id   = rv_run_id.
      ls_run-chain_id = mv_chain_id.
      ls_run-step_no  = ls_def-step_no.
      ls_run-jobname  = ls_job-jobname.
      ls_run-jobcount = ls_job-jobcount.
      ls_run-status   = 'P'.
      INSERT zpp_chain_run FROM ls_run.
    ENDLOOP.
    COMMIT WORK.
  ENDMETHOD.


  METHOD monitor.
    DATA: lt_run    TYPE STANDARD TABLE OF zpp_chain_run,
          lv_status TYPE btcstatus.

    SELECT * FROM zpp_chain_run INTO TABLE lt_run
      WHERE run_id = iv_run_id
      ORDER BY step_no.

    LOOP AT lt_run ASSIGNING FIELD-SYMBOL(<ls_run>).
      CALL FUNCTION 'BP_JOB_STATUS_GET'
        EXPORTING
          jobcount = <ls_run>-jobcount
          jobname  = <ls_run>-jobname
        IMPORTING
          status   = lv_status
        EXCEPTIONS
          OTHERS   = 1.
      IF sy-subrc <> 0.
        lv_status = '?'.
      ENDIF.
      IF lv_status <> <ls_run>-status.
        UPDATE zpp_chain_run SET status = lv_status
          WHERE run_id  = <ls_run>-run_id
            AND step_no = <ls_run>-step_no.
      ENDIF.
      APPEND VALUE #( step_no = <ls_run>-step_no
                      jobname = <ls_run>-jobname
                      status  = lv_status ) TO rt_state.
    ENDLOOP.
    COMMIT WORK.
  ENDMETHOD.


  METHOD restart.
    DATA lt_state TYPE ty_t_state.

    lt_state = monitor( iv_run_id ).
    READ TABLE lt_state INTO DATA(ls_failed) WITH KEY status = 'A'.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_pp_chain
        EXPORTING
          textid = zcx_pp_chain=>nothing_to_restart.
    ENDIF.

*   Folgeschritte des abgebrochenen Laufs warten ewig auf den Vorgaenger -> loeschen
    LOOP AT lt_state INTO DATA(ls_state) WHERE step_no > ls_failed-step_no
                                           AND status = 'P'.
      SELECT SINGLE jobcount FROM zpp_chain_run INTO @DATA(lv_jobcount)
        WHERE run_id  = @iv_run_id
          AND step_no = @ls_state-step_no.
      CALL FUNCTION 'BP_JOB_DELETE'
        EXPORTING
          jobcount   = lv_jobcount
          jobname    = ls_state-jobname
          forcedmode = 'X'
        EXCEPTIONS
          OTHERS     = 1.
    ENDLOOP.

*   neuer Lauf ab dem abgebrochenen Schritt, sofort
    plan( iv_date      = sy-datum
          iv_time      = sy-uzeit
          iv_from_step = ls_failed-step_no ).
  ENDMETHOD.


  METHOD cancel_planned.
    LOOP AT mt_planned INTO DATA(ls_job).
      CALL FUNCTION 'BP_JOB_DELETE'
        EXPORTING
          jobcount   = ls_job-jobcount
          jobname    = ls_job-jobname
          forcedmode = 'X'
        EXCEPTIONS
          OTHERS     = 1.
    ENDLOOP.
    CLEAR mt_planned.
  ENDMETHOD.

ENDCLASS.
