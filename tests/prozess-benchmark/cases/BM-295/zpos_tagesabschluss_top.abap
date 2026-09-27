*&---------------------------------------------------------------------*
*&  Include           ZPOS_TAGESABSCHLUSS_TOP
*&---------------------------------------------------------------------*
*  Kassen-Tagesabschluss Filiale: Soll aus Vortag + Bons + Einlagen/
*  Entnahmen, Ist aus Zaehlung, Differenz und FI-Buchung.
*
*  Tabellen:  ZPOS_JOURNAL   Bons je Kasse/Tag (aus ZSD_KASSE_BARVERKAUF)
*             ZPOS_BEWEGUNG  Einlagen (E) und Entnahmen (A) je Kasse/Tag
*             ZPOS_ABSCHLUSS Abschluss je Kasse/Tag, Status G = gebucht
*  Dynpro 0100: Grid CC_JOURNAL, Felder GV_IST, GV_GRUND, Anzeige GV_SOLL
*----------------------------------------------------------------------*

CLASS lcx_kasse DEFINITION DEFERRED.
CLASS lcl_buchung DEFINITION DEFERRED.
CLASS lcl_journal_handler DEFINITION DEFERRED.

TYPES: tt_journal TYPE STANDARD TABLE OF zpos_journal WITH DEFAULT KEY,
       tt_bew     TYPE STANDARD TABLE OF zpos_bewegung WITH DEFAULT KEY,
       tt_gl      TYPE STANDARD TABLE OF bapiacgl09 WITH DEFAULT KEY,
       tt_curr    TYPE STANDARD TABLE OF bapiaccr09 WITH DEFAULT KEY.

DATA: ok_code    TYPE sy-ucomm,
      gt_journal TYPE tt_journal,
      gt_bew     TYPE tt_bew,
      gv_anfang  TYPE zpos_betrag,
      gv_bons    TYPE zpos_betrag,
      gv_soll    TYPE zpos_betrag,
      gv_ist     TYPE zpos_betrag,
      gv_diff    TYPE zpos_betrag,
      gv_grund   TYPE char40,
      gv_answer  TYPE c LENGTH 1,
      go_cont    TYPE REF TO cl_gui_custom_container,
      go_grid    TYPE REF TO cl_gui_alv_grid,
      go_hdl     TYPE REF TO lcl_journal_handler,
      gx_kasse   TYPE REF TO lcx_kasse.

CONSTANTS: gc_toleranz   TYPE zpos_betrag VALUE '5.00',
           gc_konto_kasse TYPE hkont VALUE '0000100000',
           gc_konto_diff  TYPE hkont VALUE '0000289000',
           gc_konto_erl   TYPE hkont VALUE '0000800000',
           gc_blart       TYPE blart VALUE 'KA'.

PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY DEFAULT '1000',
            p_kasse TYPE char4 OBLIGATORY,
            p_datum TYPE datum OBLIGATORY DEFAULT sy-datum,
            p_waers TYPE waers DEFAULT 'EUR'.
