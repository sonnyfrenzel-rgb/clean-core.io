*&---------------------------------------------------------------------*
*& Include ZPP_PLAF_UMSETZEN_TOP
*&---------------------------------------------------------------------*
TABLES plaf.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
PARAMETERS: p_werks TYPE werks_d OBLIGATORY,
            p_auart TYPE aufart  OBLIGATORY DEFAULT 'PP01',
            p_bis   TYPE psttr   OBLIGATORY.
SELECT-OPTIONS: s_dispo FOR plaf-dispo,
                s_matnr FOR plaf-matnr.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
PARAMETERS: p_fix  AS CHECKBOX DEFAULT 'X',
            p_frei AS CHECKBOX.
SELECTION-SCREEN END OF BLOCK b2.

TYPES: BEGIN OF ty_plaf,
         plnum TYPE plnum,
         matnr TYPE matnr,
         plwrk TYPE plwrk,
         gsmng TYPE gsmng,
         psttr TYPE psttr,
         auffx TYPE auffx,
       END OF ty_plaf.

TYPES: BEGIN OF ty_log,
         plnum TYPE plnum,
         matnr TYPE matnr,
         aufnr TYPE aufnr,
         ampel TYPE c LENGTH 1,
         text  TYPE c LENGTH 80,
       END OF ty_log.

DATA: gt_plaf TYPE STANDARD TABLE OF ty_plaf,
      gs_plaf TYPE ty_plaf,
      gt_log  TYPE STANDARD TABLE OF ty_log,
      gv_ok   TYPE abap_bool.

CONSTANTS: gc_rot   TYPE c LENGTH 1 VALUE '1',
           gc_gelb  TYPE c LENGTH 1 VALUE '2',
           gc_gruen TYPE c LENGTH 1 VALUE '3'.
