*----------------------------------------------------------------------*
* Include ZCS_ZAEHLER_FAKTURA_TOP - Daten und Selektionsbild
*----------------------------------------------------------------------*
TABLES: vbak, veda.

TYPES: BEGIN OF ty_ctr,
         vbeln  TYPE vbak-vbeln,
         posnr  TYPE vbap-posnr,
         kunnr  TYPE vbak-kunnr,
         vkorg  TYPE vbak-vkorg,
         vtweg  TYPE vbak-vtweg,
         spart  TYPE vbak-spart,
         knumv  TYPE vbak-knumv,
         matnr  TYPE vbap-matnr,
         zzfrei TYPE vbap-zzfrei,            "Freimenge je Periode
       END OF ty_ctr,

       BEGIN OF ty_obj,
         vbeln TYPE vbak-vbeln,
         posnr TYPE vbap-posnr,
         equnr TYPE equi-equnr,
         menge TYPE f,                       "Verbrauch in der Periode
       END OF ty_obj,

       BEGIN OF ty_bill,
         vbeln  TYPE vbak-vbeln,
         posnr  TYPE vbap-posnr,
         kunnr  TYPE vbak-kunnr,
         matnr  TYPE vbap-matnr,
         menge  TYPE p LENGTH 13 DECIMALS 3,
         frei   TYPE p LENGTH 13 DECIMALS 3,
         abrech TYPE p LENGTH 13 DECIMALS 3,
         preis  TYPE p LENGTH 11 DECIMALS 4,
         betrag TYPE p LENGTH 15 DECIMALS 2,
         waerk  TYPE konv-waers,
       END OF ty_bill.

DATA: gt_ctr  TYPE STANDARD TABLE OF ty_ctr,
      gt_obj  TYPE STANDARD TABLE OF ty_obj,
      gt_bill TYPE STANDARD TABLE OF ty_bill,
      gt_konv TYPE SORTED TABLE OF konv WITH NON-UNIQUE KEY knumv kposn,
      gs_bill TYPE ty_bill.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
SELECT-OPTIONS: s_vkorg FOR vbak-vkorg OBLIGATORY,
                s_vbeln FOR vbak-vbeln,
                s_kunnr FOR vbak-kunnr.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
PARAMETERS: p_von TYPE datum OBLIGATORY,
            p_bis TYPE datum OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b2.
