CLASS zcx_sd_shpconf DEFINITION
  PUBLIC
  INHERITING FROM cx_static_check
  FINAL
  CREATE PUBLIC.
* Fehler der Versandbestaetigung - fuehrt immer zu IDoc-Status 51.
* Texte im OTR (Transaktion SOTR_EDIT).
* (Attribute VBELN/MSGV1 2020-07 entfernt - Texte waren nie gepflegt)

  PUBLIC SECTION.
    CONSTANTS:
      no_delivery         TYPE sotr_conc VALUE '0050569A1B2C1EDB8A8F3C1F7E8D0001',
      delivery_locked     TYPE sotr_conc VALUE '0050569A1B2C1EDB8A8F3C1F7E8D0002',
      posting_failed      TYPE sotr_conc VALUE '0050569A1B2C1EDB8A8F3C1F7E8D0003',
      empty_segment       TYPE sotr_conc VALUE '0050569A1B2C1EDB8A8F3C1F7E8D0004',
      unknown_delivery    TYPE sotr_conc VALUE '0050569A1B2C1EDB8A8F3C1F7E8D0005',
      already_issued      TYPE sotr_conc VALUE '0050569A1B2C1EDB8A8F3C1F7E8D0006',
      item_without_header TYPE sotr_conc VALUE '0050569A1B2C1EDB8A8F3C1F7E8D0007',
      unknown_item        TYPE sotr_conc VALUE '0050569A1B2C1EDB8A8F3C1F7E8D0008',
      overpick            TYPE sotr_conc VALUE '0050569A1B2C1EDB8A8F3C1F7E8D0009',
      unknown_batch       TYPE sotr_conc VALUE '0050569A1B2C1EDB8A8F3C1F7E8D000A'.
ENDCLASS.



CLASS zcx_sd_shpconf IMPLEMENTATION.
ENDCLASS.
