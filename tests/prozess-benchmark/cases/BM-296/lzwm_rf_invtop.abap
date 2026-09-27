FUNCTION-POOL zwm_rf_inv MESSAGE-ID zwm_i.
*&---------------------------------------------------------------------*
*& Funktionsgruppe ZWM_RF_INV - Inventurzaehlung per Handscanner
*&---------------------------------------------------------------------*
*& Dynpros (8 x 20 Zeichen, RF-Geraete):
*&   0100  Lagerplatz scannen     PBO STATUS_RF  PAI USER_COMMAND_0100
*&   0200  Material/Menge scannen PBO STATUS_RF  PAI USER_COMMAND_0200
*&   0300  Uebersicht (TC_UEB)    PBO STATUS_RF  PAI USER_COMMAND_0300
*& Funktionstasten: F3 zurueck, F4 fertig, ENTR, SAVE
*&---------------------------------------------------------------------*
*& 2010-10-11 HBE  Ersterstellung Lager 120 (Stichtagsinventur)
*& 2014-09-29 HBE  Fremdmaterial mit Rueckfrage
*& 2019-12-02 EXT  Umbau auf Klasse LCL_ZAEHLUNG, Nachzaehlhinweis
*& 2021-02-15 EXT  Leerplatz-Funktion (Taste LEER auf 0200)
*&---------------------------------------------------------------------*
*& Ablauf fuer den Staplerfahrer:
*&   1. Lagerplatz scannen -> Platz muss im aktiven Inventurbeleg stehen
*&      und darf noch nicht gezaehlt sein; Platz wird gesperrt.
*&   2. Je Quant Material, Charge, Menge scannen. Unerwartetes Material
*&      nur nach Rueckfrage (Fremdmaterial).
*&   3. F4 -> Uebersicht, SAVE bucht die Zaehlung. Weicht eine Position
*&      mehr als 2 % ab, kommt ein Hinweis (Nachzaehlung empfohlen).
*&   F3 auf 0200 verwirft die Zaehlung des Platzes und entsperrt ihn.
*&---------------------------------------------------------------------*
*& Bekannt: Abbruch per Home-Taste des Geraets laesst die Sperre stehen
*&          (SM12 durch Schichtleiter), Ticket 3321 - nicht umgesetzt.
*&---------------------------------------------------------------------*

TYPES: BEGIN OF ty_zaehl,
         lqnum TYPE lvs_lqnum,
         matnr TYPE matnr,
         charg TYPE charg_d,
         soll  TYPE lvs_gesme,
         menge TYPE lvs_gesme,
         meins TYPE meins,
         fremd TYPE abap_bool,
       END OF ty_zaehl,
       tt_zaehl TYPE STANDARD TABLE OF ty_zaehl WITH DEFAULT KEY.

CLASS lcx_rf_inv DEFINITION DEFERRED.
CLASS lcl_zaehlung DEFINITION DEFERRED.

CONTROLS tc_ueb TYPE TABLEVIEW USING SCREEN 0300.

DATA: ok_code  TYPE sy-ucomm,
      gv_lgnum TYPE lgnum,
      gv_lgpla TYPE lgpla,
      gv_matnr TYPE matnr,
      gv_charg TYPE charg_d,
      gv_menge TYPE lvs_gesme,
      gv_answer TYPE c LENGTH 1,
      gs_ueb   TYPE ty_zaehl,
      go_zaehl TYPE REF TO lcl_zaehlung,
      gx_inv   TYPE REF TO lcx_rf_inv.

CONSTANTS gc_toleranz_proz TYPE p LENGTH 5 DECIMALS 2 VALUE '2.00'.
