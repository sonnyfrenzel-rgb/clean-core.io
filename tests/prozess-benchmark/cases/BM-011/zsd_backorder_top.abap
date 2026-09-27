*&---------------------------------------------------------------------*
*& Include ZSD_BACKORDER_TOP - globale Daten und Selektionsbild
*&---------------------------------------------------------------------*
TABLES: vbak, vbap.
TYPE-POOLS: slis.

TYPES: BEGIN OF ty_rueck,
         matnr  TYPE vbap-matnr,
         werks  TYPE vbap-werks,
         lprio  TYPE vbap-lprio,
         edatu  TYPE vbak-vdatu,
         vbeln  TYPE vbap-vbeln,
         posnr  TYPE vbap-posnr,
         kwmeng TYPE vbap-kwmeng,
         bmeng  TYPE vbep-bmeng,
         offen  TYPE vbap-kwmeng,
         vrkme  TYPE vbap-vrkme,
       END OF ty_rueck,
       BEGIN OF ty_prot,
         vbeln  TYPE vbap-vbeln,
         posnr  TYPE vbap-posnr,
         matnr  TYPE vbap-matnr,
         menge  TYPE vbap-kwmeng,
         status TYPE char1,
         text   TYPE char80,
       END OF ty_prot.

DATA: gt_rueck TYPE STANDARD TABLE OF ty_rueck,
      gs_rueck TYPE ty_rueck,
      gt_prot  TYPE STANDARD TABLE OF ty_prot,
      gt_fcat  TYPE slis_t_fieldcat_alv,
      gs_layo  TYPE slis_layout_alv.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
SELECT-OPTIONS: s_vkorg FOR vbak-vkorg OBLIGATORY,
                s_werks FOR vbap-werks OBLIGATORY,
                s_matnr FOR vbap-matnr.
PARAMETERS:     p_datum TYPE sy-datum OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.
PARAMETERS: p_test AS CHECKBOX DEFAULT 'X'.
