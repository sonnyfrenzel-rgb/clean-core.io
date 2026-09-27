*&---------------------------------------------------------------------*
*& Include ZFT_PRAEFERENZ_TOP
*&---------------------------------------------------------------------*
TABLES: marc.

TYPES: BEGIN OF ty_mat,
         matnr TYPE marc-matnr,
         stawn TYPE marc-stawn,
         mtart TYPE mara-mtart,
       END OF ty_mat,
       BEGIN OF ty_alt,
         matnr    TYPE zft_praef_erg-matnr,
         ursprung TYPE zft_praef_erg-ursprung,
       END OF ty_alt,
       BEGIN OF ty_erg,
         stawn    TYPE marc-stawn,
         matnr    TYPE marc-matnr,
         ursprung TYPE abap_bool,
         alt      TYPE abap_bool,
         anteil   TYPE p LENGTH 7 DECIMALS 2,
         grund    TYPE char60,
         verloren TYPE abap_bool,
       END OF ty_erg.

CLASS lcl_kalkulation DEFINITION DEFERRED.

DATA: gt_mat  TYPE STANDARD TABLE OF ty_mat,
      gt_alt  TYPE STANDARD TABLE OF ty_alt,
      gt_erg  TYPE STANDARD TABLE OF ty_erg,
      go_kalk TYPE REF TO lcl_kalkulation.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
PARAMETERS:     p_werks TYPE marc-werks OBLIGATORY,
                p_stich TYPE sy-datum OBLIGATORY.
SELECT-OPTIONS: s_matnr FOR marc-matnr.
SELECTION-SCREEN END OF BLOCK b1.
SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
PARAMETERS:     p_upd AS CHECKBOX.
SELECTION-SCREEN END OF BLOCK b2.
