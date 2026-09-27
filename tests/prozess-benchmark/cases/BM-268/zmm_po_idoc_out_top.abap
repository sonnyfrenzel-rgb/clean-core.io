*&---------------------------------------------------------------------*
*&  Include  ZMM_PO_IDOC_OUT_TOP
*&---------------------------------------------------------------------*
TABLES: ekko.

TYPES: BEGIN OF ty_result,
         ebeln  TYPE ebeln,
         lifnr  TYPE lifnr,
         docnum TYPE edi_docnum,
         status TYPE c LENGTH 40,
       END OF ty_result.

DATA: gt_ekko       TYPE STANDARD TABLE OF ekko,
      gs_ekko       TYPE ekko,
      gt_ekpo       TYPE STANDARD TABLE OF ekpo,
      gt_result     TYPE STANDARD TABLE OF ty_result,
      gs_result     TYPE ty_result,
      gv_from       TYPE sy-datum,
      gv_partner_ok TYPE abap_bool.

CONSTANTS: gc_mestyp TYPE edi_mestyp VALUE 'ZPORDERS',
           gc_idoctp TYPE edi_idoctp VALUE 'ZPORDERS01'.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
SELECT-OPTIONS: s_bsart FOR ekko-bsart DEFAULT 'NB',
                s_lifnr FOR ekko-lifnr,
                s_ekorg FOR ekko-ekorg.
PARAMETERS:     p_test  AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b1.
