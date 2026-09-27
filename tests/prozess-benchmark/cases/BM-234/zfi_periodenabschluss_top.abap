*&---------------------------------------------------------------------*
*&  Include           ZFI_PERIODENABSCHLUSS_TOP
*&---------------------------------------------------------------------*
TYPE-POOLS: abap.

TYPES: BEGIN OF ty_saldo,
         shkzg TYPE shkzg,
         dmbtr TYPE dmbtr,
       END OF ty_saldo.

CONSTANTS: gc_balobj TYPE balobj_d  VALUE 'ZFI',
           gc_balsub TYPE balsubobj VALUE 'ABSCHLUSS'.

DATA: gv_opvar      TYPE opvar,
      gv_von        TYPE budat,
      gv_bis        TYPE budat,
      gv_fehler     TYPE i,
      gv_warnung    TYPE i,
      gv_log_handle TYPE balloghndl.

* alte Listenausgabe (vor 2013)
*DATA: gt_liste TYPE STANDARD TABLE OF zfi_pa_liste.

*----------------------------------------------------------------------*
* Textsymbole
*   B01  Buchungskreis / Periode
*   B02  Pruefungen
*   B03  Ablauf
* Nachrichtenklasse ZFI_PA
*   001  Buchungskreis & ohne Periodenvariante
*   003  Keine Berechtigung fuer die Periodensteuerung
*   010  Anwendungslog konnte nicht angelegt werden
*----------------------------------------------------------------------*

* Kontoarten der Periodensteuerung (nur Doku, Selektion ueber alle)
*   +  gueltig fuer alle Kontoarten
*   A  Anlagen      D  Debitoren     K  Kreditoren
*   M  Material     S  Sachkonten
