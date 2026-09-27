*&---------------------------------------------------------------------*
*& Include ZISU_ABRVORB_TOP  - Typen, Daten, Selektionsbild
*&---------------------------------------------------------------------*
TABLES: te420.

TYPES: BEGIN OF ty_anl,
         anlage   TYPE eanl-anlage,
         vertrag  TYPE ever-vertrag,
         abrsperr TYPE ever-abrsperr,
         sparte   TYPE eanl-sparte,
         aklasse  TYPE eanlh-aklasse,
         einzdat  TYPE ever-einzdat,
       END OF ty_anl,
       tt_anl TYPE STANDARD TABLE OF ty_anl WITH DEFAULT KEY,
       BEGIN OF ty_prot,
         anlage TYPE eanl-anlage,
         typ    TYPE symsgty,
         text   TYPE char120,
       END OF ty_prot,
       tt_prot TYPE STANDARD TABLE OF ty_prot WITH DEFAULT KEY.

* Sperrgruende Abrechnung (Customizing TE... im Kundennamensraum)
CONSTANTS: gc_sperr_rlm    TYPE ever-abrsperr VALUE '05',
           gc_sperr_keinvp TYPE ever-abrsperr VALUE '06'.

DATA: gt_prot TYPE tt_prot,
      go_lauf TYPE REF TO lcl_lauf.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
PARAMETERS: p_port  TYPE te420-termschl OBLIGATORY,
            p_adat  TYPE sy-datum OBLIGATORY,
            p_paket TYPE i DEFAULT 500.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
PARAMETERS: p_schae AS CHECKBOX DEFAULT 'X',
            p_sperr AS CHECKBOX DEFAULT 'X',
            p_test  AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b2.
