*----------------------------------------------------------------------*
* Hilfsklasse Rechnungspruefung: Toleranzen und Positionspruefung
*----------------------------------------------------------------------*
CLASS zcl_mm_iv_check DEFINITION
  PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_result,
             not_found     TYPE abap_bool,
             price_dev_pct TYPE p LENGTH 7 DECIMALS 2,
             qty_over      TYPE menge_d,
             diff_amount   TYPE wrbtr,
           END OF ty_result.
    METHODS get_tolerance
      IMPORTING iv_bukrs      TYPE bukrs
                iv_lifnr      TYPE lifnr
      RETURNING VALUE(rs_tol) TYPE zmm_iv_tol.
    METHODS check_item
      IMPORTING is_rseg          TYPE mrmrseg
      RETURNING VALUE(rs_result) TYPE ty_result.
  PRIVATE SECTION.
    CONSTANTS c_default_pct TYPE p LENGTH 7 DECIMALS 2 VALUE '5.00'.
ENDCLASS.

CLASS zcl_mm_iv_check IMPLEMENTATION.

  METHOD get_tolerance.
*   1. kreditorspezifisch, 2. Buchungskreis-Default, 3. fest 5 %
    SELECT SINGLE * FROM zmm_iv_tol INTO rs_tol
      WHERE bukrs = iv_bukrs
        AND lifnr = iv_lifnr.
    IF sy-subrc <> 0.
      SELECT SINGLE * FROM zmm_iv_tol INTO rs_tol
        WHERE bukrs = iv_bukrs
          AND lifnr = space.
      IF sy-subrc <> 0.
        CLEAR rs_tol.
        rs_tol-bukrs     = iv_bukrs.
        rs_tol-preis_pct = c_default_pct.
      ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD check_item.
    DATA: ls_ekpo     TYPE ekpo,
          lv_we_menge TYPE menge_d,
          lv_re_menge TYPE menge_d,
          lv_po_price TYPE p LENGTH 13 DECIMALS 4,
          lv_iv_price TYPE p LENGTH 13 DECIMALS 4.

    SELECT SINGLE * FROM ekpo INTO ls_ekpo
      WHERE ebeln = is_rseg-ebeln
        AND ebelp = is_rseg-ebelp.
    IF sy-subrc <> 0 OR ls_ekpo-peinh = 0 OR is_rseg-menge = 0.
      rs_result-not_found = abap_true.
      RETURN.
    ENDIF.

*   Preis je Basiseinheit Bestellung vs. Rechnung
    lv_po_price = ls_ekpo-netpr / ls_ekpo-peinh.
    lv_iv_price = is_rseg-wrbtr / is_rseg-menge.
    IF lv_po_price > 0.
      rs_result-price_dev_pct = ( lv_iv_price - lv_po_price ) * 100 / lv_po_price.
    ENDIF.
    rs_result-diff_amount = ( lv_iv_price - lv_po_price ) * is_rseg-menge.

*   Mengen aus Bestellentwicklung: WE (1) minus bereits berechnet (2)
    SELECT SUM( CASE shkzg WHEN 'S' THEN menge ELSE 0 - menge END )
      FROM ekbe INTO @lv_we_menge
      WHERE ebeln = @is_rseg-ebeln
        AND ebelp = @is_rseg-ebelp
        AND vgabe = '1'.
    SELECT SUM( CASE shkzg WHEN 'S' THEN menge ELSE 0 - menge END )
      FROM ekbe INTO @lv_re_menge
      WHERE ebeln = @is_rseg-ebeln
        AND ebelp = @is_rseg-ebelp
        AND vgabe = '2'.

    IF ls_ekpo-webre = 'X'.
      rs_result-qty_over = is_rseg-menge - ( lv_we_menge - lv_re_menge ).
      IF rs_result-qty_over < 0.
        rs_result-qty_over = 0.
      ENDIF.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
