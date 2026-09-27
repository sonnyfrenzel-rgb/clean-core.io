*&---------------------------------------------------------------------*
*&  Include  ZSD_INV_EXPORT_TOP
*&---------------------------------------------------------------------*
TABLES vbrk.

DATA: gt_vbrk  TYPE STANDARD TABLE OF vbrk,
      gs_vbrk  TYPE vbrk,
      gv_file  TYPE string,
      gv_last  TYPE vbeln_vf,
      gv_mode  TYPE c LENGTH 1,          "N = neu, A = anhaengen (Restart)
      gv_count TYPE i.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
PARAMETERS:     p_runid  TYPE char20 OBLIGATORY.
SELECT-OPTIONS: s_fkdat  FOR vbrk-fkdat OBLIGATORY,
                s_vkorg  FOR vbrk-vkorg.
PARAMETERS:     p_path   TYPE string LOWER CASE DEFAULT '/interface/sd/out/',
                p_commit TYPE i DEFAULT 100,
                p_restrt AS CHECKBOX.
SELECTION-SCREEN END OF BLOCK b1.
