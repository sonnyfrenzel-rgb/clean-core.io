*&---------------------------------------------------------------------*
*&  Include           ZQM_PM_PFLEGE_TOP
*&---------------------------------------------------------------------*
*  Pruefmittelstamm (Messschieber, Lehren, Drehmomentschluessel) mit
*  Kalibrierintervall. Tabelle ZQM_PRUEFMITTEL, Aenderungsbelegobjekt
*  ZQM_PM (SCDO, Tabelle mit Protokollkennzeichen), Sperrobjekt EZQM_PM.
*
*  Dynpro 0100  Liste (Table Control TC_PM)  Funktionen NEU AEND LOESCH
*               KALIB SAVE BACK
*  Dynpro 0200  Detail (modal, CALL SCREEN aus 0100)
*    PAI  MODULE exit_0200 AT EXIT-COMMAND, MODULE user_command_0200
*         (Intervallpruefung 1..730 Tage macht die Domaene ZQM_INTERVALL,
*          das Modul CHECK_INTERVALL wurde 2022 entfernt)
*  Aenderungen werden gesammelt und erst mit SAVE geschrieben.
*----------------------------------------------------------------------*

TYPES: tt_pm TYPE STANDARD TABLE OF zqm_pruefmittel WITH DEFAULT KEY.

INTERFACE lif_db_aktion DEFERRED.
CLASS lcx_pflege DEFINITION DEFERRED.
CLASS lcl_kalib DEFINITION DEFERRED.

CONTROLS tc_pm TYPE TABLEVIEW USING SCREEN 0100.

DATA: ok_code     TYPE sy-ucomm,
      gv_ok       TYPE sy-ucomm,
      gv_modus    TYPE c LENGTH 1,            "I = neu, U = aendern
      gv_answer   TYPE c LENGTH 1,
      gt_pm       TYPE tt_pm,
      gs_pm       TYPE zqm_pruefmittel,
      gs_pm_alt   TYPE zqm_pruefmittel,
      gv_idx      TYPE i,
      gt_aktionen TYPE STANDARD TABLE OF REF TO lif_db_aktion WITH EMPTY KEY,
      go_kalib    TYPE REF TO lcl_kalib,
      gx_pflege   TYPE REF TO lcx_pflege.

CONSTANTS: gc_status_frei     TYPE c LENGTH 1 VALUE 'F',
           gc_status_gesperrt TYPE c LENGTH 1 VALUE 'G',
           gc_pm_dest         TYPE rfcdest VALUE 'PM_PRD_CLNT100'.

PARAMETERS p_werk TYPE werks_d OBLIGATORY.
