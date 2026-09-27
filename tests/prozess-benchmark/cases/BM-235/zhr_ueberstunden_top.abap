*&---------------------------------------------------------------------*
*&  Include           ZHR_UEBERSTUNDEN_TOP
*&---------------------------------------------------------------------*
TABLES: catsdb.

TYPES: BEGIN OF ty_summe,
         pernr   TYPE persno,
         awart   TYPE awart,
         stunden TYPE catshours,
       END OF ty_summe.

TYPES: BEGIN OF ty_prot,
         pernr TYPE persno,
         awart TYPE awart,
         typ   TYPE symsgty,
         text  TYPE char80,
       END OF ty_prot.

DATA: gt_summe  TYPE STANDARD TABLE OF ty_summe,
      gs_summe  TYPE ty_summe,
      gt_prot   TYPE STANDARD TABLE OF ty_prot,
      gv_begda  TYPE begda,
      gv_endda  TYPE endda,
      gv_fehler TYPE i.

* Konstanten
CONSTANTS: gc_status_genehmigt TYPE catsstatus VALUE '30',
           gc_infty_2010       TYPE infty      VALUE '2010'.
