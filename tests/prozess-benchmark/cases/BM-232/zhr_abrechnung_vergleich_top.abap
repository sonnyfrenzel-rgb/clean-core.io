*&---------------------------------------------------------------------*
*&  Include           ZHR_ABRECHNUNG_VERGLEICH_TOP
*&---------------------------------------------------------------------*
TABLES: pa0001, t512w.

CLASS lcl_vergleich DEFINITION DEFERRED.
CLASS lcl_protokoll DEFINITION DEFERRED.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE text-b01.
SELECT-OPTIONS: s_abkrs FOR pa0001-abkrs OBLIGATORY NO INTERVALS,
                s_pernr FOR pa0001-pernr.
PARAMETERS:     p_abrp  TYPE faper OBLIGATORY,
                p_vorp  TYPE faper OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE text-b02.
SELECT-OPTIONS: s_lgart FOR t512w-lgart.
PARAMETERS:     p_proz  TYPE p LENGTH 5 DECIMALS 1 DEFAULT '20.0'.
SELECTION-SCREEN END OF BLOCK b2.

TYPES: BEGIN OF ty_out,
         pernr TYPE persno,
         lgart TYPE lgart,
         alt   TYPE maxbt,
         neu   TYPE maxbt,
       END OF ty_out.

DATA: gt_pernr     TYPE STANDARD TABLE OF persno,
      gv_pernr     TYPE persno,
      go_vergleich TYPE REF TO lcl_vergleich,
      go_protokoll TYPE REF TO lcl_protokoll.
