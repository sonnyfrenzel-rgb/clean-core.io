*&---------------------------------------------------------------------*
*& Include ZSD_CREDIT_RELEASE_TOP
*&---------------------------------------------------------------------*
TYPES: BEGIN OF ty_disp,
         vbeln   TYPE vbeln_va,
         kunnr   TYPE kunnr,
         netwr   TYPE netwr_ak,
         waerk   TYPE waerk,
         klimk   TYPE klimk,
         expos   TYPE netwr,
         blocked TYPE netwr,
         free    TYPE netwr,
         state   TYPE char10,
         ampel   TYPE char1,                         " 1 rot, 2 gelb, 3 gruen
       END OF ty_disp.

CONSTANTS: gc_kkber      TYPE kkber VALUE '1000',
           gc_rej_block  TYPE lifsk VALUE 'ZK'.      " Liefersperre Kredit abgelehnt

CLASS lcl_credit_case DEFINITION DEFERRED.
CLASS lcx_credit DEFINITION DEFERRED.

DATA: gv_okcode TYPE sy-ucomm,
      gv_vbeln  TYPE vbeln_va,                     " Dynprofeld 0100
      gv_reason TYPE char60,                       " Dynprofeld 0200 (Begruendung)
      gs_disp   TYPE ty_disp,                      " Dynprofelder 0200
      go_case   TYPE REF TO lcl_credit_case,
      gx_credit TYPE REF TO lcx_credit,
      gt_work   TYPE STANDARD TABLE OF vbeln_va.     " Arbeitsvorrat

PARAMETERS p_vkorg TYPE vkorg OBLIGATORY DEFAULT '1000'.
