*&---------------------------------------------------------------------*
*& Include ZHR_EMP_EXPORT_F01 - Selektion und Lesen
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form GET_LAST_RUN - Datum des letzten erfolgreichen Laufs
*&---------------------------------------------------------------------*
FORM get_last_run CHANGING pv_date TYPE datum.
  SELECT MAX( run_date ) FROM zhr_export_log INTO pv_date
    WHERE progname = sy-repid
      AND status   = 'S'.
* noch nie erfolgreich gelaufen -> leer -> Vollabzug
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SELECT_EMPLOYEES
*&---------------------------------------------------------------------*
FORM select_employees.
  DATA: lt_tmp TYPE STANDARD TABLE OF persno,
        lt_chg TYPE STANDARD TABLE OF persno.

* heute zugeordnete Mitarbeiter der Buchungskreise/Mitarbeitergruppen
  SELECT pernr FROM pa0001 INTO TABLE lt_tmp
    WHERE bukrs IN s_bukrs
      AND persg IN s_persg
      AND begda <= sy-datum
      AND endda >= sy-datum.
  IF lt_tmp IS INITIAL.
    RETURN.
  ENDIF.
  SORT lt_tmp.
  DELETE ADJACENT DUPLICATES FROM lt_tmp.

  IF gv_last_run IS INITIAL.
    gt_pernr = lt_tmp.
    RETURN.
  ENDIF.

* Delta: Änderung in IT0000/0001/0002/0006 seit dem letzten Lauf
  SELECT pernr FROM pa0000 APPENDING TABLE lt_chg
    FOR ALL ENTRIES IN lt_tmp
    WHERE pernr = lt_tmp-table_line
      AND aedtm >= gv_last_run.
  SELECT pernr FROM pa0001 APPENDING TABLE lt_chg
    FOR ALL ENTRIES IN lt_tmp
    WHERE pernr = lt_tmp-table_line
      AND aedtm >= gv_last_run.
  SELECT pernr FROM pa0002 APPENDING TABLE lt_chg
    FOR ALL ENTRIES IN lt_tmp
    WHERE pernr = lt_tmp-table_line
      AND aedtm >= gv_last_run.
  SELECT pernr FROM pa0006 APPENDING TABLE lt_chg
    FOR ALL ENTRIES IN lt_tmp
    WHERE pernr = lt_tmp-table_line
      AND subty = '1'
      AND aedtm >= gv_last_run.
  SORT lt_chg.
  DELETE ADJACENT DUPLICATES FROM lt_chg.
  gt_pernr = lt_chg.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form READ_EMPLOYEE - Infotypen lesen, Export- und Zeitsatz bilden
