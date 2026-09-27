*----------------------------------------------------------------------*
***INCLUDE LZSD_EDI_ORDF01 - Unterprogramme Bestelleingang
*----------------------------------------------------------------------*

*---------------------------------------------------------------------*
*  FORM segmente_lesen - ORDERS05-Segmente in Kopf/Positionen
*---------------------------------------------------------------------*
FORM segmente_lesen TABLES pt_data STRUCTURE edidd.
  DATA: ls_k01 TYPE e1edk01,
        ls_k02 TYPE e1edk02,
        ls_ka1 TYPE e1edka1,
        ls_p01 TYPE e1edp01,
        ls_p19 TYPE e1edp19,
        ls_item TYPE ty_item,
        lv_idx  TYPE i.

  LOOP AT pt_data WHERE docnum = gs_edidc-docnum.
    CASE pt_data-segnam.
      WHEN 'E1EDK01'.
        ls_k01 = pt_data-sdata.
        gs_head-bsart = ls_k01-bsart.
        gs_head-curcy = ls_k01-curcy.
      WHEN 'E1EDK02'.
        ls_k02 = pt_data-sdata.
        IF ls_k02-qualf = '001'.          "Bestellnummer Kunde
          gs_head-bstkd = ls_k02-belnr.
          gs_head-bstdk = ls_k02-datum.
        ENDIF.
      WHEN 'E1EDKA1'.
        ls_ka1 = pt_data-sdata.
        IF ls_ka1-parvw = 'AG'.
          gs_head-partn = ls_ka1-partn.
        ENDIF.
      WHEN 'E1EDP01'.
        CLEAR ls_item.
        ls_p01 = pt_data-sdata.
        ls_item-posex = ls_p01-posex.
        ls_item-menge = ls_p01-menge.
        ls_item-menee = ls_p01-menee.
        APPEND ls_item TO gt_items.
        lv_idx = lines( gt_items ).
      WHEN 'E1EDP19'.
        ls_p19 = pt_data-sdata.
        READ TABLE gt_items INTO ls_item INDEX lv_idx.
        CASE ls_p19-qualf.
          WHEN '001'. ls_item-kdmat = ls_p19-idtnr.   "Kundenmaterial
          WHEN '002'. ls_item-lfmat = ls_p19-idtnr.   "unsere Materialnr.
        ENDCASE.
        MODIFY gt_items FROM ls_item INDEX lv_idx.
      WHEN OTHERS.
*       E1EDK03, E1EDK04, E1EDKT1 ... werden bewusst ignoriert
    ENDCASE.
  ENDLOOP.

  IF gt_items IS INITIAL OR gs_head-bstkd IS INITIAL.
    gv_error = abap_true.
    MESSAGE e110(zsd) WITH gs_edidc-docnum INTO gv_msg.
  ENDIF.
ENDFORM.

*---------------------------------------------------------------------*
*  FORM auftraggeber_ermitteln - Händler/GLN -> Debitor, Vertriebsber.
*---------------------------------------------------------------------*
FORM auftraggeber_ermitteln.
  DATA: ls_map   TYPE zsd_edi_kunde,
        lv_aufsd TYPE kna1-aufsd.

  SELECT SINGLE * FROM zsd_edi_kunde INTO ls_map
    WHERE sndprn = gs_edidc-sndprn
      AND partn  = gs_head-partn.
  IF sy-subrc <> 0.
    gv_error = abap_true.
    MESSAGE e111(zsd) WITH gs_edidc-sndprn gs_head-partn INTO gv_msg.
    RETURN.
  ENDIF.
  gs_head-kunnr = ls_map-kunnr.
  gs_head-vkorg = ls_map-vkorg.
  gs_head-vtweg = ls_map-vtweg.
  gs_head-spart = ls_map-spart.
  gs_head-auart = ls_map-auart.

  SELECT SINGLE aufsd FROM kna1 INTO lv_aufsd WHERE kunnr = gs_head-kunnr.
  IF lv_aufsd IS NOT INITIAL.
    gv_error = abap_true.
    MESSAGE e112(zsd) WITH gs_head-kunnr lv_aufsd INTO gv_msg.
  ENDIF.
ENDFORM.

*---------------------------------------------------------------------*
*  FORM material_umschluesseln - Kundenmaterial -> Materialnummer
*---------------------------------------------------------------------*
FORM material_umschluesseln.
  FIELD-SYMBOLS <ls_item> TYPE ty_item.

  LOOP AT gt_items ASSIGNING <ls_item>.
    IF <ls_item>-kdmat IS NOT INITIAL.
      SELECT SINGLE matnr FROM knmt INTO <ls_item>-matnr
        WHERE vkorg = gs_head-vkorg
          AND vtweg = gs_head-vtweg
          AND kunnr = gs_head-kunnr
          AND kdmat = <ls_item>-kdmat.
      IF sy-subrc <> 0.
        gv_error = abap_true.
        MESSAGE e113(zsd) WITH <ls_item>-kdmat <ls_item>-posex INTO gv_msg.
        EXIT.
      ENDIF.
    ELSE.
      CALL FUNCTION 'CONVERSION_EXIT_MATN1_INPUT'
        EXPORTING
          input        = <ls_item>-lfmat
        IMPORTING
          output       = <ls_item>-matnr
        EXCEPTIONS
          length_error = 1
          OTHERS       = 2.
    ENDIF.
  ENDLOOP.
