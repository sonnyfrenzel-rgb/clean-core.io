*&---------------------------------------------------------------------*
*&  Include           ZHR_ABRECHNUNG_VERGLEICH_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  PERSONAL_LESEN
*&---------------------------------------------------------------------*
FORM personal_lesen.
  SELECT DISTINCT pernr FROM pa0001 INTO TABLE gt_pernr
    WHERE pernr IN s_pernr
      AND abkrs IN s_abkrs
      AND endda >= sy-datum.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  MITARBEITER_VERGLEICHEN
*&---------------------------------------------------------------------*
FORM mitarbeiter_vergleichen USING pv_pernr TYPE persno.
  DATA: lt_rgdir   TYPE STANDARD TABLE OF pc261,
        lv_molga   TYPE molga,
        lv_seq_akt TYPE cdseq,
        lv_seq_vor TYPE cdseq,
        ls_res_akt TYPE pay99_result,
        ls_res_vor TYPE pay99_result,
        lv_rc      TYPE sysubrc.

  CALL FUNCTION 'CU_READ_RGDIR'
    EXPORTING
      persnr          = pv_pernr
    IMPORTING
      molga           = lv_molga
    TABLES
      in_rgdir        = lt_rgdir
    EXCEPTIONS
      no_record_found = 1
      OTHERS          = 2.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  PERFORM seqnr_suchen USING lt_rgdir p_abrp CHANGING lv_seq_akt.
  PERFORM seqnr_suchen USING lt_rgdir p_vorp CHANGING lv_seq_vor.
  CHECK lv_seq_akt IS NOT INITIAL AND lv_seq_vor IS NOT INITIAL.

  PERFORM ergebnis_lesen USING pv_pernr lv_seq_akt CHANGING ls_res_akt lv_rc.
  CHECK lv_rc = 0.
  PERFORM ergebnis_lesen USING pv_pernr lv_seq_vor CHANGING ls_res_vor lv_rc.
  CHECK lv_rc = 0.

  go_vergleich->vergleichen( iv_pernr  = pv_pernr
                             it_rt_akt = ls_res_akt-inter-rt
                             it_rt_vor = ls_res_vor-inter-rt ).
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  SEQNR_SUCHEN
*&---------------------------------------------------------------------*
*       aktuelles Ergebnis (SRTZA = A) der Fuer-Periode
*----------------------------------------------------------------------*
FORM seqnr_suchen USING    pt_rgdir TYPE hrpy_tt_rgdir
                           pv_per   TYPE faper
                  CHANGING cv_seqnr TYPE cdseq.
  DATA ls_rgdir TYPE pc261.

  CLEAR cv_seqnr.
  LOOP AT pt_rgdir INTO ls_rgdir WHERE fpper = pv_per
                                   AND srtza = 'A'.
    cv_seqnr = ls_rgdir-seqnr.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  ERGEBNIS_LESEN
*&---------------------------------------------------------------------*
FORM ergebnis_lesen USING    pv_pernr  TYPE persno
                             pv_seqnr  TYPE cdseq
                    CHANGING cs_result TYPE pay99_result
                             cv_rc     TYPE sysubrc.
  CALL FUNCTION 'PYXX_READ_PAYROLL_RESULT'
    EXPORTING
      clusterid                    = 'DE'
      employeenumber               = pv_pernr
      sequencenumber               = pv_seqnr
      read_only_international      = 'X'
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
  cv_rc = sy-subrc.
ENDFORM.
