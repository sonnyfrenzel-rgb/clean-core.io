CLASS zcl_fi_job_chain DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* Einfache Jobkette: jeder Schritt ist ein eigener Job, Nachfolger per Vorgaengerjob.

  PUBLIC SECTION.
    TYPES: BEGIN OF ty_step,
             jobname  TYPE btcjob,
             jobcount TYPE btcjobcnt,
           END OF ty_step,
           ty_t_step TYPE STANDARD TABLE OF ty_step WITH EMPTY KEY.

    METHODS constructor
      IMPORTING iv_start_date TYPE sy-datum
                iv_start_time TYPE sy-uzeit.
    METHODS add_step
      IMPORTING iv_jobname   TYPE btcjob
                iv_report    TYPE progname
                iv_variant   TYPE variant
                iv_checkstat TYPE abap_bool DEFAULT abap_true
      RAISING   zcx_fi_job_chain.
    METHODS cancel.
    METHODS get_steps
      RETURNING VALUE(rt_steps) TYPE ty_t_step.

  PRIVATE SECTION.
    DATA: mt_steps TYPE ty_t_step,
          mv_date  TYPE sy-datum,
          mv_time  TYPE sy-uzeit.

    METHODS check_variant
      IMPORTING iv_report  TYPE progname
                iv_variant TYPE variant
      RAISING   zcx_fi_job_chain.
ENDCLASS.



CLASS zcl_fi_job_chain IMPLEMENTATION.

  METHOD constructor.
    mv_date = iv_start_date.
    mv_time = iv_start_time.
  ENDMETHOD.


  METHOD add_step.
    DATA: ls_step TYPE ty_step,
          ls_prev TYPE ty_step.

    check_variant( iv_report = iv_report iv_variant = iv_variant ).

    ls_step-jobname = iv_jobname.
    CALL FUNCTION 'JOB_OPEN'
      EXPORTING
        jobname  = ls_step-jobname
      IMPORTING
        jobcount = ls_step-jobcount
      EXCEPTIONS
        OTHERS   = 1.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_fi_job_chain
        EXPORTING
          textid  = zcx_fi_job_chain=>open_failed
          jobname = iv_jobname.
    ENDIF.

    SUBMIT (iv_report)
      USING SELECTION-SET iv_variant
      VIA JOB ls_step-jobname NUMBER ls_step-jobcount
      AND RETURN.
    IF sy-subrc <> 0.
*     angelegten, leeren Job wieder wegwerfen
      CALL FUNCTION 'BP_JOB_DELETE'
        EXPORTING
          jobcount   = ls_step-jobcount
          jobname    = ls_step-jobname
          forcedmode = 'X'
        EXCEPTIONS
          OTHERS     = 1.
      RAISE EXCEPTION TYPE zcx_fi_job_chain
        EXPORTING
          textid  = zcx_fi_job_chain=>submit_failed
          jobname = iv_jobname.
    ENDIF.

    IF mt_steps IS INITIAL.
*     erster Schritt: Starttermin
      CALL FUNCTION 'JOB_CLOSE'
        EXPORTING
          jobcount  = ls_step-jobcount
          jobname   = ls_step-jobname
          sdlstrtdt = mv_date
          sdlstrttm = mv_time
        EXCEPTIONS
          OTHERS    = 1.
    ELSE.
*     Folgeschritt: startet nach dem vorherigen Job
      ls_prev = mt_steps[ lines( mt_steps ) ].
      CALL FUNCTION 'JOB_CLOSE'
        EXPORTING
          jobcount          = ls_step-jobcount
          jobname           = ls_step-jobname
          pred_jobcount     = ls_prev-jobcount
          pred_jobname      = ls_prev-jobname
          predjob_checkstat = iv_checkstat
        EXCEPTIONS
          OTHERS            = 1.
    ENDIF.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_fi_job_chain
        EXPORTING
          textid  = zcx_fi_job_chain=>close_failed
          jobname = iv_jobname.
    ENDIF.

    APPEND ls_step TO mt_steps.
  ENDMETHOD.


  METHOD cancel.
*   alle bisher eingeplanten Schritte loeschen (Fehler werden ignoriert)
    LOOP AT mt_steps INTO DATA(ls_step).
      CALL FUNCTION 'BP_JOB_DELETE'
        EXPORTING
          jobcount   = ls_step-jobcount
          jobname    = ls_step-jobname
          forcedmode = 'X'
        EXCEPTIONS
          OTHERS     = 1.
    ENDLOOP.
    CLEAR mt_steps.
  ENDMETHOD.


  METHOD get_steps.
    rt_steps = mt_steps.
  ENDMETHOD.


  METHOD check_variant.
    DATA lv_rc TYPE sy-subrc.

    CALL FUNCTION 'RS_VARIANT_EXISTS'
      EXPORTING
        report  = iv_report
        variant = iv_variant
      IMPORTING
        r_c     = lv_rc
      EXCEPTIONS
        OTHERS  = 1.
    IF sy-subrc <> 0 OR lv_rc <> 0.
      RAISE EXCEPTION TYPE zcx_fi_job_chain
        EXPORTING
          textid  = zcx_fi_job_chain=>variant_missing
          jobname = CONV #( iv_variant ).
    ENDIF.
  ENDMETHOD.

ENDCLASS.
