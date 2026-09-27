REPORT zfi_plan_dunning_job.
* Plant den Mahnlauf-Nachlaufreport als Hintergrundjob ein (FI-AR)
PARAMETERS: p_laufd TYPE sy-datum OBLIGATORY,
            p_laufi TYPE c LENGTH 6 OBLIGATORY.

DATA: lv_jobname  TYPE tbtcjob-jobname VALUE 'ZFI_DUNNING_FOLLOWUP',
      lv_jobcount TYPE tbtcjob-jobcount.

START-OF-SELECTION.
  CALL FUNCTION 'JOB_OPEN'
    EXPORTING
      jobname  = lv_jobname
    IMPORTING
      jobcount = lv_jobcount
    EXCEPTIONS
      OTHERS   = 1.
  IF sy-subrc <> 0.
    MESSAGE 'Job konnte nicht angelegt werden' TYPE 'E'.
  ENDIF.
  SUBMIT zfi_dunning_followup
    WITH p_laufd = p_laufd
    WITH p_laufi = p_laufi
    VIA JOB lv_jobname NUMBER lv_jobcount
    AND RETURN.
  CALL FUNCTION 'JOB_CLOSE'
    EXPORTING
      jobcount  = lv_jobcount
      jobname   = lv_jobname
      strtimmed = 'X'
    EXCEPTIONS
      OTHERS    = 1.
  IF sy-subrc = 0.
    MESSAGE s000(zfi) WITH lv_jobname lv_jobcount.
  ELSE.
    MESSAGE 'Job angelegt, aber nicht freigegeben' TYPE 'I'.
  ENDIF.
