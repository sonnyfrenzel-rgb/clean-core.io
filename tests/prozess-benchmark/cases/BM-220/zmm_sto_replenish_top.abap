*&---------------------------------------------------------------------*
*& Include ZMM_STO_REPLENISH_TOP
*&---------------------------------------------------------------------*
TABLES marc.

TYPES: BEGIN OF ty_need,
         werks TYPE werks_d,
         matnr TYPE matnr,
         menge TYPE menge_d,
         meins TYPE meins,
       END OF ty_need,
       tt_need TYPE STANDARD TABLE OF ty_need WITH DEFAULT KEY,
       BEGIN OF ty_sto,
         ebeln TYPE ebeln,
         werks TYPE werks_d,
       END OF ty_sto.

CLASS lcl_task_manager DEFINITION DEFERRED.
CLASS lcl_delivery_creator DEFINITION DEFERRED.
CLASS lcx_sto DEFINITION DEFERRED.

DATA: gt_need     TYPE tt_need,
      gt_items    TYPE zmm_sto_item_t,                 " DDIC-Tabellentyp (RFC)
      gv_ewm_dest TYPE rfcdest,
      go_tasks    TYPE REF TO lcl_task_manager,
      go_deliv    TYPE REF TO lcl_delivery_creator,
      gx_sto      TYPE REF TO lcx_sto,
      gv_deliv    TYPE i,
      gv_retry    TYPE i.

SELECT-OPTIONS: s_werks FOR marc-werks OBLIGATORY.        " Filialwerke
PARAMETERS:     p_supply TYPE reswk OBLIGATORY DEFAULT '1000',   " Zentrallager
                p_lgnum  TYPE lgnum OBLIGATORY DEFAULT 'ZL1'.
