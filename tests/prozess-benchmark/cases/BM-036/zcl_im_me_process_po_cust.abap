*----------------------------------------------------------------------*
* Implementierung ZMM_PO_CHECKS zu BAdI ME_PROCESS_PO_CUST
* Pruefungen und Vorschlagswerte in ME21N/ME22N
*  - Lieferant gesperrt (EKORG) -> Fehler
*  - Zahlungsbedingung aus Einkaufsdaten vorschlagen
*  - Preis gegen Infosatz (Warnung > 10 %, Fehler > 25 %)
*  - Gefahrgut: Versandvorschrift Z1
*  - Kostenstelle gueltig und nicht fuer Primaerkosten gesperrt
*  - Kostenstellenbudget (ZMM_PO_BUDGET) beim Pruefen/Sichern
*  - Verbrauch fortschreiben, Workflow ab 50.000 EUR
* 2009-11 KL  Erstellung   2013-04 KL Budget   2016-10 MR Gefahrgut
*----------------------------------------------------------------------*
CLASS zcl_im_me_process_po_cust DEFINITION
  PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_ex_me_process_po_cust.
  PRIVATE SECTION.
    DATA mo_rules TYPE REF TO zcl_mm_po_rules.
ENDCLASS.

CLASS zcl_im_me_process_po_cust IMPLEMENTATION.

  METHOD if_ex_me_process_po_cust~initialize.
  ENDMETHOD.

  METHOD if_ex_me_process_po_cust~open.
    IF mo_rules IS NOT BOUND.
      mo_rules = NEW zcl_mm_po_rules( ).
    ENDIF.
  ENDMETHOD.

  METHOD if_ex_me_process_po_cust~process_header.
    INCLUDE zmm_po_badi_macros.
    DATA: ls_header TYPE mepoheader,
          lv_zterm  TYPE dzterm.

    ls_header = im_header->get_data( ).
    IF ls_header-bsart <> gc_bsart_normal AND ls_header-bsart <> gc_bsart_zusatz.
      RETURN.
    ENDIF.

    DATA(lv_blocked) = mo_rules->vendor_blocked( iv_lifnr = ls_header-lifnr
                                                 iv_ekorg = ls_header-ekorg ).
    IF lv_blocked = abap_true.
      mac_po_error '101' ls_header-lifnr ls_header-ekorg im_header.
      RETURN.
    ENDIF.

*   Zahlungsbedingung aus Einkaufsdaten, falls leer
    IF ls_header-zterm IS INITIAL.
      lv_zterm = mo_rules->vendor_payment_terms( iv_lifnr = ls_header-lifnr
                                                 iv_ekorg = ls_header-ekorg ).
      IF lv_zterm IS NOT INITIAL.
        ls_header-zterm = lv_zterm.
        im_header->set_data( ls_header ).
      ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD if_ex_me_process_po_cust~process_item.
    INCLUDE zmm_po_badi_macros.
    DATA: ls_item   TYPE mepoitem,
          ls_header TYPE mepoheader,
          lv_dev    TYPE p LENGTH 7 DECIMALS 2.

    ls_item   = im_item->get_data( ).
    ls_header = im_item->get_header( )->get_data( ).
    IF ls_item-loekz IS NOT INITIAL OR ls_item-matnr IS INITIAL.
      RETURN.
    ENDIF.
    mac_po_context_item ls_item-id.

*   Preis gegen Infosatz
    lv_dev = mo_rules->price_deviation( iv_matnr = ls_item-matnr
                                        iv_lifnr = ls_header-lifnr
                                        iv_ekorg = ls_header-ekorg
                                        iv_werks = ls_item-werks
                                        iv_netpr = ls_item-netpr
                                        iv_peinh = ls_item-peinh ).
    IF lv_dev > gc_err_pct.
      mac_po_error '110' ls_item-ebelp lv_dev space im_item.
    ELSEIF lv_dev > gc_warn_pct.
      mac_po_warning '111' ls_item-ebelp lv_dev space.
    ENDIF.

