*&---------------------------------------------------------------------*
*& Include MZMM_PR_RELEASE_TOP - globale Daten
*&---------------------------------------------------------------------*
TABLES: eban, zmm_s_pr_line.

TYPES: BEGIN OF ty_line,
         mark  TYPE char1,
         banfn TYPE eban-banfn,
         bnfpo TYPE eban-bnfpo,
         matnr TYPE eban-matnr,
         txz01 TYPE eban-txz01,
         menge TYPE eban-menge,
         meins TYPE eban-meins,
         preis TYPE eban-preis,
         peinh TYPE eban-peinh,
         wert  TYPE eban-rlwrt,
         afnam TYPE eban-afnam,
         ernam TYPE eban-ernam,
         frggr TYPE eban-frggr,
         frgst TYPE eban-frgst,
         frgzu TYPE eban-frgzu,
         werks TYPE eban-werks,
       END OF ty_line.

DATA: gt_line   TYPE STANDARD TABLE OF ty_line,
      gs_line   TYPE ty_line,
      gt_codes  TYPE STANDARD TABLE OF zmm_frg_user,
      ok_code   TYPE sy-ucomm,
      gv_ucomm  TYPE sy-ucomm,
      gv_loaded TYPE abap_bool,
      gv_grund  TYPE char80,
      gv_anz_ok TYPE i,
      gv_anz_er TYPE i.

CONTROLS tc_list TYPE TABLEVIEW USING SCREEN 0100.
