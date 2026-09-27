CLASS zcl_ser_market_eu DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

*"* BAdI-Implementierung ZSER_MARKET_EU (Filter ZIELMARKT = 'EU')
*"* EU-Faelschungsschutzrichtlinie 2011/62/EU, Del. VO (EU) 2016/161
  PUBLIC SECTION.
    INTERFACES zif_ser_market_badi.

  PRIVATE SECTION.
    CONSTANTS: gc_alphabet TYPE c LENGTH 34 VALUE '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ',
               gc_prime    TYPE decfloat34 VALUE '1000000007',
               gc_modulus  TYPE decfloat34 VALUE '2386420683693101056'.   " 34^12
ENDCLASS.



CLASS zcl_ser_market_eu IMPLEMENTATION.

  METHOD zif_ser_market_badi~get_rules.
    CLEAR es_rules.

*   Nur FMD-pflichtige Produkte (verschreibungspflichtig, nicht Whitelist)
    IF is_gtin-fmd_relevant <> abap_true.
      RAISE EXCEPTION TYPE zcx_ser_rule
        EXPORTING
          textid = zcx_ser_rule=>not_fmd_relevant
          gtin   = is_gtin-gtin.
    ENDIF.

    es_rules-nr_interval = '01'.
    es_rules-serial_len  = 12.
    es_rules-report_to   = 'EMVS'.
  ENDMETHOD.


  METHOD zif_ser_market_badi~format_serial.
    DATA: lv_val TYPE decfloat34,
          lv_idx TYPE i.

    CLEAR ev_serial.
*   "Randomisierung" nach Art. 4 b) Del. VO: Nummer * Primzahl modulo 34^12,
*   dargestellt zur Basis 34 (ohne I und O) - eindeutig je Laufnummer
    lv_val = ( iv_number * gc_prime ) MOD gc_modulus.
    DO is_rules-serial_len TIMES.
      lv_idx = lv_val MOD 34.
      ev_serial = substring( val = gc_alphabet off = lv_idx len = 1 ) && ev_serial.
      lv_val = ( lv_val - lv_idx ) / 34.
    ENDDO.
    ASSERT strlen( ev_serial ) = is_rules-serial_len.
*   ev_serial = cl_abap_random=>create( )->intinrange( ... ).  "verworfen: Duplikate
  ENDMETHOD.

ENDCLASS.
