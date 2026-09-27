*----------------------------------------------------------------------*
* Regeln fuer Bestellungen (verwendet von ZMM_PO_CHECKS)
*----------------------------------------------------------------------*
CLASS zcl_mm_po_rules DEFINITION
  PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_need,
             kostl TYPE kostl,
             gjahr TYPE gjahr,
             netwr TYPE netwr,
           END OF ty_need,
           tt_need TYPE STANDARD TABLE OF ty_need WITH DEFAULT KEY.
    METHODS vendor_blocked
      IMPORTING iv_lifnr          TYPE lifnr
                iv_ekorg          TYPE ekorg
      RETURNING VALUE(rv_blocked) TYPE abap_bool.
    METHODS vendor_payment_terms
      IMPORTING iv_lifnr        TYPE lifnr
                iv_ekorg        TYPE ekorg
      RETURNING VALUE(rv_zterm) TYPE dzterm.
    METHODS price_deviation
      IMPORTING iv_matnr      TYPE matnr
                iv_lifnr      TYPE lifnr
                iv_ekorg      TYPE ekorg
                iv_werks      TYPE ewerk
                iv_netpr      TYPE bprei
                iv_peinh      TYPE epein
      RETURNING VALUE(rv_pct) TYPE zmm_dev_pct.
    METHODS is_hazardous
      IMPORTING iv_matnr      TYPE matnr
      RETURNING VALUE(rv_haz) TYPE abap_bool.
    METHODS cost_center_valid
      IMPORTING iv_kokrs        TYPE kokrs
                iv_kostl        TYPE kostl
                iv_date         TYPE dats
      RETURNING VALUE(rv_valid) TYPE abap_bool.
    METHODS budget_need
      IMPORTING io_header      TYPE REF TO if_purchase_order_mm
      RETURNING VALUE(rt_need) TYPE tt_need.
    METHODS budget_of
      IMPORTING iv_kostl         TYPE kostl
                iv_gjahr         TYPE gjahr
      RETURNING VALUE(rs_budget) TYPE zmm_po_budget.
  PRIVATE SECTION.
    TYPES: BEGIN OF ty_haz,
             matnr TYPE matnr,
             haz   TYPE abap_bool,
           END OF ty_haz.
    DATA mt_haz TYPE HASHED TABLE OF ty_haz WITH UNIQUE KEY matnr.
ENDCLASS.

CLASS zcl_mm_po_rules IMPLEMENTATION.

  METHOD vendor_blocked.
    DATA: lv_sperm TYPE sperm_m,
          lv_zentr TYPE sperm_x.
    SELECT SINGLE sperm FROM lfm1 INTO lv_sperm
      WHERE lifnr = iv_lifnr
        AND ekorg = iv_ekorg.
    IF lv_sperm = 'X'.
      rv_blocked = abap_true.
      RETURN.
    ENDIF.
    SELECT SINGLE sperm FROM lfa1 INTO lv_zentr
      WHERE lifnr = iv_lifnr.
    rv_blocked = xsdbool( lv_zentr = 'X' ).
  ENDMETHOD.

  METHOD vendor_payment_terms.
    SELECT SINGLE zterm FROM lfm1 INTO rv_zterm
      WHERE lifnr = iv_lifnr
        AND ekorg = iv_ekorg.
  ENDMETHOD.

  METHOD price_deviation.
    DATA: lv_info  TYPE p LENGTH 13 DECIMALS 4,
          lv_order TYPE p LENGTH 13 DECIMALS 4.

    SELECT e~netpr, e~peinh, e~werks
      FROM eina AS a INNER JOIN eine AS e ON e~infnr = a~infnr
      WHERE a~matnr = @iv_matnr
        AND a~lifnr = @iv_lifnr
        AND a~loekz = @space
        AND e~ekorg = @iv_ekorg
        AND e~esokz = '0'
        AND ( e~werks = @iv_werks OR e~werks = @space )
        AND e~loekz = @space
      ORDER BY e~werks DESCENDING
      INTO TABLE @DATA(lt_info)
      UP TO 1 ROWS.
    READ TABLE lt_info INTO DATA(ls_info) INDEX 1.
    IF sy-subrc <> 0 OR ls_info-peinh = 0 OR ls_info-netpr = 0 OR iv_peinh = 0.
      rv_pct = 0.                          "kein Infosatz: keine Pruefung
      RETURN.
    ENDIF.
    lv_info  = ls_info-netpr / ls_info-peinh.
    lv_order = iv_netpr / iv_peinh.
    rv_pct = ( lv_order - lv_info ) * 100 / lv_info.
  ENDMETHOD.

  METHOD is_hazardous.
    READ TABLE mt_haz INTO DATA(ls_haz) WITH TABLE KEY matnr = iv_matnr.
    IF sy-subrc = 0.
      rv_haz = ls_haz-haz.
      RETURN.
    ENDIF.
    SELECT SINGLE profl FROM mara INTO @DATA(lv_profl)
      WHERE matnr = @iv_matnr.
    rv_haz = xsdbool( lv_profl IS NOT INITIAL ).
    INSERT VALUE #( matnr = iv_matnr haz = rv_haz ) INTO TABLE mt_haz.
  ENDMETHOD.

  METHOD cost_center_valid.
    SELECT SINGLE bkzkp FROM csks INTO @DATA(lv_bkzkp)
      WHERE kokrs = @iv_kokrs
        AND kostl = @iv_kostl
        AND datbi >= @iv_date
        AND datab <= @iv_date.
    IF sy-subrc <> 0.
      rv_valid = abap_false.
    ELSEIF lv_bkzkp = 'X'.
      rv_valid = abap_false.               "fuer Primaerkosten gesperrt
    ELSE.
      rv_valid = abap_true.
    ENDIF.
  ENDMETHOD.

  METHOD budget_need.
    DATA: ls_need TYPE ty_need,
          ls_head TYPE mepoheader.

    ls_head = io_header->get_data( ).
    DATA(lt_items) = io_header->get_items( ).
    LOOP AT lt_items INTO DATA(ls_it).
      DATA(ls_item) = ls_it-item->get_data( ).
      IF ls_item-loekz IS NOT INITIAL OR ls_item-knttp <> 'K'.
        CONTINUE.
      ENDIF.
      DATA(lt_acc) = ls_it-item->get_accountings( ).
      LOOP AT lt_acc INTO DATA(ls_acc_ref).
        DATA(ls_acc) = ls_acc_ref-accounting->get_data( ).
        CLEAR ls_need.
        ls_need-kostl = ls_acc-kostl.
        ls_need-gjahr = ls_head-bedat(4).
*       Aufteilung nach Prozent, sonst voller Positionswert
        IF ls_acc-vproz > 0.
          ls_need-netwr = ls_item-netwr * ls_acc-vproz / 100.
        ELSE.
          ls_need-netwr = ls_item-netwr.
        ENDIF.
        COLLECT ls_need INTO rt_need.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD budget_of.
    SELECT SINGLE * FROM zmm_po_budget INTO rs_budget
      WHERE kostl = iv_kostl
        AND gjahr = iv_gjahr.
  ENDMETHOD.

ENDCLASS.
