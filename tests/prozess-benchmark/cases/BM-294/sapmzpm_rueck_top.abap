*&---------------------------------------------------------------------*
*& Modulpool   SAPMZPM_RUECK   (Transaktion ZIW41 - Werkstattrueckmeldung)
*& Include     SAPMZPM_RUECK_TOP
*&---------------------------------------------------------------------*
*& Instandhaltungsauftrag rueckmelden: Arbeitszeit je Vorgang und
*& Materialentnahme der Reservierungen in einem Bild.
*&
*& Dynpro 0100  Kopf (GV_AUFNR) + Tabstrip TS_RUECK, Subscreen-Bereich SUB
*&   PBO  STATUS_0100, SUBSCREEN_0100
*&   PAI  EXIT_0100 AT EXIT-COMMAND, USER_COMMAND_0100
*& Dynpro 0110  Subscreen Vorgaenge, Table Control TC_VORG
*&   PAI  LOOP AT gt_vorg -> MODULE tc_vorg_modify ON CHAIN-REQUEST
*& Dynpro 0120  Subscreen Komponenten, Custom Control CC_KOMP
*&   PBO  GRID_0120
*&---------------------------------------------------------------------*
*& 2009-01-19 MHO  Ersterstellung (Ersatz IW41 + MB1A in Werkstatt 4)
*& 2013-06-03 MHO  Komponenten als ALV-Grid statt Table Control
*& 2016-11-28 GBR  Sperre auf Auftrag, Berechtigung Planungswerk
*& 2020-09-07 EXT  Warenausgang per BAPI statt CALL TRANSACTION MB1A
*&---------------------------------------------------------------------*
PROGRAM sapmzpm_rueck MESSAGE-ID zpm_rm.

TYPES: BEGIN OF ty_vorg,
         vornr     TYPE vornr,
         ltxa1     TYPE ltxa1,
         arbei     TYPE arbeit,
         ismnw     TYPE ismnw,
         arbeh     TYPE arbeiteinh,
         ismnw_neu TYPE ismnw,
         endrm     TYPE c LENGTH 1,
       END OF ty_vorg,
       BEGIN OF ty_komp,
         rsnum     TYPE rsnum,
         rspos     TYPE rspos,
         matnr     TYPE matnr,
         werks     TYPE werks_d,
         lgort     TYPE lgort_d,
         bdmng     TYPE bdmng,
         enmng     TYPE enmng,
         meins     TYPE meins,
         menge_neu TYPE erfmg,
       END OF ty_komp.

CONTROLS: ts_rueck TYPE TABSTRIP,
          tc_vorg  TYPE TABLEVIEW USING SCREEN 0110.

CLASS lcl_komp_handler DEFINITION DEFERRED.

DATA: ok_code      TYPE sy-ucomm,
      gv_ok        TYPE sy-ucomm,
      gv_aufnr     TYPE aufnr,
      gv_aufnr_alt TYPE aufnr,
      gs_aufk      TYPE aufk,
      gt_vorg      TYPE STANDARD TABLE OF ty_vorg,
      gs_vorg      TYPE ty_vorg,
      gt_komp      TYPE STANDARD TABLE OF ty_komp,
      gv_dynnr     TYPE sy-dynnr VALUE '0110',
      gv_changed   TYPE abap_bool,
      gv_answer    TYPE c LENGTH 1,
      gt_protokoll TYPE STANDARD TABLE OF bapi_msg,
      go_cont      TYPE REF TO cl_gui_custom_container,
      go_grid      TYPE REF TO cl_gui_alv_grid,
      go_handler   TYPE REF TO lcl_komp_handler.

CONSTANTS: gc_bwart_ent TYPE bwart VALUE '261',
           gc_stat_frei TYPE j_status VALUE 'I0002'.
