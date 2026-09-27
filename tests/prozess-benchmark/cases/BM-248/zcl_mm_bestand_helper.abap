CLASS zcl_mm_bestand_helper DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    "! Offene Reservierungsmenge je Material/Werk/Lagerort (gepuffert)
    METHODS reservierte_menge
      IMPORTING
        iv_matnr        TYPE matnr
        iv_werks        TYPE werks_d
        iv_lgort        TYPE lgort_d
      RETURNING
        VALUE(rv_menge) TYPE labst.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_puffer,
             matnr TYPE matnr,
             werks TYPE werks_d,
             lgort TYPE lgort_d,
             menge TYPE labst,
           END OF ty_puffer.
    DATA mt_puffer TYPE HASHED TABLE OF ty_puffer WITH UNIQUE KEY matnr werks lgort.
ENDCLASS.



CLASS zcl_mm_bestand_helper IMPLEMENTATION.

  METHOD reservierte_menge.
    READ TABLE mt_puffer INTO DATA(ls_puffer)
         WITH TABLE KEY matnr = iv_matnr werks = iv_werks lgort = iv_lgort.
    IF sy-subrc = 0.
      rv_menge = ls_puffer-menge.
      RETURN.
    ENDIF.

*   offene Reservierungen: Bedarfsmenge minus entnommene Menge,
*   ohne geloeschte und endausgefasste Positionen
    SELECT SUM( bdmng - enmng ) FROM resb
      WHERE matnr = @iv_matnr
        AND werks = @iv_werks
        AND lgort = @iv_lgort
        AND xloek = @space
        AND kzear = @space
        AND bdart IN ( 'AR', 'SB' )
      INTO @rv_menge.

    IF rv_menge < 0.
      rv_menge = 0.
    ENDIF.

    INSERT VALUE #( matnr = iv_matnr werks = iv_werks lgort = iv_lgort menge = rv_menge )
           INTO TABLE mt_puffer.
  ENDMETHOD.

ENDCLASS.
