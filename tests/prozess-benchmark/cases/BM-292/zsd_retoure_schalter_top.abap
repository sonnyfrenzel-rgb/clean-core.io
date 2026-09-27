*&---------------------------------------------------------------------*
*&  Include           ZSD_RETOURE_SCHALTER_TOP
*&---------------------------------------------------------------------*
*  Retourenannahme am Verkaufsschalter (Transaktion ZRET)
*  Dynpro 0100: Eingabe Fakturanummer GV_VBELN, Rueckgabegrund GV_AUGRU
*----------------------------------------------------------------------*

TYPES: BEGIN OF ty_pos,
         sel   TYPE c LENGTH 1,
         posnr TYPE vbrp-posnr,
         matnr TYPE vbrp-matnr,
         arktx TYPE vbrp-arktx,
         fkimg TYPE vbrp-fkimg,
         vrkme TYPE vbrp-vrkme,
         netwr TYPE vbrp-netwr,
       END OF ty_pos.

DATA: ok_code    TYPE sy-ucomm,
      gv_vbeln   TYPE vbrk-vbeln,
      gv_augru   TYPE augru,
      gs_vbrk    TYPE vbrk,
      gv_rfbsk   TYPE vbuk-rfbsk,
      gt_pos     TYPE STANDARD TABLE OF ty_pos,
      gt_sel     TYPE STANDARD TABLE OF ty_pos,
      gv_retoure TYPE vbeln_va.

CONSTANTS: gc_frist_tage TYPE i VALUE 30,
           gc_auart_re   TYPE auart VALUE 'ZRE'.
