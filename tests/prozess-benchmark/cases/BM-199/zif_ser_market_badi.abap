INTERFACE zif_ser_market_badi
  PUBLIC.

*"* BAdI-Interface zu BAdI ZSER_MARKET_RULES (Erweiterungsspot ZSER_SPOT)
*"* Einzelverwendung, Filter ZIELMARKT (Typ ZSER_MARKET), keine
*"* Fallback-Klasse. Implementierungen:
*"*   ZSER_MARKET_EU  (ZIELMARKT = 'EU')  -> ZCL_SER_MARKET_EU
*"*   ZSER_MARKET_US  (ZIELMARKT = 'US')  -> ZCL_SER_MARKET_US
  INTERFACES if_badi_interface.

  TYPES: BEGIN OF ty_rules,
           nr_interval TYPE nrnr,          " Intervall im NR-Objekt ZSER_SNR
           serial_len  TYPE i,             " Laenge der Seriennummer
           report_to   TYPE zser_receiver, " EMVS-Hub / Handelspartner
         END OF ty_rules.

  METHODS get_rules
    IMPORTING is_gtin   TYPE zser_gtin
              iv_expiry TYPE vfdat
    EXPORTING es_rules  TYPE ty_rules
    RAISING   zcx_ser_rule.

  METHODS format_serial
    IMPORTING iv_number TYPE zser_snr
              is_rules  TYPE ty_rules
    EXPORTING ev_serial TYPE zser_serial_no.

ENDINTERFACE.
