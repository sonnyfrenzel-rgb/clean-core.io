FUNCTION-POOL zsd_edi_ord MESSAGE-ID zsd.
*----------------------------------------------------------------------*
* Funktionsgruppe ZSD_EDI_ORD - Eingang Kundenbestellungen (ORDERS05)
* Vorgangscode ZORD, Partnervereinbarung je Händler (WE20)
*----------------------------------------------------------------------*
INCLUDE mbdconwf.                     "Konstanten c_wf_result_*

TYPES: BEGIN OF ty_head,
         bsart  TYPE edi_bsart,
         curcy  TYPE waers,
         bstkd  TYPE bstkd,
         bstdk  TYPE bstdk,
         partn  TYPE edi_partn,       "Auftraggeber lt. Händler (GLN)
         kunnr  TYPE kunnr,
         vkorg  TYPE vkorg,
         vtweg  TYPE vtweg,
         spart  TYPE spart,
         auart  TYPE auart,
       END OF ty_head,
       BEGIN OF ty_item,
         posex  TYPE posex,
         menge  TYPE kwmeng,
         menee  TYPE vrkme,
         kdmat  TYPE matnr_ku,
         lfmat  TYPE char35,
         matnr  TYPE matnr,
       END OF ty_item.

DATA: gs_edidc  TYPE edidc,
      gs_head   TYPE ty_head,
      gt_items  TYPE STANDARD TABLE OF ty_item,
      gv_error  TYPE abap_bool,
      gv_msg    TYPE string,
      gv_vbeln  TYPE vbeln_va,
      gv_anyerr TYPE abap_bool.
