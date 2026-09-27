REPORT zmm_po_idoc_out.
*----------------------------------------------------------------------*
* Bestellungen an Lieferantenportal (IDoc ZPORDERS, Segmente Z1PORDH/Z1PORDI)
* Delta seit letztem Lauf (ZMM_IF_LASTRUN), Einplanung stuendlich
*----------------------------------------------------------------------*
INCLUDE zmm_po_idoc_out_top.
INCLUDE zmm_po_idoc_out_f01.

START-OF-SELECTION.
  PERFORM get_last_run.
  PERFORM select_orders.
  IF gt_ekko IS INITIAL.
    MESSAGE s010(zmm).                "Keine geaenderten Bestellungen
    RETURN.
  ENDIF.

  LOOP AT gt_ekko INTO gs_ekko.
    PERFORM check_partner USING gs_ekko-lifnr CHANGING gv_partner_ok.
    IF gv_partner_ok = abap_false.
      gs_result-ebeln  = gs_ekko-ebeln.
      gs_result-lifnr  = gs_ekko-lifnr.
      gs_result-status = 'kein Partnerprofil'.
      APPEND gs_result TO gt_result.
      CONTINUE.
    ENDIF.
    PERFORM send_idoc USING gs_ekko.
  ENDLOOP.

  PERFORM set_last_run.
  PERFORM display_result.
