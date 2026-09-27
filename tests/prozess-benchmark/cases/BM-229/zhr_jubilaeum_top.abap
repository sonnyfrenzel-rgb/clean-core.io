*&---------------------------------------------------------------------*
*&  Include           ZHR_JUBILAEUM_TOP
*&---------------------------------------------------------------------*
TABLES: pa0001.

TYPES: BEGIN OF ty_ma,
         pernr TYPE persno,
         ename TYPE emnam,
         werks TYPE persa,
       END OF ty_ma.

TYPES: BEGIN OF ty_out,
         pernr    TYPE persno,
         ename    TYPE emnam,
         werks    TYPE persa,
         eintritt TYPE datum,
         jahre    TYPE i,
         stufe    TYPE char2,
         betrag   TYPE betrg,
       END OF ty_out.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME.
SELECT-OPTIONS: s_werks FOR pa0001-werks,
                s_pernr FOR pa0001-pernr.
PARAMETERS:     p_monat TYPE spmon OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

DATA: gt_ma  TYPE STANDARD TABLE OF ty_ma,
      gs_ma  TYPE ty_ma,
      gt_out TYPE STANDARD TABLE OF ty_out.

* alte Variante mit Mail an Vorgesetzte - nicht mehr benutzt
*DATA: gt_mail TYPE STANDARD TABLE OF solisti1.
