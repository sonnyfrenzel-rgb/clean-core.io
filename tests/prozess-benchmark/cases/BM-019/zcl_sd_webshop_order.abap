CLASS zcl_sd_webshop_order DEFINITION PUBLIC FINAL CREATE PUBLIC.
*----------------------------------------------------------------------*
* Webshop-Bestellung: Verfügbarkeit, Preisabgleich, Auftragsanlage
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    DATA: mt_messages TYPE bapiret2_t READ-ONLY,
          mv_netwr    TYPE netwr_ak READ-ONLY.

    METHODS constructor
      IMPORTING is_header TYPE zsd_s_web_header
                it_items  TYPE zsd_t_web_item
                iv_kunnr  TYPE kunnr.
    METHODS check_availability
      RAISING zcx_sd_webshop.
    METHODS check_prices
      RETURNING VALUE(rv_ok) TYPE abap_bool.
    METHODS create
      RETURNING VALUE(rv_vbeln) TYPE vbeln_va
      RAISING   zcx_sd_webshop.

  PRIVATE SECTION.
    CONSTANTS: c_auart TYPE auart VALUE 'ZWEB',
               c_vkorg TYPE vkorg VALUE '1000',
               c_vtweg TYPE vtweg VALUE '30',
               c_spart TYPE spart VALUE '00',
               c_tol   TYPE netwr_ak VALUE '0.01'.   "Rundung je Position

    DATA: ms_header TYPE zsd_s_web_header,
          mt_items  TYPE zsd_t_web_item,
          mv_kunnr  TYPE kunnr.

    METHODS build_bapi_tables
      EXPORTING es_hdr TYPE bapisdhd1
                et_itm TYPE bapisditm_tt
                et_par TYPE bapiparnr_tt
                et_sch TYPE bapischdl_t.
ENDCLASS.



CLASS zcl_sd_webshop_order IMPLEMENTATION.

  METHOD constructor.
    ms_header = is_header.
    mt_items  = it_items.
    mv_kunnr  = iv_kunnr.
  ENDMETHOD.


  METHOD check_availability.
    DATA: lv_avail TYPE mng01,
          ls_ret   TYPE bapireturn.

    LOOP AT mt_items INTO DATA(ls_item).
      CLEAR: lv_avail, ls_ret.
      CALL FUNCTION 'BAPI_MATERIAL_AVAILABILITY'
        EXPORTING
          plant         = ls_item-werks
          material_long = ls_item-matnr
          unit          = ls_item-unit
          check_rule    = 'A'
        IMPORTING
          av_qty_plt    = lv_avail
          return        = ls_ret.
      IF ls_ret-type = 'E'.
        RAISE EXCEPTION TYPE zcx_sd_webshop
          EXPORTING textid = zcx_sd_webshop=>atp_error
                    matnr  = ls_item-matnr.
      ENDIF.

      IF lv_avail < ls_item-quantity.
*       Kunde hat im Shop "Teillieferung erlaubt" angehakt?
        IF ms_header-partial_ok = abap_false.
          RAISE EXCEPTION TYPE zcx_sd_webshop
            EXPORTING textid = zcx_sd_webshop=>not_available
                      matnr  = ls_item-matnr.
        ENDIF.
        APPEND VALUE #( type = 'W' id = 'ZSD' number = '910'
                        message_v1 = ls_item-matnr
                        message_v2 = lv_avail ) TO mt_messages.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD check_prices.
    DATA: ls_hdr    TYPE bapisdhd1,
          lt_itm    TYPE bapisditm_tt,
          lt_par    TYPE bapiparnr_tt,
          lt_sch    TYPE bapischdl_t,
          lt_itmout TYPE STANDARD TABLE OF bapiitemex,
          ls_ret    TYPE bapireturn,
          lv_tabix  TYPE sytabix.

    build_bapi_tables( IMPORTING es_hdr = ls_hdr et_itm = lt_itm
                                 et_par = lt_par et_sch = lt_sch ).

    CALL FUNCTION 'BAPI_SALESORDER_SIMULATE'
      EXPORTING
        order_header_in   = ls_hdr
      IMPORTING
        return            = ls_ret
      TABLES
        order_items_in    = lt_itm
        order_partners    = lt_par
        order_schedule_in = lt_sch
        order_items_out   = lt_itmout.

    rv_ok = abap_true.
    CLEAR mv_netwr.

*   Positionen kommen in Eingangsreihenfolge zurück
    LOOP AT lt_itmout INTO DATA(ls_out).
      lv_tabix = sy-tabix.
      READ TABLE mt_items INTO DATA(ls_item) INDEX lv_tabix.
      IF abs( ls_out-net_value1 - ls_item-shop_net ) > c_tol.
        rv_ok = abap_false.
        APPEND VALUE #( type = 'E' id = 'ZSD' number = '911'
                        message_v1 = ls_item-matnr
                        message_v2 = ls_item-shop_net
                        message_v3 = ls_out-net_value1 ) TO mt_messages.
      ENDIF.
      mv_netwr = mv_netwr + ls_out-net_value1.
    ENDLOOP.
  ENDMETHOD.


  METHOD create.
    DATA: ls_hdr TYPE bapisdhd1,
          lt_itm TYPE bapisditm_tt,
          lt_par TYPE bapiparnr_tt,
          lt_sch TYPE bapischdl_t,
          lt_ret TYPE bapiret2_t.

    build_bapi_tables( IMPORTING es_hdr = ls_hdr et_itm = lt_itm
                                 et_par = lt_par et_sch = lt_sch ).

*   kein Commit hier - der Aufrufer schreibt Auftrag und Protokoll
*   gemeinsam fest
    CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
      EXPORTING
        order_header_in    = ls_hdr
      IMPORTING
        salesdocument      = rv_vbeln
      TABLES
        return             = lt_ret
        order_items_in     = lt_itm
        order_partners     = lt_par
        order_schedules_in = lt_sch.
    APPEND LINES OF lt_ret TO mt_messages.

    IF rv_vbeln IS INITIAL.
      RAISE EXCEPTION TYPE zcx_sd_webshop
        EXPORTING textid = zcx_sd_webshop=>order_create_failed.
    ENDIF.
  ENDMETHOD.


  METHOD build_bapi_tables.
    DATA lv_posnr TYPE posnr_va.

    CLEAR: es_hdr, et_itm, et_par, et_sch.
    es_hdr = VALUE #( doc_type   = c_auart
                      sales_org  = c_vkorg
                      distr_chan = c_vtweg
                      division   = c_spart
                      purch_no_c = ms_header-shop_order
                      purch_date = sy-datum
                      currency   = ms_header-currency ).
    et_par = VALUE #( ( partn_role = 'AG' partn_numb = mv_kunnr ) ).

    LOOP AT mt_items INTO DATA(ls_item).
      lv_posnr = sy-tabix * 10.
      APPEND VALUE #( itm_number  = lv_posnr
                      material_long = ls_item-matnr
                      plant       = ls_item-werks
                      target_qty  = ls_item-quantity
                      target_qu   = ls_item-unit ) TO et_itm.
      APPEND VALUE #( itm_number = lv_posnr
                      req_qty    = ls_item-quantity ) TO et_sch.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
