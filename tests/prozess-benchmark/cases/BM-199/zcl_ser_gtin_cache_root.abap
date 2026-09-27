CLASS zcl_ser_gtin_cache_root DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC
  SHARED MEMORY ENABLED.

*"* Wurzelklasse des Shared-Objects-Gebiets ZSER_GTIN_AREA
*"* Haelt alle serialisierungspflichtigen Materialien mit GTIN/NDC.
  PUBLIC SECTION.
    TYPES tt_gtin TYPE HASHED TABLE OF zser_gtin WITH UNIQUE KEY matnr.

    DATA mt_gtin      TYPE tt_gtin READ-ONLY.
    DATA mv_loaded_at TYPE timestampl READ-ONLY.

    METHODS load.
ENDCLASS.



CLASS zcl_ser_gtin_cache_root IMPLEMENTATION.

  METHOD load.
*   nur freigegebene Materialien (Loeschvormerkung raus)
*   Hinweis S/4: MATNR 40-stellig, ZSER_GTIN-MATNR wurde nicht angepasst!
    SELECT * FROM zser_gtin
      INTO TABLE @mt_gtin
      WHERE lvorm = @space.
*    SELECT * FROM zser_gtin INTO TABLE mt_gtin
*      WHERE lvorm = space AND werks = '1000'.     "bis 2022 nur Werk 1000
    GET TIME STAMP FIELD mv_loaded_at.
  ENDMETHOD.

ENDCLASS.
