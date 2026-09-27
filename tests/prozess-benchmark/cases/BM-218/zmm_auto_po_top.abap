*&---------------------------------------------------------------------*
*& Include ZMM_AUTO_PO_TOP
*&---------------------------------------------------------------------*
TABLES eban.

TYPES: BEGIN OF ty_eban,
         banfn TYPE banfn,
         bnfpo TYPE bnfpo,
         matnr TYPE matnr,
         werks TYPE werks_d,
         lgort TYPE lgort_d,
         menge TYPE bamng,
         meins TYPE bamei,
         lfdat TYPE eindt,
         ekgrp TYPE ekgrp,
       END OF ty_eban,
       BEGIN OF ty_src,
         lifnr TYPE elifn,
         ekorg TYPE ekorg,
         konnr TYPE konnr,
         ktpnr TYPE ktpnr,
         infnr TYPE infnr,
         netpr TYPE bprei,
         quelle TYPE char10,
       END OF ty_src.

CLASS lcl_source_determination DEFINITION DEFERRED.
CLASS lcl_po_builder DEFINITION DEFERRED.
CLASS lcx_no_source DEFINITION DEFERRED.

DATA: gt_eban    TYPE STANDARD TABLE OF ty_eban,
      go_det     TYPE REF TO lcl_source_determination,
      go_builder TYPE REF TO lcl_po_builder,
      gx_src     TYPE REF TO lcx_no_source,
      gv_runid   TYPE char14.

FIELD-SYMBOLS <gs_eban> TYPE ty_eban.

SELECT-OPTIONS: s_werks FOR eban-werks OBLIGATORY,
                s_ekgrp FOR eban-ekgrp,
                s_matkl FOR eban-matkl,
                s_lfdat FOR eban-lfdat.
PARAMETERS:     p_test AS CHECKBOX DEFAULT 'X'.
