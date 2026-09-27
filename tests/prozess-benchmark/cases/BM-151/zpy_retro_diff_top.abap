*&---------------------------------------------------------------------*
*& Include ZPY_RETRO_DIFF_TOP  - Datendeklarationen / Selektionsbild
*&---------------------------------------------------------------------*
NODES: peras.
TABLES: t512w.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
PARAMETERS: p_inpyr TYPE pabrj OBLIGATORY,
            p_inpp  TYPE pabrp OBLIGATORY,
            p_min   TYPE maxbt DEFAULT '1.00'.
SELECT-OPTIONS s_lgart FOR t512w-lgart.
SELECTION-SCREEN END OF BLOCK b1.

TYPES: BEGIN OF ty_diff,
         pernr TYPE pernr_d,
         fpper TYPE fpper,
         lgart TYPE lgart,
         old   TYPE maxbt,
         new   TYPE maxbt,
         diff  TYPE maxbt,
       END OF ty_diff,
       BEGIN OF ty_sum,
         pernr TYPE pernr_d,
         diff  TYPE maxbt,
         count TYPE i,
       END OF ty_sum.

DATA: gt_rgdir   TYPE STANDARD TABLE OF pc261,
      gt_diff    TYPE STANDARD TABLE OF ty_diff,
      gt_sum     TYPE STANDARD TABLE OF ty_sum,
      gv_inper   TYPE iperi,
      gv_molga   TYPE molga,
      gv_ok      TYPE abap_bool,
      gv_errors  TYPE i,
      gv_total   TYPE maxbt,
      gv_title   TYPE lvc_title.
