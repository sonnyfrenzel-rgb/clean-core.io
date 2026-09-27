*&---------------------------------------------------------------------*
*&  Include           ZFI_USTVA_TOP
*&---------------------------------------------------------------------*
* Globale Daten Umsatzsteuer-Voranmeldung
TYPE-POOLS: slis, abap.

TABLES: bkpf.

TYPES: BEGIN OF ty_bkpf,
         bukrs TYPE bkpf-bukrs,
         belnr TYPE bkpf-belnr,
         gjahr TYPE bkpf-gjahr,
         budat TYPE bkpf-budat,
         blart TYPE bkpf-blart,
       END OF ty_bkpf.

TYPES: BEGIN OF ty_bset,
         bukrs TYPE bset-bukrs,
         belnr TYPE bset-belnr,
         gjahr TYPE bset-gjahr,
         buzei TYPE bset-buzei,
         mwskz TYPE bset-mwskz,
         shkzg TYPE bset-shkzg,
         hwbas TYPE bset-hwbas,
         hwste TYPE bset-hwste,
         hkont TYPE bset-hkont,
       END OF ty_bset.

* Kennzahl der Voranmeldung - Typ seit 2019 aus der XML-Klasse
TYPES: ty_kz TYPE zcl_fi_ustva_xml=>ty_kz,
       tt_kz TYPE zcl_fi_ustva_xml=>tt_kz.

* Abstimmung Steuerzeilen gegen Steuerkonto
TYPES: BEGIN OF ty_konto,
         hkont       TYPE hkont,
         steuer_bset TYPE p LENGTH 15 DECIMALS 2,
         saldo_hk    TYPE p LENGTH 15 DECIMALS 2,
         differenz   TYPE p LENGTH 15 DECIMALS 2,
       END OF ty_konto.

* Fehler (E) und Warnungen (W) fuer die Liste
TYPES: BEGIN OF ty_meld,
         typ   TYPE c LENGTH 1,
         mwskz TYPE mwskz,
         hkont TYPE hkont,
         text  TYPE c LENGTH 80,
       END OF ty_meld.

TYPES: BEGIN OF ty_alv,
         typ         TYPE c LENGTH 1,
         kennz       TYPE c LENGTH 2,
         art         TYPE c LENGTH 1,
         betrag      TYPE p LENGTH 15 DECIMALS 2,
         betrag_rund TYPE p LENGTH 15 DECIMALS 2,
         mwskz       TYPE mwskz,
         hkont       TYPE hkont,
         text        TYPE c LENGTH 80,
       END OF ty_alv,
       tt_alv TYPE STANDARD TABLE OF ty_alv WITH DEFAULT KEY.

CONSTANTS: gc_land TYPE land1 VALUE 'DE'.

DATA: gt_bkpf  TYPE STANDARD TABLE OF ty_bkpf,
      gt_bset  TYPE STANDARD TABLE OF ty_bset,
      gs_bset  TYPE ty_bset,
      gt_map   TYPE STANDARD TABLE OF zfi_ustva_map,
      gs_map   TYPE zfi_ustva_map,
      gt_kz    TYPE tt_kz,
      gs_kz    TYPE ty_kz,
      gt_konto TYPE STANDARD TABLE OF ty_konto,
      gs_konto TYPE ty_konto,
      gt_meld  TYPE STANDARD TABLE OF ty_meld,
      gs_meld  TYPE ty_meld,
      gt_alv   TYPE tt_alv,
      gt_fcat  TYPE slis_t_fieldcat_alv,
      gs_fcat  TYPE slis_fieldcat_alv.

DATA: gv_von      TYPE sy-datum,
      gv_bis      TYPE sy-datum,
      gv_datei    TYPE string,
      gv_titel    TYPE lvc_title,
      gv_lfdnr    TYPE zfi_ustva_prot-lfdnr,
      gv_zahllast TYPE p LENGTH 15 DECIMALS 2,
      gv_anz_bset TYPE i,
      gv_fehler   TYPE abap_bool,
      gv_warnung  TYPE abap_bool.

* DATA: gt_flat TYPE STANDARD TABLE OF char255.   "Flatfile bis 2019

RANGES: gr_budat FOR bkpf-budat.

* Betrag auf Kennzahl kumulieren (Makro seit 2006 - nicht anfassen)
DEFINE kz_add.
  clear gs_kz.
  gs_kz-kennz  = &1.
  gs_kz-art    = &2.
  gs_kz-betrag = &3.
  collect gs_kz into gt_kz.
END-OF-DEFINITION.

* Feldkatalog-Zeile
DEFINE fcat.
  clear gs_fcat.
  gs_fcat-fieldname = &1.
  gs_fcat-seltext_m = &2.
  gs_fcat-outputlen = &3.
  append gs_fcat to gt_fcat.
END-OF-DEFINITION.