ENDFORM.

*---------------------------------------------------------------------*
*  FORM auftrag_anlegen - Dublettenprüfung und Anlage per BAPI
*---------------------------------------------------------------------*
FORM auftrag_anlegen.
  DATA: ls_hdr    TYPE bapisdhd1,
        lt_itm    TYPE STANDARD TABLE OF bapisditm,
        lt_sch    TYPE STANDARD TABLE OF bapischdl,
        lt_par    TYPE STANDARD TABLE OF bapiparnr,
        lt_ret    TYPE STANDARD TABLE OF bapiret2,
        ls_ret    TYPE bapiret2,
        lv_posnr  TYPE posnr_va,
        lv_vorhan TYPE vbeln_va.

* Dublette: gleiche Kundenbestellnummer beim selben Auftraggeber
  SELECT SINGLE k~vbeln FROM vbak AS k
    INNER JOIN vbkd AS d ON d~vbeln = k~vbeln AND d~posnr = '000000'
    INTO lv_vorhan
    WHERE k~kunnr = gs_head-kunnr
      AND d~bstkd = gs_head-bstkd.
  IF sy-subrc = 0.
    gv_error = abap_true.
    MESSAGE e114(zsd) WITH gs_head-bstkd lv_vorhan INTO gv_msg.
    RETURN.
  ENDIF.

  ls_hdr-doc_type   = gs_head-auart.
  ls_hdr-sales_org  = gs_head-vkorg.
  ls_hdr-distr_chan = gs_head-vtweg.
  ls_hdr-division   = gs_head-spart.
  ls_hdr-purch_no_c = gs_head-bstkd.
  ls_hdr-purch_date = gs_head-bstdk.
  ls_hdr-currency   = gs_head-curcy.
  APPEND VALUE #( partn_role = 'AG' partn_numb = gs_head-kunnr ) TO lt_par.

  LOOP AT gt_items INTO DATA(ls_item).
    lv_posnr = sy-tabix * 10.
    APPEND VALUE #( itm_number = lv_posnr material = ls_item-matnr
                    target_qty = ls_item-menge target_qu = ls_item-menee
                    cust_mat35 = ls_item-kdmat ) TO lt_itm.
    APPEND VALUE #( itm_number = lv_posnr req_qty = ls_item-menge ) TO lt_sch.
  ENDLOOP.

  CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
    EXPORTING
      order_header_in    = ls_hdr
    IMPORTING
      salesdocument      = gv_vbeln
    TABLES
      return             = lt_ret
      order_items_in     = lt_itm
      order_partners     = lt_par
      order_schedules_in = lt_sch.

  LOOP AT lt_ret INTO ls_ret WHERE type CA 'EA'.
    gv_error = abap_true.
    MESSAGE ID ls_ret-id TYPE 'E' NUMBER ls_ret-number
            WITH ls_ret-message_v1 ls_ret-message_v2
                 ls_ret-message_v3 ls_ret-message_v4 INTO gv_msg.
    EXIT.
  ENDLOOP.
ENDFORM.

*---------------------------------------------------------------------*
*  FORM status_setzen - IDoc-Status 53 / 51
*---------------------------------------------------------------------*
FORM status_setzen TABLES pt_status STRUCTURE bdidocstat
                          pt_retvar STRUCTURE bdwfretvar.
  CLEAR pt_status.
  pt_status-docnum = gs_edidc-docnum.
  pt_status-msgty  = sy-msgty.
  pt_status-msgid  = sy-msgid.
  pt_status-msgno  = sy-msgno.
  pt_status-msgv1  = sy-msgv1.
  pt_status-msgv2  = sy-msgv2.
  pt_status-msgv3  = sy-msgv3.
  pt_status-msgv4  = sy-msgv4.

  IF gv_error = abap_true.
    pt_status-status = '51'.
    gv_anyerr = abap_true.
    APPEND VALUE #( wf_param = 'Error_IDOCs' doc_number = gs_edidc-docnum )
           TO pt_retvar.
  ELSE.
    pt_status-status = '53'.
    pt_status-msgty  = 'S'.
    pt_status-msgid  = 'ZSD'.
    pt_status-msgno  = '115'.
    pt_status-msgv1  = gv_vbeln.
    APPEND VALUE #( wf_param = 'Processed_IDOCs' doc_number = gs_edidc-docnum )
           TO pt_retvar.
    APPEND VALUE #( wf_param = 'Appl_Objects' doc_number = gv_vbeln )
           TO pt_retvar.
  ENDIF.
  APPEND pt_status.
ENDFORM.
