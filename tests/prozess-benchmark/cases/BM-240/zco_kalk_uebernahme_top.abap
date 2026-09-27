*&---------------------------------------------------------------------*
*&  Include           ZCO_KALK_UEBERNAHME_TOP
*&---------------------------------------------------------------------*
*----------------------------------------------------------------------*
* ZCO_KALK_FRG  Protokoll der uebernommenen Kalkulationen
*   KALNR, KADKY  Schluessel der Kalkulation
*   MATNR, WERKS  Material / Bewertungskreis
*   PREIS         uebernommener Preis je Basismengeneinheit
*   UNAME, DATUM  wer / wann
* Die Tabelle wird von ZCL_CO_KALK_REGEL gegen Doppeluebernahme
* gelesen und von der Kostenrechnung per SE16 ausgewertet.
*----------------------------------------------------------------------*
TABLES: keko.

TYPES: BEGIN OF ty_prot,
         matnr   TYPE matnr,
         werks   TYPE werks_d,
         kalnr   TYPE ck_kalnr,
         schwere TYPE symsgty,
         text    TYPE string,
       END OF ty_prot.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE text-b01.
SELECT-OPTIONS: s_werks FOR keko-werks OBLIGATORY,
                s_matnr FOR keko-matnr.
PARAMETERS:     p_klvar TYPE ck_klvar OBLIGATORY DEFAULT 'PPC1',
                p_kadky TYPE ck_kadky OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE text-b02.
PARAMETERS:     p_proz  TYPE p LENGTH 5 DECIMALS 2 DEFAULT '5.00',
                p_test  AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b2.

DATA: gt_keko      TYPE STANDARD TABLE OF keko,
      gs_keko      TYPE keko,
      gt_prot      TYPE STANDARD TABLE OF ty_prot,
      go_regel     TYPE REF TO zcl_co_kalk_regel,
      gx_kalk      TYPE REF TO zcx_co_kalk,
      gv_abgelehnt TYPE i.