*   Gefahrgut -> Versandvorschrift Z1
    DATA(lv_haz) = mo_rules->is_hazardous( ls_item-matnr ).
    IF lv_haz = abap_true AND ls_item-evers <> 'Z1'.
      ls_item-evers = 'Z1'.
      im_item->set_data( ls_item ).
    ENDIF.
  ENDMETHOD.

  METHOD if_ex_me_process_po_cust~process_schedule.
  ENDMETHOD.

  METHOD if_ex_me_process_po_cust~process_account.
    INCLUDE zmm_po_badi_macros.
    DATA: ls_acc  TYPE mepoaccounting,
          ls_item TYPE mepoitem.

    ls_acc  = im_account->get_data( ).
    ls_item = im_account->get_item( )->get_data( ).
    IF ls_item-knttp <> gc_knttp_kostl OR ls_acc-kostl IS INITIAL.
      RETURN.
    ENDIF.
    DATA(lv_valid) = mo_rules->cost_center_valid( iv_kokrs = ls_acc-kokrs
                                                  iv_kostl = ls_acc-kostl
                                                  iv_date  = sy-datum ).
    IF lv_valid = abap_false.
      mac_po_error '120' ls_acc-kostl ls_item-ebelp space im_account.
    ENDIF.
  ENDMETHOD.

  METHOD if_ex_me_process_po_cust~check.
    INCLUDE zmm_po_badi_macros.
    DATA: lt_need  TYPE zcl_mm_po_rules=>tt_need,
          ls_avail TYPE zmm_po_budget.

    lt_need = mo_rules->budget_need( im_header ).
    LOOP AT lt_need INTO DATA(ls_need).
      ls_avail = mo_rules->budget_of( iv_kostl = ls_need-kostl
                                      iv_gjahr = ls_need-gjahr ).
      IF ls_avail IS INITIAL.
        CONTINUE.                          "ohne Budgetsatz keine Pruefung
      ENDIF.
      IF ls_avail-verbraucht + ls_need-netwr > ls_avail-budget.
        mac_po_error '130' ls_need-kostl ls_avail-budget ls_need-netwr im_header.
        ch_failed = abap_true.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD if_ex_me_process_po_cust~post.
    DATA: lt_need   TYPE zcl_mm_po_rules=>tt_need,
          ls_header TYPE mepoheader,
          lv_total  TYPE netwr,
          lv_objkey TYPE swr_struct-object_key.

    ls_header = im_header->get_data( ).
    lt_need = mo_rules->budget_need( im_header ).
    IF lt_need IS NOT INITIAL.
      CALL FUNCTION 'Z_MM_PO_BUDGET_UPDATE' IN UPDATE TASK
        EXPORTING
          iv_ebeln = im_ebeln
        TABLES
          it_need  = lt_need.
    ENDIF.

    LOOP AT lt_need INTO DATA(ls_need).
      lv_total = lv_total + ls_need-netwr.
    ENDLOOP.
    IF lv_total >= gc_wf_limit.
      lv_objkey = im_ebeln.
      CALL FUNCTION 'SWE_EVENT_CREATE_IN_UPD_TASK' IN UPDATE TASK
        EXPORTING
          objtype = 'ZBUS2012'
          objkey  = lv_objkey
          event   = 'HIGHVALUE'.
    ENDIF.
  ENDMETHOD.

  METHOD if_ex_me_process_po_cust~close.
    FREE mo_rules.
  ENDMETHOD.

  METHOD if_ex_me_process_po_cust~fieldselection_header.
  ENDMETHOD.

  METHOD if_ex_me_process_po_cust~fieldselection_item.
  ENDMETHOD.

  METHOD if_ex_me_process_po_cust~fieldselection_header_refkeys.
  ENDMETHOD.

  METHOD if_ex_me_process_po_cust~fieldselection_item_refkeys.
  ENDMETHOD.

ENDCLASS.
