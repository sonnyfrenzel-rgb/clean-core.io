CLASS zcl_pp_step_report DEFINITION
  PUBLIC
  INHERITING FROM zcl_pp_chain_step
  FINAL
  CREATE PUBLIC.
* Schritt "beliebiger Report mit Variante" (Umsetzung, Ausnahmemail ...)
  PROTECTED SECTION.
    METHODS add_job_steps REDEFINITION.
ENDCLASS.



CLASS zcl_pp_step_report IMPLEMENTATION.

  METHOD add_job_steps.
    SUBMIT (ms_def-progname)
      USING SELECTION-SET ms_def-variant
      VIA JOB ms_job-jobname NUMBER ms_job-jobcount
      AND RETURN.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_pp_chain
        EXPORTING
          textid = zcx_pp_chain=>submit_failed.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