*&---------------------------------------------------------------------*
FORM read_employee USING pv_pernr TYPE persno.
  DATA: lt_p0000 TYPE STANDARD TABLE OF p0000,
        ls_p0000 TYPE p0000,
        lt_p0001 TYPE STANDARD TABLE OF p0001,
        ls_p0001 TYPE p0001,
        lt_p0002 TYPE STANDARD TABLE OF p0002,
        ls_p0002 TYPE p0002,
        lt_p0006 TYPE STANDARD TABLE OF p0006,
        ls_p0006 TYPE p0006,
        lt_p0105 TYPE STANDARD TABLE OF p0105,
        ls_p0105 TYPE p0105,
        ls_rec   TYPE ty_rec,
        ls_time  TYPE zhr_s_time_emp,
        ls_err   TYPE ty_error.

  CALL FUNCTION 'HR_CHECK_AUTHORITY_INFTY'
    EXPORTING
      tclas            = 'A'
      pernr            = pv_pernr
      infty            = '0002'
      subty            = space
      begda            = sy-datum
      endda            = sy-datum
      level            = 'R'
    EXCEPTIONS
      no_authorization = 1
      internal_error   = 2
      OTHERS           = 3.
  IF sy-subrc <> 0.
    ls_err-pernr = pv_pernr.
    ls_err-text  = 'Keine Berechtigung Infotyp 0002'.
    APPEND ls_err TO gt_error.
    RETURN.
  ENDIF.

  CALL FUNCTION 'HR_READ_INFOTYPE'
    EXPORTING
      pernr     = pv_pernr
      infty     = '0000'
      begda     = sy-datum
      endda     = sy-datum
    TABLES
      infty_tab = lt_p0000
    EXCEPTIONS
      OTHERS    = 1.
  CALL FUNCTION 'HR_READ_INFOTYPE'
    EXPORTING
      pernr     = pv_pernr
      infty     = '0001'
      begda     = sy-datum
      endda     = sy-datum
    TABLES
      infty_tab = lt_p0001
    EXCEPTIONS
      OTHERS    = 1.
  CALL FUNCTION 'HR_READ_INFOTYPE'
    EXPORTING
      pernr     = pv_pernr
      infty     = '0002'
      begda     = sy-datum
      endda     = sy-datum
    TABLES
      infty_tab = lt_p0002
    EXCEPTIONS
      OTHERS    = 1.
  CALL FUNCTION 'HR_READ_INFOTYPE'
    EXPORTING
      pernr     = pv_pernr
      infty     = '0006'
      begda     = sy-datum
      endda     = sy-datum
    TABLES
      infty_tab = lt_p0006
    EXCEPTIONS
      OTHERS    = 1.
  DELETE lt_p0006 WHERE subty <> '1'.
  CALL FUNCTION 'HR_READ_INFOTYPE'
    EXPORTING
      pernr     = pv_pernr
      infty     = '0105'
      begda     = sy-datum
      endda     = sy-datum
    TABLES
      infty_tab = lt_p0105
    EXCEPTIONS
      OTHERS    = 1.
  DELETE lt_p0105 WHERE subty <> '0010'.

  READ TABLE lt_p0000 INTO ls_p0000 INDEX 1.
  IF ls_p0000-stat2 = '0'.
    ls_rec-satzart = 'D'.
  ELSE.
    ls_rec-satzart = 'U'.
  ENDIF.

  READ TABLE lt_p0001 INTO ls_p0001 INDEX 1.
  READ TABLE lt_p0002 INTO ls_p0002 INDEX 1.
  ls_rec-pernr = pv_pernr.
  ls_rec-nachn = ls_p0002-nachn.
  ls_rec-vorna = ls_p0002-vorna.
  ls_rec-gbdat = ls_p0002-gbdat.
  ls_rec-bukrs = ls_p0001-bukrs.
  ls_rec-kostl = ls_p0001-kostl.
  ls_rec-orgeh = ls_p0001-orgeh.

  READ TABLE lt_p0006 INTO ls_p0006 INDEX 1.
  IF sy-subrc <> 0 AND ls_rec-satzart = 'U'.
    ls_err-pernr = pv_pernr.
    ls_err-text  = 'Keine ständige Anschrift (IT0006 Subtyp 1)'.
    APPEND ls_err TO gt_error.
    RETURN.
  ENDIF.
  ls_rec-stras = ls_p0006-stras.
  ls_rec-pstlz = ls_p0006-pstlz.
  ls_rec-ort01 = ls_p0006-ort01.

  READ TABLE lt_p0105 INTO ls_p0105 INDEX 1.
  ls_rec-email = ls_p0105-usrid_long.
  APPEND ls_rec TO gt_rec.

* Zeiterfassung: Ausgetretene werden deaktiviert, nicht gelöscht
  ls_time-pernr  = pv_pernr.
  ls_time-ename  = |{ ls_rec-vorna } { ls_rec-nachn }|.
  ls_time-kostl  = ls_rec-kostl.
  ls_time-active = xsdbool( ls_rec-satzart = 'U' ).
  APPEND ls_time TO gt_time.
ENDFORM.
