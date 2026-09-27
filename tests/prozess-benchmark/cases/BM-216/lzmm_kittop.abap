FUNCTION-POOL zmm_kit.                      "MESSAGE-ID zmm_kit
*----------------------------------------------------------------------*
* Funktionsgruppe ZMM_KIT - Kommissionier-Reservierung fuer
* Fertigungsauftraege (Aufruf aus MES per RFC)
*----------------------------------------------------------------------*
* 2017-10 DBR  Ersterstellung (Linie 3, Kitting Wagen)
* 2019-05 DBR  Chargen FIFO nach Verfallsdatum
* 2022-01 PSO  ATP-Pruefung fuer Schuettgut, Sperrverwaltung als Klasse
*----------------------------------------------------------------------*
TYPES: BEGIN OF ty_comp,
         rsnum    TYPE rsnum,
         rspos    TYPE rspos,
         matnr    TYPE matnr,
         werks    TYPE werks_d,
         lgort    TYPE lgort_d,
         meins    TYPE meins,
         bdmng    TYPE bdmng,
         enmng    TYPE enmng,
         open_qty TYPE menge_d,
         charg    TYPE charg_d,
         alloc    TYPE menge_d,
       END OF ty_comp,
       tt_comp TYPE STANDARD TABLE OF ty_comp WITH DEFAULT KEY,
       BEGIN OF ty_result,
         matnr TYPE matnr,
         msgty TYPE msgty,
         text  TYPE string,
       END OF ty_result,
       tt_result TYPE zmm_kit_result_t.          " DDIC-Tabellentyp (Zeile wie TY_RESULT)

CONSTANTS: gc_psa_lgort TYPE lgort_d VALUE 'PVB3',   " Produktionsversorgung Linie 3
           gc_bwart     TYPE bwart   VALUE '311'.

DATA gt_result TYPE tt_result.

INCLUDE lzmm_kitc01.                        " Klassen
INCLUDE lzmm_kitf01.                        " FORM-Routinen
