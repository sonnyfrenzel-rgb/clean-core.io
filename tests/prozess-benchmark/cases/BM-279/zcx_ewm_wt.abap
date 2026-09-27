CLASS zcx_ewm_wt DEFINITION
  PUBLIC
  INHERITING FROM cx_static_check
  CREATE PUBLIC.
* Fachlicher Fehler bei der Quittierung - keine automatische Wiederholung.
* Unterklasse ZCX_EWM_WT_TEMP: voruebergehend (Sperre), wird wiederholt.
  PUBLIC SECTION.
    CONSTANTS:
      unknown_task      TYPE sotr_conc VALUE '0050569A3C4D1EEB8F2A5B3C7D8E0001',
      over_confirmation TYPE sotr_conc VALUE '0050569A3C4D1EEB8F2A5B3C7D8E0002',
      posting_failed    TYPE sotr_conc VALUE '0050569A3C4D1EEB8F2A5B3C7D8E0003',
      posting_locked    TYPE sotr_conc VALUE '0050569A3C4D1EEB8F2A5B3C7D8E0004'.
ENDCLASS.



CLASS zcx_ewm_wt IMPLEMENTATION.
ENDCLASS.
