*&---------------------------------------------------------------------*
*& Include ZSD_RET_DISPOSITION_TOP
*&---------------------------------------------------------------------*
TABLES vbak.

TYPES: BEGIN OF ty_ret,
         vbeln  TYPE vbeln_va,
         posnr  TYPE posnr_va,
         augru  TYPE augru,
         kunnr  TYPE kunag,
         matnr  TYPE matnr,
         werks  TYPE werks_d,
         lgort  TYPE lgort_d,
         charg  TYPE charg_d,
         menge  TYPE kwmeng,
         vrkme  TYPE vrkme,
         status TYPE char4,
         mblnr  TYPE mblnr,
         msg    TYPE char80,
       END OF ty_ret,
       tt_ret TYPE STANDARD TABLE OF ty_ret WITH DEFAULT KEY.

CLASS lcl_app DEFINITION DEFERRED.

DATA: gt_ret TYPE tt_ret,
      go_app TYPE REF TO lcl_app.

FIELD-SYMBOLS <gs_ret> TYPE ty_ret.

SELECT-OPTIONS: s_vkorg FOR vbak-vkorg OBLIGATORY,
                s_erdat FOR vbak-erdat,
                s_augru FOR vbak-augru.
