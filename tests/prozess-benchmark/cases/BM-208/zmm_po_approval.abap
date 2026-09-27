*&---------------------------------------------------------------------*
*& Report ZMM_PO_APPROVAL
*&---------------------------------------------------------------------*
*& Automatische Bestellfreigabe (Job ZMM_PO_APPROVAL_NIGHT, taeglich)
*& Zustandsmodell: Budgetpruefung -> Freigabe | Ablehnung
*& 2016 RWE  Erstellung / 2020 PKL Umbau auf Zustandsklassen
*&---------------------------------------------------------------------*
REPORT zmm_po_approval.

INCLUDE zmm_po_approval_top.
INCLUDE zmm_po_approval_c01.
INCLUDE zmm_po_approval_f01.

START-OF-SELECTION.
  PERFORM select_orders.
  IF gt_ekko IS INITIAL.
    MESSAGE s398(00) WITH 'Keine Bestellungen zur Freigabe'.
    RETURN.
  ENDIF.

  go_log = NEW lcl_log( ).

  LOOP AT gt_ekko INTO gs_ekko.
    PERFORM process_order USING gs_ekko.
  ENDLOOP.

  WRITE: / 'Freigegeben:'(001), gv_cnt_rel,
         / 'Fehler     :'(002), gv_cnt_err.
