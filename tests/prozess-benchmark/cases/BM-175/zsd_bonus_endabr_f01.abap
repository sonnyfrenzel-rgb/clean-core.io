*----------------------------------------------------------------------*
***INCLUDE ZSD_BONUS_ENDABR_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  ABSPRACHEN_LESEN
*&---------------------------------------------------------------------*
*       abgelaufene, noch nicht endabgerechnete Absprachen
*----------------------------------------------------------------------*
FORM absprachen_lesen.
  SELECT boart knuma vkorg bonem datbi FROM kona
    INTO TABLE gt_abs
    WHERE vkorg IN s_vkorg
      AND boart IN s_boart
      AND datbi <  p_stich
      AND bosta IN (' ', 'A').
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  VORPRUEFUNG
*&---------------------------------------------------------------------*
*       Freigabe Controlling + optionale Zusatzpruefung je Absprachenart
*----------------------------------------------------------------------*
FORM vorpruefung USING    us_abs TYPE ty_abs
                 CHANGING cv_ok  TYPE abap_bool.
  DATA: lv_prog TYPE progname,
        lv_form TYPE char30.

  cv_ok = abap_false.
  SELECT SINGLE freigabe FROM zsd_bonus_frg INTO @DATA(lv_frg)
    WHERE knuma = @us_abs-knuma.
  IF sy-subrc <> 0 OR lv_frg <> 'X'.
    WRITE: / us_abs-knuma, 'nicht vom Controlling freigegeben'.
    RETURN.
  ENDIF.

  cv_ok = abap_true.
* Zusatzpruefung je Absprachenart, Programm/Routine aus ZSD_BONUS_EXIT
  SELECT SINGLE progname, formname FROM zsd_bonus_exit
    WHERE boart = @us_abs-boart
    INTO (@lv_prog, @lv_form).
  IF sy-subrc = 0.
    PERFORM (lv_form) IN PROGRAM (lv_prog) IF FOUND
      USING    us_abs-knuma
      CHANGING cv_ok.
    IF cv_ok = abap_false.
      WRITE: / us_abs-knuma, 'Zusatzpruefung', lv_form, 'negativ'.
    ENDIF.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  JOB_EINPLANEN
*&---------------------------------------------------------------------*
*       Sammelabrechnung RV15C001 fuer die gesammelten Absprachen
*----------------------------------------------------------------------*
FORM job_einplanen USING uv_boart TYPE kona-boart.
  DATA ls_lauf TYPE zsd_bonus_lauf.

  gv_jobname = |ZBONUS_{ uv_boart }_{ sy-datum }|.
  CALL FUNCTION 'JOB_OPEN'
    EXPORTING
      jobname  = gv_jobname
    IMPORTING
      jobcount = gv_jobcount
    EXCEPTIONS
      OTHERS   = 4.
  IF sy-subrc <> 0.
    MESSAGE e010 WITH gv_jobname.
  ENDIF.

  SUBMIT rv15c001 WITH knuma IN gr_knuma
                  WITH p_test = space
                  VIA JOB gv_jobname NUMBER gv_jobcount
                  AND RETURN.

  CALL FUNCTION 'JOB_CLOSE'
    EXPORTING
      jobcount  = gv_jobcount
      jobname   = gv_jobname
      strtimmed = 'X'
    EXCEPTIONS
      OTHERS    = 8.
  IF sy-subrc <> 0.
    WRITE: / 'Job', gv_jobname, 'nicht freigegeben'.
    RETURN.
  ENDIF.

  ls_lauf-jobname  = gv_jobname.
  ls_lauf-jobcount = gv_jobcount.
  ls_lauf-boart    = uv_boart.
  ls_lauf-datum    = sy-datum.
  ls_lauf-anzahl   = lines( gr_knuma ).
  ls_lauf-uname    = sy-uname.
  INSERT zsd_bonus_lauf FROM ls_lauf.
  gv_anz_job = gv_anz_job + 1.
  WRITE: / 'Job', gv_jobname, 'eingeplant fuer', ls_lauf-anzahl, 'Absprachen'.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  TESTLISTE
*&---------------------------------------------------------------------*
FORM testliste USING uv_boart TYPE kona-boart.
  WRITE: / 'Testlauf - Absprachenart', uv_boart, 'wuerde abgerechnet:'.
  LOOP AT gr_knuma INTO DATA(ls_knuma).
    WRITE: /5 ls_knuma-low.
  ENDLOOP.
ENDFORM.
