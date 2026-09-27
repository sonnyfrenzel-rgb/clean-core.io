*&---------------------------------------------------------------------*
*& Include ZPT_OT_APPROVAL_F01  - Lesen
*&---------------------------------------------------------------------*

FORM select_employees.
  CONCATENATE p_pabrj p_pabrp '01' INTO gv_begda.
  CALL FUNCTION 'RP_LAST_DAY_OF_MONTHS'
    EXPORTING
      day_in            = gv_begda
    IMPORTING
      last_day_of_month = gv_endda
    EXCEPTIONS
      OTHERS            = 1.

  SELECT pernr persk orgeh FROM pa0001 INTO TABLE gt_emp
    WHERE pernr IN s_pernr
      AND orgeh IN s_orgeh
      AND begda <= gv_endda
      AND endda >= gv_endda.
  SORT gt_emp BY pernr.
  DELETE ADJACENT DUPLICATES FROM gt_emp COMPARING pernr.

* Kappungsgrenzen je Mitarbeiterkreis
  SELECT * FROM zpt_ot_limit INTO TABLE gt_limit
    WHERE begda <= gv_endda
      AND endda >= gv_endda.
ENDFORM.

*----------------------------------------------------------------------*
FORM read_time_results.
  DATA: lt_zes   TYPE STANDARD TABLE OF pc2b6,
        ls_zes   TYPE pc2b6,
        ls_emp   TYPE ty_emp,
        ls_limit TYPE zpt_ot_limit,
        ls_out   TYPE ty_out,
        lv_hours TYPE ptm_quonum.

  LOOP AT gt_emp INTO ls_emp.
    CLEAR: lt_zes, lv_hours.

*   Zeitauswertungsergebnis der Periode aus Cluster B2
    CALL FUNCTION 'HR_TIME_RESULTS_GET'
      EXPORTING
        get_pernr             = ls_emp-pernr
        get_pabrj             = p_pabrj
        get_pabrp             = p_pabrp
      TABLES
        get_zes               = lt_zes
      EXCEPTIONS
        no_period_specified   = 1
        wrong_cluster_version = 2
        no_read_authority     = 3
        cluster_archived      = 4
        technical_error       = 5
        OTHERS                = 6.
    IF sy-subrc <> 0.
      gv_errors = gv_errors + 1.
      CONTINUE.
    ENDIF.

    LOOP AT lt_zes INTO ls_zes WHERE ztart = gc_ztart_ot.
      lv_hours = lv_hours + ls_zes-anzhl.
    ENDLOOP.
    CHECK lv_hours > 0.

    READ TABLE gt_limit INTO ls_limit WITH KEY persk = ls_emp-persk.
    IF sy-subrc <> 0.
*     ohne Grenze: alles freigabepflichtig
      CLEAR ls_limit.
    ENDIF.
    IF lv_hours <= ls_limit-maxhours.
      CONTINUE.
    ENDIF.

    CLEAR ls_out.
    ls_out-pernr  = ls_emp-pernr.
    ls_out-orgeh  = ls_emp-orgeh.
    ls_out-hours  = lv_hours.
    ls_out-limit  = ls_limit-maxhours.
    ls_out-excess = lv_hours - ls_limit-maxhours.

*   bereits entschieden?
    SELECT SINGLE status FROM zpt_ot_decision INTO ls_out-status
      WHERE pernr = ls_emp-pernr
        AND pabrj = p_pabrj
        AND pabrp = p_pabrp.
    IF sy-subrc <> 0.
      ls_out-status = gc_open.
    ENDIF.
    APPEND ls_out TO gt_out.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM display_alv.
  DATA: lt_fcat   TYPE slis_t_fieldcat_alv,
        ls_layout TYPE slis_layout_alv.

  ls_layout-box_fieldname     = 'SEL'.
  ls_layout-colwidth_optimize = abap_true.
  CALL FUNCTION 'REUSE_ALV_FIELDCATALOG_MERGE'
    EXPORTING
      i_program_name     = sy-repid
      i_internal_tabname = 'GT_OUT'
      i_inclname         = 'ZPT_OT_APPROVAL_TOP'
    CHANGING
      ct_fieldcat        = lt_fcat
    EXCEPTIONS
      OTHERS             = 1.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program       = sy-repid
      i_callback_pf_status_set = 'SET_STATUS'
      i_callback_user_command  = 'USER_COMMAND'
      is_layout                = ls_layout
      it_fieldcat              = lt_fcat
      i_grid_title             = |{ gv_errors } Ergebnisse nicht lesbar|
    TABLES
      t_outtab                 = gt_out
    EXCEPTIONS
      OTHERS                   = 1.
ENDFORM.

*----------------------------------------------------------------------*
FORM set_status USING rt_extab TYPE slis_t_extab.
  SET PF-STATUS 'ZOT_APPROVAL' EXCLUDING rt_extab.
ENDFORM.
