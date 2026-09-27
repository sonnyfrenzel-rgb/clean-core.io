*----------------------------------------------------------------------*
***INCLUDE LZFIAA_IDOCF01.
* Pruefungen und Statussaetze fuer den IDoc-Eingang ZFIAA_ACQ
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  CHECK_DATA
*&---------------------------------------------------------------------*
*  Buchungskreis, Anlagenklasse, Kostenstelle, Betrag
*  Fehler -> gv_error = X und Meldung in gs_err
*----------------------------------------------------------------------*
FORM check_data.
  DATA: lv_valid TYPE abap_bool,
        lv_bukrs TYPE bukrs.

* 1. Buchungskreis vorhanden?
  SELECT SINGLE bukrs FROM t001 INTO lv_bukrs
    WHERE bukrs = gs_hdr-bukrs.
  IF sy-subrc <> 0.
    gs_err-msgid = 'ZFIAA'.
    gs_err-msgno = '001'.
    gs_err-msgv1 = gs_hdr-bukrs.
    gv_error = abap_true.
    RETURN.
  ENDIF.

* 2. Anlagenklasse aus Mapping Investitionskategorie (ZFIAA_CLSMAP)
  gs_hdr-anlkl = go_mapper->get_asset_class(
                   iv_bukrs      = gs_hdr-bukrs
                   iv_ext_klasse = gs_hdr-ext_klasse ).
  SELECT SINGLE anlkl FROM anka INTO gs_hdr-anlkl
    WHERE anlkl = gs_hdr-anlkl.
  IF sy-subrc <> 0.
    gs_err-msgid = 'ZFIAA'.
    gs_err-msgno = '002'.
    gs_err-msgv1 = gs_hdr-ext_klasse.
    gs_err-msgv2 = gs_hdr-bukrs.
    gv_error = abap_true.
    RETURN.
  ENDIF.

* 3. Kostenstelle gueltig zum Aktivierungsdatum (nur wenn geliefert)
  IF gs_hdr-kostl IS NOT INITIAL.
    lv_valid = go_mapper->check_cost_center(
                 iv_bukrs = gs_hdr-bukrs
                 iv_kostl = gs_hdr-kostl
                 iv_datum = gs_hdr-aktiv ).
    IF lv_valid = abap_false.
      gs_err-msgid = 'ZFIAA'.
      gs_err-msgno = '003'.
      gs_err-msgv1 = gs_hdr-kostl.
      gs_err-msgv2 = gs_hdr-aktiv.
      gv_error = abap_true.
      RETURN.
    ENDIF.
  ENDIF.

* 4. Betrag muss positiv sein (Gutschriften laufen manuell)
  IF gs_val-anbtr <= 0.
    gs_err-msgid = 'ZFIAA'.
    gs_err-msgno = '004'.
    gs_err-msgv1 = gs_hdr-ext_ref.
    gv_error = abap_true.
  ENDIF.

*  Freigabegrenze 1 Mio - vom Fachbereich 2012 gewuenscht, nie aktiviert
*  IF gs_val-anbtr > 1000000.
*    gv_error = abap_true.
*  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  CHECK_DUPLICATE
*&---------------------------------------------------------------------*
*  externe Referenz des Senders schon verbucht?
*----------------------------------------------------------------------*
FORM check_duplicate CHANGING cv_dup TYPE abap_bool.
  DATA ls_ref TYPE zfiaa_extref.

  cv_dup = abap_false.
  SELECT SINGLE * FROM zfiaa_extref INTO ls_ref
    WHERE ext_sys = gs_hdr-ext_sys
      AND ext_ref = gs_hdr-ext_ref.
  CHECK sy-subrc = 0.

  cv_dup = abap_true.
* Referenz &1 bereits als Anlage &2-&3 gebucht
  gs_err-msgid = 'ZFIAA'.
  gs_err-msgno = '005'.
  gs_err-msgv1 = ls_ref-ext_ref.
  gs_err-msgv2 = ls_ref-anln1.
  gs_err-msgv3 = ls_ref-anln2.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  FILL_STATUS
*&---------------------------------------------------------------------*
*  Statussatz fuer IDOC_STATUS + Rueckgabe fuer den Workflow.
*  Die Statussaetze schreibt die ALE-Schicht (EDIDS), nicht wir.
*----------------------------------------------------------------------*
FORM fill_status TABLES ct_status STRUCTURE bdidocstat
                        ct_retvar STRUCTURE bdwfretvar
                 USING  iv_docnum TYPE edi_docnum
                        iv_status TYPE edi_status.
  CLEAR gs_status.
  gs_status-docnum = iv_docnum.
  gs_status-status = iv_status.
  gs_status-msgty  = COND #( WHEN iv_status = gc_stat_err THEN 'E'
                             ELSE 'S' ).
  gs_status-msgid  = gs_err-msgid.
  gs_status-msgno  = gs_err-msgno.
  gs_status-msgv1  = gs_err-msgv1.
  gs_status-msgv2  = gs_err-msgv2.
  gs_status-msgv3  = gs_err-msgv3.
  gs_status-repid  = sy-repid.
  APPEND gs_status TO ct_status.

  CLEAR ct_retvar.
  ct_retvar-doc_number = iv_docnum.
  IF iv_status = gc_stat_err.
    ct_retvar-wf_param = 'Error_IDOCs'.
    gv_any_error = abap_true.
  ELSE.
    ct_retvar-wf_param = 'Processed_IDOCs'.
  ENDIF.
  APPEND ct_retvar.
ENDFORM.
