CLASS zcl_mm_po_regel_preis DEFINITION
  PUBLIC
  INHERITING FROM zcl_mm_po_regel_base
  FINAL
  CREATE PUBLIC.

*----------------------------------------------------------------------*
* Regel PREIS: Nettopreis der Position gegen Einkaufsinfosatz
*   - kein Infosatz          -> Warnung
*   - Abweichung > 5 % nach oben -> Fehler
*----------------------------------------------------------------------*
  PROTECTED SECTION.
    METHODS pruefe_intern REDEFINITION.
  PRIVATE SECTION.
    CONSTANTS gc_toleranz_proz TYPE p LENGTH 3 DECIMALS 1 VALUE '5.0'.
ENDCLASS.



CLASS zcl_mm_po_regel_preis IMPLEMENTATION.

  METHOD pruefe_intern.
    SELECT purchaseorderitem, material, plant, netpriceamount, netpricequantity
      FROM i_purchaseorderitemapi01
      WHERE purchaseorder = @ms_bestellung-purchaseorder
        AND purchasingdocumentdeletioncode = @space
        AND material <> @space
      INTO TABLE @DATA(lt_pos).

    LOOP AT lt_pos INTO DATA(ls_pos).

      SELECT SINGLE o~netpriceamount, o~materialpriceunitqty
        FROM i_purginforecdorgplntdataapi01 AS o
        INNER JOIN i_purchasinginforecordapi01 AS r
          ON r~purchasinginforecord = o~purchasinginforecord
        WHERE r~supplier               = @ms_bestellung-supplier
          AND r~material               = @ls_pos-material
          AND o~purchasingorganization = @ms_bestellung-purchasingorganization
          AND o~plant                  = @ls_pos-plant
        INTO @DATA(ls_info).

      IF sy-subrc <> 0.
        melde( iv_schwere = 'W'
               iv_text    = |Pos. { ls_pos-purchaseorderitem }: kein Infosatz fuer { ls_pos-material }| ).
        CONTINUE.
      ENDIF.

*     Preise je Preiseinheit vergleichen
      DATA(lv_preis_best) = ls_pos-netpriceamount / nmax( val1 = ls_pos-netpricequantity val2 = 1 ).
      DATA(lv_preis_info) = ls_info-netpriceamount / nmax( val1 = ls_info-materialpriceunitqty val2 = 1 ).

      IF lv_preis_info > 0 AND
         ( lv_preis_best - lv_preis_info ) * 100 / lv_preis_info > gc_toleranz_proz.
        melde( iv_schwere = 'E'
               iv_text    = |Pos. { ls_pos-purchaseorderitem }: Preis { lv_preis_best } > Infosatz { lv_preis_info } + 5 %| ).
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
