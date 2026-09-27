CLASS zcl_ser_market_us DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

*"* BAdI-Implementierung ZSER_MARKET_US (Filter ZIELMARKT = 'US')
*"* Drug Supply Chain Security Act (DSCSA), Product Identifier =
*"* NDC/GTIN + Seriennummer + Charge + Verfall
  PUBLIC SECTION.
    INTERFACES zif_ser_market_badi.
ENDCLASS.



CLASS zcl_ser_market_us IMPLEMENTATION.

  METHOD zif_ser_market_badi~get_rules.
    CLEAR es_rules.

*   Ohne NDC oder Verfallsdatum kein gueltiger Product Identifier
    IF is_gtin-ndc IS INITIAL OR iv_expiry IS INITIAL.
      RAISE EXCEPTION TYPE zcx_ser_rule
        EXPORTING
          textid = zcx_ser_rule=>dscsa_identifier_incomplete
          gtin   = is_gtin-gtin.
    ENDIF.

    es_rules-nr_interval = '02'.
    es_rules-serial_len  = 12.
    es_rules-report_to   = 'PARTNER'.
*   es_rules-report_to   = 'FDA'.     "Pilot 2020, kein Meldeweg an FDA
  ENDMETHOD.


  METHOD zif_ser_market_badi~format_serial.
*   numerisch, 12-stellig mit fuehrenden Nullen (Absprache Grosshandel)
    ev_serial = iv_number.
  ENDMETHOD.

ENDCLASS.
