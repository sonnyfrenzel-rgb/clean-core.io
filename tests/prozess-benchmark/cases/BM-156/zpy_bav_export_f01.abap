*&---------------------------------------------------------------------*
*& Include ZPY_BAV_EXPORT_F01  - Lesen und Ermitteln
*&---------------------------------------------------------------------*

FORM check_double_run.
  CLEAR gv_last.
  IMPORT last_period = gv_last
    FROM DATABASE indx(zb) ID 'ZBAV_LAST_PERIOD'.
  IF gv_last = gv_inper AND p_test IS INITIAL AND p_rerun IS INITIAL.
*   Periode wurde bereits gemeldet - Wiederholung nur mit P_RERUN
    MESSAGE e002 WITH gv_inper.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
* Abrechnungsverwaltungssatz: Meldung erst nach "Ende der Abrechnung"
* (VWSAZ '3') und nur fuer eine bereits verlassene Periode
FORM check_control_record.
  DATA: lv_vwsaz TYPE vwsaz,
        lv_pabrj TYPE pabrj,
        lv_pabrp TYPE pabrp.

  SELECT SINGLE vwsaz pabrj pabrp FROM t569v
    INTO (lv_vwsaz, lv_pabrj, lv_pabrp)
    WHERE abkrs = p_abkrs.
  IF sy-subrc <> 0.
    MESSAGE e005 WITH p_abkrs.
  ENDIF.
  IF lv_vwsaz <> '3'
     OR lv_pabrj < p_pabrj
     OR ( lv_pabrj = p_pabrj AND lv_pabrp < p_pabrp ).
    MESSAGE e006 WITH p_abkrs gv_inper.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM load_customizing.
  SELECT traeger lgart art FROM zpy_bav_lgart INTO TABLE gt_lgart
    WHERE traeger = p_trag.
  IF gt_lgart IS INITIAL.
    MESSAGE e003 WITH p_trag.
  ENDIF.
  CONCATENATE 'ZPY_BAV_FORMAT_' p_trag INTO gv_prog.
ENDFORM.

*----------------------------------------------------------------------*
FORM process_employee USING pv_pernr TYPE pernr_d.
  DATA: lt_p9010   TYPE STANDARD TABLE OF p9010,
        ls_p9010   TYPE p9010,
        ls_rgdir   TYPE pc261,
        ls_prev    TYPE pc261,
        ls_result  TYPE pay99_result,
        ls_resprev TYPE pay99_result,
        ls_rec     TYPE ty_record,
        ls_old     TYPE ty_record,
        lv_ok      TYPE abap_bool,
        lv_molga   TYPE molga.

* bAV-Vertrag (Kundeninfotyp 9010) zum Periodenende
  CALL FUNCTION 'HR_READ_INFOTYPE'
    EXPORTING
      pernr           = pv_pernr
      infty           = '9010'
      begda           = pn-endda
      endda           = pn-endda
    TABLES
      infty_tab       = lt_p9010
    EXCEPTIONS
      infty_not_found = 1
      OTHERS          = 2.
  READ TABLE lt_p9010 INTO ls_p9010 WITH KEY traeger = p_trag.
  IF sy-subrc <> 0.
*   kein Vertrag bei diesem Traeger
    RETURN.
  ENDIF.

  CLEAR gt_rgdir.
  CALL FUNCTION 'CU_READ_RGDIR'
    EXPORTING
      persnr          = pv_pernr
    IMPORTING
      molga           = lv_molga
    TABLES
      in_rgdir        = gt_rgdir
    EXCEPTIONS
      no_record_found = 1
      OTHERS          = 2.
  IF sy-subrc <> 0.
    PERFORM log_add USING 'W' pv_pernr 'Kein Abrechnungsergebnis'.
    RETURN.
  ENDIF.

  LOOP AT gt_rgdir INTO ls_rgdir WHERE inper = gv_inper
                                   AND srtza = 'A'.
    PERFORM read_result USING pv_pernr ls_rgdir-seqnr
                        CHANGING ls_result lv_ok.
    IF lv_ok = abap_false.
      PERFORM log_add USING 'E' pv_pernr 'Ergebnis nicht lesbar'.
      CONTINUE.
    ENDIF.

    CLEAR ls_rec.
    ls_rec-pernr   = pv_pernr.
    ls_rec-vertrag = ls_p9010-vertragsnr.
    ls_rec-fpper   = ls_rgdir-fpper.
    PERFORM collect_amounts USING ls_result CHANGING ls_rec.

    IF ls_rgdir-fpper = ls_rgdir-inper.
*     laufende Periode
      ls_rec-satzart = 'L'.
    ELSE.
*     Rueckrechnung: Differenz zum Vorgaengerergebnis melden
      ls_rec-satzart = 'R'.
      READ TABLE gt_rgdir INTO ls_prev WITH KEY fpper = ls_rgdir-fpper
                                                srtza = 'P'.
      IF sy-subrc = 0.
        PERFORM read_result USING pv_pernr ls_prev-seqnr
                            CHANGING ls_resprev lv_ok.
        IF lv_ok = abap_true.
          CLEAR ls_old.
          PERFORM collect_amounts USING ls_resprev CHANGING ls_old.
          ls_rec-ag = ls_rec-ag - ls_old-ag.
          ls_rec-an = ls_rec-an - ls_old-an.
        ENDIF.
      ENDIF.
      IF ls_rec-ag = 0 AND ls_rec-an = 0.
        CONTINUE.
      ENDIF.
    ENDIF.

    PERFORM write_record USING ls_rec.
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
      clusterid      = 'RD'
      employeenumber = pv_pernr
      sequencenumber = pv_seqnr
    CHANGING
      payroll_result = cs_result
    EXCEPTIONS
      OTHERS         = 1.
  cv_ok = xsdbool( sy-subrc = 0 ).
ENDFORM.

*----------------------------------------------------------------------*
FORM collect_amounts USING is_result TYPE pay99_result
                     CHANGING cs_rec TYPE ty_record.
  DATA: ls_rt  TYPE pc207,
        ls_crt TYPE pc208,
        ls_lg  TYPE ty_lgart.

  LOOP AT is_result-inter-rt INTO ls_rt.
    READ TABLE gt_lgart INTO ls_lg WITH TABLE KEY lgart = ls_rt-lgart.
    CHECK sy-subrc = 0.
    CASE ls_lg-art.
      WHEN 'AG'.
        cs_rec-ag = cs_rec-ag + ls_rt-betrg.
      WHEN 'AN'.
        cs_rec-an = cs_rec-an + ls_rt-betrg.
    ENDCASE.
  ENDLOOP.

* Jahreswert (Kumulation Kalenderjahr) fuer AG-Beitraege
  LOOP AT is_result-inter-crt INTO ls_crt WHERE cumty = 'Y'.
    READ TABLE gt_lgart TRANSPORTING NO FIELDS
         WITH TABLE KEY lgart = ls_crt-lgart.
    IF sy-subrc = 0.
      cs_rec-ytd = cs_rec-ytd + ls_crt-betrg.
    ENDIF.
  ENDLOOP.
ENDFORM.
