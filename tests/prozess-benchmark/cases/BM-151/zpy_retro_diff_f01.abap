*&---------------------------------------------------------------------*
*& Include ZPY_RETRO_DIFF_F01  - Unterprogramme
*&---------------------------------------------------------------------*

FORM init_lgart_defaults.
* Vorschlag: Grundentgelt, Tarifzulage, Gesamtbrutto, Auszahlung
  IF s_lgart[] IS INITIAL.
    s_lgart-sign = 'I'. s_lgart-option = 'EQ'.
    s_lgart-low = '1000'. APPEND s_lgart.
    s_lgart-low = '1200'. APPEND s_lgart.
    s_lgart-low = '/101'. APPEND s_lgart.
    s_lgart-low = '/559'. APPEND s_lgart.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM read_rgdir USING pv_pernr TYPE pernr_d
                CHANGING cv_ok TYPE abap_bool.
  cv_ok = abap_false.
  CLEAR gt_rgdir.
  CALL FUNCTION 'CU_READ_RGDIR'
    EXPORTING
      persnr          = pv_pernr
    IMPORTING
      molga           = gv_molga
    TABLES
      in_rgdir        = gt_rgdir
    EXCEPTIONS
      no_record_found = 1
      OTHERS          = 2.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.
* nur deutsche Abrechnung
  IF gv_molga <> '01'.
    RETURN.
  ENDIF.
  cv_ok = abap_true.
ENDFORM.

*----------------------------------------------------------------------*
FORM compare_results USING pv_pernr TYPE pernr_d.
  DATA: ls_new     TYPE pc261,
        ls_old     TYPE pc261,
        ls_res_new TYPE pay99_result,
        ls_res_old TYPE pay99_result,
        ls_rt      TYPE pc207,
        ls_rt_old  TYPE pc207,
        lv_old     TYPE maxbt,
        lv_ok      TYPE abap_bool.

  LOOP AT gt_rgdir INTO ls_new WHERE srtza = 'A'
                                 AND inper = gv_inper.
*   nur Rueckrechnungen: Fuer-Periode vor der In-Periode
    CHECK ls_new-fpper <> ls_new-inper.
    READ TABLE gt_rgdir INTO ls_old WITH KEY fpper = ls_new-fpper
                                             srtza = 'P'.
    IF sy-subrc <> 0.
*     Periode erstmals abgerechnet - kein Vergleich moeglich
      CONTINUE.
    ENDIF.

    PERFORM read_result USING pv_pernr ls_new-seqnr
                        CHANGING ls_res_new lv_ok.
    CHECK lv_ok = abap_true.
    PERFORM read_result USING pv_pernr ls_old-seqnr
                        CHANGING ls_res_old lv_ok.
    CHECK lv_ok = abap_true.

    LOOP AT ls_res_new-inter-rt INTO ls_rt WHERE lgart IN s_lgart.
      READ TABLE ls_res_old-inter-rt INTO ls_rt_old
           WITH KEY lgart = ls_rt-lgart.
      lv_old = COND #( WHEN sy-subrc = 0 THEN ls_rt_old-betrg ELSE 0 ).
      IF abs( ls_rt-betrg - lv_old ) < p_min.
        CONTINUE.
      ENDIF.
      APPEND VALUE ty_diff( pernr = pv_pernr
                            fpper = ls_new-fpper
                            lgart = ls_rt-lgart
                            old   = lv_old
                            new   = ls_rt-betrg
                            diff  = ls_rt-betrg - lv_old ) TO gt_diff.
    ENDLOOP.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM read_result USING pv_pernr TYPE pernr_d
                       pv_seqnr TYPE cdseq
                 CHANGING cs_result TYPE pay99_result
                          cv_ok     TYPE abap_bool.
  CLEAR cs_result.
  CALL FUNCTION 'PYXX_READ_PAYROLL_RESULT'
    EXPORTING
      clusterid                    = 'RD'
      employeenumber               = pv_pernr
      sequencenumber               = pv_seqnr
    CHANGING
      payroll_result               = cs_result
    EXCEPTIONS
      illegal_isocode_or_clusterid = 1
      error_generating_import      = 2
      import_mismatch_error        = 3
      subpool_dir_full             = 4
      no_read_authority            = 5
      no_record_found              = 6
      versions_do_not_match        = 7
      OTHERS                       = 8.
  IF sy-subrc <> 0.
    gv_errors = gv_errors + 1.
    cv_ok = abap_false.
  ELSE.
    cv_ok = abap_true.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM summarize.
  DATA: ls_diff TYPE ty_diff,
        ls_sum  TYPE ty_sum.

  SORT gt_diff BY pernr fpper lgart.
  LOOP AT gt_diff INTO ls_diff.
    AT NEW pernr.
      CLEAR ls_sum.
      ls_sum-pernr = ls_diff-pernr.
    ENDAT.
    ls_sum-diff  = ls_sum-diff + ls_diff-diff.
    ls_sum-count = ls_sum-count + 1.
    AT END OF pernr.
      APPEND ls_sum TO gt_sum.
    ENDAT.
    AT LAST.
      SUM.
      gv_total = ls_diff-diff.
    ENDAT.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM display_alv.
  DATA: lt_fcat TYPE slis_t_fieldcat_alv.

  gv_title = |Rückrechnung { gv_inper }: Summe { gv_total }, | &&
             |{ gv_errors } Ergebnisse nicht lesbar|.
  CALL FUNCTION 'REUSE_ALV_FIELDCATALOG_MERGE'
    EXPORTING
      i_program_name     = sy-repid
      i_internal_tabname = 'GT_SUM'
      i_inclname         = 'ZPY_RETRO_DIFF_TOP'
    CHANGING
      ct_fieldcat        = lt_fcat
    EXCEPTIONS
      OTHERS             = 1.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program = sy-repid
      i_grid_title       = gv_title
      it_fieldcat        = lt_fcat
    TABLES
      t_outtab           = gt_sum
    EXCEPTIONS
      program_error      = 1
      OTHERS             = 2.
ENDFORM.

*----------------------------------------------------------------------*
* alte Listausgabe (bis 2018) - nicht mehr aufgerufen
FORM write_list.
  DATA ls_diff TYPE ty_diff.
  LOOP AT gt_diff INTO ls_diff.
    WRITE: / ls_diff-pernr, ls_diff-fpper, ls_diff-lgart,
             ls_diff-old, ls_diff-new, ls_diff-diff.
  ENDLOOP.
ENDFORM.
