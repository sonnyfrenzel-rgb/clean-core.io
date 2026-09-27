*&---------------------------------------------------------------------*
*& Include ZOM_REORG_UPLOAD_TOP
*&---------------------------------------------------------------------*
PARAMETERS: p_file   TYPE string LOWER CASE OBLIGATORY,
            p_begda  TYPE begda DEFAULT sy-datum OBLIGATORY,
            p_strict AS CHECKBOX DEFAULT 'X',
            p_test   AS CHECKBOX DEFAULT 'X'.

CONSTANTS: gc_plvar TYPE plvar VALUE '01',
           gc_endda TYPE endda VALUE '99991231'.

TYPES: BEGIN OF ty_line,
         lineno TYPE i,
         action TYPE char4,
         objid  TYPE hrobjid,
         parent TYPE hrobjid,
         short  TYPE short_d,
         stext  TYPE stext,
         error  TYPE abap_bool,
       END OF ty_line,
       BEGIN OF ty_prot,
         lineno TYPE i,
         type   TYPE symsgty,
         text   TYPE string,
       END OF ty_prot.

DATA: gt_raw    TYPE STANDARD TABLE OF string,
      gt_lines  TYPE STANDARD TABLE OF ty_line,
      gt_prot   TYPE STANDARD TABLE OF ty_prot,
      gt_bdc    TYPE STANDARD TABLE OF bdcdata,
      gv_errors TYPE i.
