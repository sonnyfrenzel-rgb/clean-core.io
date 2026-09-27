*&---------------------------------------------------------------------*
*& Include ZSD_MASS_VA02_TOP - Daten, Konstanten, Makros, Selektionsbild
*&---------------------------------------------------------------------*
TYPE-POOLS: icon.

TYPES: BEGIN OF ty_upload,
         vbeln TYPE vbeln_va,
         posnr TYPE posnr_va,
         feld  TYPE char10,
         wert  TYPE char30,
       END OF ty_upload,
       BEGIN OF ty_result,
         zeile TYPE i,
         vbeln TYPE vbeln_va,
         posnr TYPE posnr_va,
         feld  TYPE char10,
         wert  TYPE char30,
         ampel TYPE icon_d,
         text  TYPE bapi_msg,
       END OF ty_result.

DATA: gt_upload  TYPE STANDARD TABLE OF ty_upload,
      gt_result  TYPE STANDARD TABLE OF ty_result,
      gt_bdcdata TYPE STANDARD TABLE OF bdcdata,
      gt_bdcmsg  TYPE STANDARD TABLE OF bdcmsgcoll,
      gv_log     TYPE balloghndl,
      gv_ok      TYPE i,
      gv_err     TYPE i.

CONSTANTS: gc_menge TYPE char10 VALUE 'MENGE',
           gc_lifsk TYPE char10 VALUE 'LIFSK',
           gc_abgru TYPE char10 VALUE 'ABGRU',
           gc_edatu TYPE char10 VALUE 'EDATU'.

*----------------------------------------------------------------------*
* Batch-Input-Makros
*----------------------------------------------------------------------*
DEFINE bdc_dynpro.
  APPEND VALUE #( program = &1 dynpro = &2 dynbegin = 'X' ) TO gt_bdcdata.
END-OF-DEFINITION.

DEFINE bdc_field.
  APPEND VALUE #( fnam = &1 fval = &2 ) TO gt_bdcdata.
END-OF-DEFINITION.

*----------------------------------------------------------------------*
* Selektionsbild
*----------------------------------------------------------------------*
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-b01.
PARAMETERS: p_file TYPE rlgrap-filename LOWER CASE OBLIGATORY,
            p_appl AS CHECKBOX.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-b02.
PARAMETERS: p_mode TYPE ctu_mode DEFAULT 'N',
            p_test AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b2.
