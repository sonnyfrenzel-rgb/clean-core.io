*&---------------------------------------------------------------------*
*& Include ZPT_OT_APPROVAL_TOP
*&---------------------------------------------------------------------*
TABLES: pa0001.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
SELECT-OPTIONS: s_pernr FOR pa0001-pernr,
                s_orgeh FOR pa0001-orgeh.
PARAMETERS: p_pabrj TYPE pabrj OBLIGATORY,
            p_pabrp TYPE pabrp OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

CONSTANTS: gc_ztart_ot TYPE pt_ztart VALUE '9040',  "Ueberstd. ungenehmigt
           gc_ztart_pay TYPE pt_ztart VALUE 'ZUEB', "Umbuchung Auszahlung
           gc_open     TYPE char10 VALUE 'OFFEN',
           gc_approved TYPE char10 VALUE 'FREIGEG',
           gc_rejected TYPE char10 VALUE 'ABGELEHNT'.

TYPES: BEGIN OF ty_emp,
         pernr TYPE pernr_d,
         persk TYPE persk,
         orgeh TYPE orgeh,
       END OF ty_emp,
       BEGIN OF ty_out,
         sel    TYPE xfeld,
         pernr  TYPE pernr_d,
         orgeh  TYPE orgeh,
         hours  TYPE ptm_quonum,
         limit  TYPE ptm_quonum,
         excess TYPE ptm_quonum,
         status TYPE char10,
       END OF ty_out.

DATA: gt_emp    TYPE STANDARD TABLE OF ty_emp,
      gt_out    TYPE STANDARD TABLE OF ty_out,
      gt_limit  TYPE STANDARD TABLE OF zpt_ot_limit,
      gv_date   TYPE sy-datum,
      gv_begda  TYPE begda,
      gv_endda  TYPE endda,
      gv_errors TYPE i.
