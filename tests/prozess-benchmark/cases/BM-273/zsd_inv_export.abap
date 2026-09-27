REPORT zsd_inv_export MESSAGE-ID zsd.
*----------------------------------------------------------------------*
* Export gebuchter Faktura an E-Invoicing-Provider (CSV auf App-Server)
* Wiederaufsetzbar je Lauf-ID: letzte exportierte Faktura in ZSD_EXP_CHKPT
*----------------------------------------------------------------------*
INCLUDE zsd_inv_export_top.
INCLUDE zsd_inv_export_f01.

START-OF-SELECTION.
  PERFORM check_restart.
  PERFORM open_file.
  PERFORM select_invoices.

  LOOP AT gt_vbrk INTO gs_vbrk.
    PERFORM export_invoice USING gs_vbrk.
    IF gv_count MOD p_commit = 0.
      PERFORM set_checkpoint USING gs_vbrk-vbeln.
    ENDIF.
  ENDLOOP.

  CLOSE DATASET gv_file.
  PERFORM finish.
