*&---------------------------------------------------------------------*
*&  Include           ZFI_MAHNSPERRE_TOP
*&---------------------------------------------------------------------*
TABLES: knb5.

TYPES: BEGIN OF ty_knb5,
         kunnr TYPE kunnr,
         bukrs TYPE bukrs,
         mahna TYPE mahna,
         madat TYPE madat,
       END OF ty_knb5.

TYPES: BEGIN OF ty_bsid,
         bukrs TYPE bukrs,
         kunnr TYPE kunnr,
         belnr TYPE belnr_d,
         gjahr TYPE gjahr,
         buzei TYPE buzei,
         zfbdt TYPE dzfbdt,
         zbd1t TYPE dzbd1t,
         mansp TYPE mansp,
         dmbtr TYPE dmbtr,
       END OF ty_bsid.

TYPES: BEGIN OF ty_log,
         typ   TYPE c LENGTH 1,
         kunnr TYPE kunnr,
         belnr TYPE belnr_d,
         gjahr TYPE gjahr,
         buzei TYPE buzei,
         text  TYPE char60,
       END OF ty_log.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE text-b01.
PARAMETERS:     p_bukrs TYPE bukrs OBLIGATORY.
SELECT-OPTIONS: s_kunnr FOR knb5-kunnr.
PARAMETERS:     p_stich TYPE datum OBLIGATORY,
                p_mansp TYPE mansp DEFAULT 'S' OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.
PARAMETERS:     p_test  AS CHECKBOX DEFAULT 'X'.

DATA: gt_knb5      TYPE STANDARD TABLE OF ty_knb5,
      gs_knb5      TYPE ty_knb5,
      gt_log       TYPE STANDARD TABLE OF ty_log,
      gv_geaendert TYPE i.
