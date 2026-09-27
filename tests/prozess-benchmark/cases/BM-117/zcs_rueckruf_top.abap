*----------------------------------------------------------------------*
* Include ZCS_RUECKRUF_TOP - Datendeklarationen und Selektionsbild
*----------------------------------------------------------------------*
TABLES: objk, ser01, lips.

TYPES: BEGIN OF ty_ser,
         sernr   TYPE objk-sernr,
         matnr   TYPE objk-matnr,
         equnr   TYPE objk-equnr,
         lief_nr TYPE ser01-lief_nr,
         posnr   TYPE ser01-posnr,
         datum   TYPE ser01-datum,
         kunnr   TYPE likp-kunnr,
         land1   TYPE kna1-land1,
       END OF ty_ser,
       tt_ser TYPE STANDARD TABLE OF ty_ser WITH DEFAULT KEY.

DATA: gt_ser   TYPE tt_ser,
      gs_hdr   TYPE zcs_rr_hdr,
      gv_rrnr  TYPE zcs_rr_hdr-rrnr,
      gv_text  TYPE string.

*----------------------------------------------------------------------*
* Selektionsbild
*----------------------------------------------------------------------*
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
PARAMETERS:     p_rrnr  TYPE zcs_rr_hdr-rrnr OBLIGATORY,
                p_grund TYPE zcs_rr_hdr-grund OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
PARAMETERS:     p_matnr TYPE objk-matnr OBLIGATORY.
SELECT-OPTIONS: s_sernr FOR objk-sernr,
                s_charg FOR lips-charg,
                s_datum FOR ser01-datum.
SELECTION-SCREEN END OF BLOCK b2.

SELECTION-SCREEN BEGIN OF BLOCK b3 WITH FRAME TITLE TEXT-003.
PARAMETERS:     p_test AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b3.
