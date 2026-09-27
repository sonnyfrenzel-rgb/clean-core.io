*&---------------------------------------------------------------------*
*& Report ZSD_DELIVERY_RUN
*&---------------------------------------------------------------------*
*& Sammelgang Lieferungserstellung (Ersatz VL10 fuer Werk 1000)
*& Job ZSD_DELIV_0600 / 1400, Protokoll im Application Log ZSD/DELIVERY
*&---------------------------------------------------------------------*
*& 2015-09 CHA  Ersterstellung
*& 2018-02 CHA  Testmodus
*& 2021-11 LMU  Umstellung auf Builder-/Logklasse
*&---------------------------------------------------------------------*
REPORT zsd_delivery_run.

TABLES vbak.

SELECT-OPTIONS: s_vbeln FOR vbak-vbeln,
                s_vkorg FOR vbak-vkorg OBLIGATORY.
PARAMETERS:     p_ledat TYPE ledat DEFAULT sy-datum,
                p_test  AS CHECKBOX DEFAULT 'X'.

DATA: go_log     TYPE REF TO zcl_sd_app_log,
      go_builder TYPE REF TO zcl_sd_delivery_builder,
      gx_del     TYPE REF TO zcx_sd_delivery,
      gt_orders  TYPE zcl_sd_delivery_builder=>tt_vbeln,
      gv_vbeln   TYPE vbeln_va,
      gv_ok      TYPE i,
      gv_err     TYPE i.

START-OF-SELECTION.
  go_log = NEW zcl_sd_app_log( iv_object    = 'ZSD'
                               iv_subobject = 'DELIVERY' ).
  go_builder = NEW zcl_sd_delivery_builder( ).

  gt_orders = go_builder->select_due( it_vbeln = s_vbeln[]
                                      it_vkorg = s_vkorg[]
                                      iv_ledat = p_ledat ).
  IF gt_orders IS INITIAL.
    MESSAGE s398(00) WITH 'Keine lieferfaelligen Auftraege'.
    RETURN.
  ENDIF.

  LOOP AT gt_orders INTO gv_vbeln.
    TRY.
        go_builder->create_for_order( iv_vbeln = gv_vbeln
                                      io_log   = go_log
                                      iv_test  = p_test ).
        gv_ok = gv_ok + 1.
      CATCH zcx_sd_delivery INTO gx_del.
        gv_err = gv_err + 1.
        go_log->add_exception( gx_del ).
    ENDTRY.
  ENDLOOP.

  go_log->save( ).
  IF sy-batch IS INITIAL.
    go_log->show( ).
  ENDIF.
