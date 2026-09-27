CLASS zcl_pp_chain_step DEFINITION
  PUBLIC
  ABSTRACT
  CREATE PROTECTED.
*----------------------------------------------------------------------*
* Ein Schritt der Dispositionskette = ein Hintergrundjob.
* SCHEDULE ist die Schablone: Voraussetzung pruefen, Job anlegen,
* Jobschritte (abstrakt) einplanen, Job freigeben.
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_job,
             jobname  TYPE btcjob,
             jobcount TYPE btcjobcnt,
           END OF ty_job.

    METHODS constructor
      IMPORTING is_def TYPE zpp_chain_step.

    CLASS-METHODS create
      IMPORTING is_def         TYPE zpp_chain_step
      RETURNING VALUE(ro_step) TYPE REF TO zcl_pp_chain_step
      RAISING   zcx_pp_chain.

    METHODS schedule FINAL
      IMPORTING is_pred       TYPE ty_job OPTIONAL
                iv_date       TYPE sy-datum
                iv_time       TYPE sy-uzeit
      RETURNING VALUE(rs_job) TYPE ty_job
      RAISING   zcx_pp_chain.

  PROTECTED SECTION.
    DATA: ms_def TYPE zpp_chain_step,
          ms_job TYPE ty_job.

    METHODS check_prerequisite
      RAISING zcx_pp_chain.
    METHODS add_job_steps ABSTRACT
      RAISING zcx_pp_chain.
ENDCLASS.



CLASS zcl_pp_chain_step IMPLEMENTATION.

  METHOD create.
    CASE is_def-step_type.
      WHEN 'R'.
        ro_step = NEW zcl_pp_step_report( is_def ).
      WHEN 'M'.
        ro_step = NEW zcl_pp_step_mrp( is_def ).
      WHEN OTHERS.
        RAISE EXCEPTION TYPE zcx_pp_chain
          EXPORTING
            textid = zcx_pp_chain=>unknown_step_type.
    ENDCASE.
  ENDMETHOD.


  METHOD constructor.
    ms_def = is_def.
  ENDMETHOD.


  METHOD schedule.
    check_prerequisite( ).

    ms_job-jobname = |ZPP_{ ms_def-chain_id }_{ ms_def-step_no }|.
    CALL FUNCTION 'JOB_OPEN'
      EXPORTING
        jobname  = ms_job-jobname
      IMPORTING
        jobcount = ms_job-jobcount
      EXCEPTIONS
        OTHERS   = 1.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_pp_chain
        EXPORTING
          textid = zcx_pp_chain=>job_open_failed.
    ENDIF.

    add_job_steps( ).

    IF is_pred IS INITIAL.
      CALL FUNCTION 'JOB_CLOSE'
        EXPORTING
          jobcount  = ms_job-jobcount
          jobname   = ms_job-jobname
          sdlstrtdt = iv_date
          sdlstrttm = iv_time
        EXCEPTIONS
          OTHERS    = 1.
    ELSE.
      CALL FUNCTION 'JOB_CLOSE'
        EXPORTING
          jobcount          = ms_job-jobcount
          jobname           = ms_job-jobname
          pred_jobcount     = is_pred-jobcount
          pred_jobname      = is_pred-jobname
          predjob_checkstat = ms_def-need_success
        EXCEPTIONS
          OTHERS            = 1.
    ENDIF.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_pp_chain
        EXPORTING
          textid = zcx_pp_chain=>job_close_failed.
    ENDIF.
    rs_job = ms_job.
  ENDMETHOD.


  METHOD check_prerequisite.
*   Standard: keine Voraussetzung
    RETURN.
  ENDMETHOD.

ENDCLASS.
