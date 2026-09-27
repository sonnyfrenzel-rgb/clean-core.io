*&---------------------------------------------------------------------*
*&  Include  ZMM_PO_IDOC_OUT_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&  Form GET_LAST_RUN - Delta-Beginn
*&---------------------------------------------------------------------*
FORM get_last_run.
  SELECT SINGLE lastdate FROM zmm_if_lastrun INTO gv_from
    WHERE ifname = gc_mestyp.
  IF sy-subrc <> 0.
*   Erster Lauf: nur gestern und heute
    gv_from = sy-datum - 1.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form SELECT_ORDERS
*&---------------------------------------------------------------------*
FORM select_orders.
  SELECT * FROM ekko INTO TABLE gt_ekko
    WHERE bsart IN s_bsart
      AND lifnr IN s_lifnr
      AND ekorg IN s_ekorg
      AND aedat >= gv_from
      AND loekz = space.
  IF sy-subrc = 0.
    SELECT * FROM ekpo INTO TABLE gt_ekpo
      FOR ALL ENTRIES IN gt_ekko
      WHERE ebeln = gt_ekko-ebeln.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form CHECK_PARTNER - Partnervereinbarung Lieferant/ZPORDERS vorhanden?
*&---------------------------------------------------------------------*
FORM check_partner USING    pv_lifnr TYPE lifnr
                   CHANGING pv_ok    TYPE abap_bool.
  pv_ok = abap_false.
  SELECT SINGLE rcvprn FROM edp13 INTO @DATA(lv_rcvprn)
    WHERE rcvprt = 'LI'
      AND rcvprn = @pv_lifnr
      AND mestyp = @gc_mestyp.
  IF sy-subrc = 0.
    pv_ok = abap_true.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form SEND_IDOC
*&---------------------------------------------------------------------*
FORM send_idoc USING ps_ekko TYPE ekko.
  DATA: ls_control TYPE edidc,
        lt_data    TYPE STANDARD TABLE OF edidd,
        ls_data    TYPE edidd,
        lt_comm    TYPE STANDARD TABLE OF edidc,
        ls_comm    TYPE edidc,
        ls_head    TYPE z1pordh,
        ls_item    TYPE z1pordi,
        ls_ekpo    TYPE ekpo.

  CLEAR gs_result.
  gs_result-ebeln = ps_ekko-ebeln.
  gs_result-lifnr = ps_ekko-lifnr.

  ls_control-mestyp = gc_mestyp.
  ls_control-idoctp = gc_idoctp.
  ls_control-rcvprt = 'LI'.
  ls_control-rcvprn = ps_ekko-lifnr.

  ls_head-ebeln = ps_ekko-ebeln.
  ls_head-bedat = ps_ekko-bedat.
  ls_head-waers = ps_ekko-waers.
  ls_head-ekgrp = ps_ekko-ekgrp.
  ls_data-segnam = 'Z1PORDH'.
  ls_data-sdata  = ls_head.
  APPEND ls_data TO lt_data.

  LOOP AT gt_ekpo INTO ls_ekpo WHERE ebeln = ps_ekko-ebeln.
*   geloeschte Positionen gehen nicht ans Portal
    CHECK ls_ekpo-loekz = space.
    CLEAR ls_item.
    ls_item-ebelp = ls_ekpo-ebelp.
    ls_item-matnr = ls_ekpo-matnr.
    ls_item-menge = ls_ekpo-menge.
    ls_item-meins = ls_ekpo-meins.
    ls_item-netpr = ls_ekpo-netpr.
    ls_data-segnam = 'Z1PORDI'.
    ls_data-sdata  = ls_item.
    APPEND ls_data TO lt_data.
  ENDLOOP.

  IF p_test = abap_true.
    gs_result-status = 'Testlauf - nicht gesendet'.
    APPEND gs_result TO gt_result.
    RETURN.
  ENDIF.

  CALL FUNCTION 'MASTER_IDOC_DISTRIBUTE'
    EXPORTING
      master_idoc_control        = ls_control
    TABLES
      communication_idoc_control = lt_comm
      master_idoc_data           = lt_data
    EXCEPTIONS
      error_in_idoc_control      = 1
      error_writing_idoc_status  = 2
      error_in_idoc_data         = 3
      sending_logical_system_unknown = 4
      OTHERS                     = 5.
  IF sy-subrc <> 0.
    ROLLBACK WORK.
    gs_result-status = 'Fehler beim Erzeugen'.
  ELSE.
    COMMIT WORK.
    READ TABLE lt_comm INTO ls_comm INDEX 1.
    gs_result-docnum = ls_comm-docnum.
    gs_result-status = 'IDoc erzeugt'.
  ENDIF.
  APPEND gs_result TO gt_result.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form SET_LAST_RUN
*&---------------------------------------------------------------------*
FORM set_last_run.
  DATA ls_lastrun TYPE zmm_if_lastrun.

  CHECK p_test = abap_false.
  ls_lastrun-ifname   = gc_mestyp.
  ls_lastrun-lastdate = sy-datum.
  MODIFY zmm_if_lastrun FROM ls_lastrun.
  COMMIT WORK.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form DISPLAY_RESULT
*&---------------------------------------------------------------------*
FORM display_result.
  DATA lo_alv TYPE REF TO cl_salv_table.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv
                              CHANGING  t_table      = gt_result ).
      lo_alv->get_functions( )->set_all( abap_true ).
      lo_alv->display( ).
    CATCH cx_salv_msg.
      MESSAGE 'Ergebnisliste kann nicht angezeigt werden' TYPE 'I'.
  ENDTRY.
ENDFORM.
