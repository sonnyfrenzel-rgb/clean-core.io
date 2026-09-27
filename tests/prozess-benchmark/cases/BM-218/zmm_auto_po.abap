*&---------------------------------------------------------------------*
*& Report ZMM_AUTO_PO
*&---------------------------------------------------------------------*
*& Automatische Bestellerzeugung aus freigegebenen Bestellanforderungen
*& Bezugsquellenfindung: Kontrakt -> Quotierung -> Orderbuch/Infosatz
*& Job ZMM_AUTO_PO_0500 (Werk 1000, 2000), sonst ME59N-Ersatz im Dialog
*&---------------------------------------------------------------------*
*& 2013-06 UKR  Ersterstellung (FORM-basiert)
*& 2017-11 UKR  Quotierung
*& 2020-02 JHO  Umbau auf Strategieklassen, Protokolltabelle
*&---------------------------------------------------------------------*
REPORT zmm_auto_po LINE-SIZE 160.

INCLUDE zmm_auto_po_top.
INCLUDE zmm_auto_po_c01.
INCLUDE zmm_auto_po_f01.

START-OF-SELECTION.
  gv_runid = |{ sy-datum }{ sy-uzeit }|.
  PERFORM select_requisitions.
  IF gt_eban IS INITIAL.
    WRITE / 'Keine offenen, freigegebenen Bestellanforderungen'(001).
    STOP.
  ENDIF.

  go_det     = NEW lcl_source_determination( ).
  go_builder = NEW lcl_po_builder( ).
  SET HANDLER lcl_protocol=>on_po_created FOR go_builder.

  LOOP AT gt_eban ASSIGNING <gs_eban>.
    TRY.
        DATA(ls_src) = go_det->determine( <gs_eban> ).
        go_builder->add_item( is_eban = <gs_eban>
                              is_src  = ls_src ).
      CATCH lcx_no_source INTO gx_src.
        PERFORM mark_error USING <gs_eban> gx_src->mv_text.
    ENDTRY.
  ENDLOOP.

  go_builder->create_all( p_test ).

END-OF-SELECTION.
  PERFORM write_protocol.
