*----------------------------------------------------------------------*
* Include ZMM_NIEDERSTWERT_TOP - globale Daten
*----------------------------------------------------------------------*
TABLES: mara, mbew.
TYPE-POOLS: icon, slis.

TYPES: BEGIN OF ty_bew,
         matnr    TYPE mbew-matnr,
         bwkey    TYPE mbew-bwkey,
         mtart    TYPE mara-mtart,
         vprsv    TYPE mbew-vprsv,
         lbkum    TYPE mbew-lbkum,
         salk3    TYPE mbew-salk3,
         peinh    TYPE mbew-peinh,
         preis    TYPE mbew-stprs,        "Buchpreis je PEINH
         markt    TYPE mbew-stprs,        "Marktpreis je PEINH
         verbr    TYPE mseg-menge,        "Verbrauch 12 Monate
         reichw   TYPE p LENGTH 7 DECIMALS 1,
         abschl   TYPE p LENGTH 5 DECIMALS 2,
         neupr    TYPE mbew-stprs,
         abw_pct  TYPE p LENGTH 7 DECIMALS 2,
         abw_wert TYPE mbew-salk3,
         kandidat TYPE abap_bool,
         status   TYPE icon_d,
         meldung  TYPE bapi_msg,
       END OF ty_bew.

DATA: gt_werks  TYPE STANDARD TABLE OF t001w-werks,
      gt_bew    TYPE STANDARD TABLE OF ty_bew,
      gt_bdc    TYPE STANDARD TABLE OF bdcdata,
      gt_bdcmsg TYPE STANDARD TABLE OF bdcmsgcoll,
      gv_von    TYPE sy-datum,
      gv_von6   TYPE sy-datum.

CONSTANTS: gc_abschl_24 TYPE p LENGTH 5 DECIMALS 2 VALUE '50.00',
           gc_abschl_12 TYPE p LENGTH 5 DECIMALS 2 VALUE '20.00',
           gc_abschl_0  TYPE p LENGTH 5 DECIMALS 2 VALUE '80.00'.

* Verbrauchsbewegungen (Fertigungsauftrag, Kostenstelle, Lieferung)
RANGES r_bwart_verbr FOR mseg-bwart.
