*&---------------------------------------------------------------------*
*&  Include           ZPP_LEITSTAND_TOP
*&---------------------------------------------------------------------*
*  Mini-Leitstand Fertigung: oben Arbeitsplaetze mit Belastungsampel,
*  unten offene Vorgaenge des gewaehlten Arbeitsplatzes. Aktionen am
*  Vorgang: vorziehen (1 Tag), Auftrag freigeben, Arbeitspapiere drucken.
*
*  Dynpro 0100: Custom Control CC_LEIT, darin Splitter (2 Zeilen)
*----------------------------------------------------------------------*

TYPES: BEGIN OF ty_arbpl,
         objid     TYPE cr_objid,
         arbpl     TYPE arbpl,
         kapazitaet TYPE p LENGTH 9 DECIMALS 2,   "Std je Horizont
         last      TYPE p LENGTH 9 DECIMALS 2,
         ampel     TYPE c LENGTH 4,
       END OF ty_arbpl,
       BEGIN OF ty_vorg,
         aufnr TYPE aufnr,
         vornr TYPE vornr,
         ltxa1 TYPE ltxa1,
         arbid TYPE cr_objid,
         objnr TYPE j_objnr,
         fsavd TYPE fsavd,
         fsedd TYPE fsedd,
         vgw02 TYPE vgwrt,
         werks TYPE werks_d,
       END OF ty_vorg,
       tt_arbpl TYPE STANDARD TABLE OF ty_arbpl WITH DEFAULT KEY,
       tt_vorg  TYPE STANDARD TABLE OF ty_vorg WITH DEFAULT KEY.

CLASS lcx_leit DEFINITION DEFERRED.
CLASS lcl_ui DEFINITION DEFERRED.

DATA: ok_code    TYPE sy-ucomm,
      gt_arbpl   TYPE tt_arbpl,
      gt_vorg    TYPE tt_vorg,
      gt_anzeige TYPE tt_vorg,
      go_cont    TYPE REF TO cl_gui_custom_container,
      go_split   TYPE REF TO cl_gui_splitter_container,
      go_grid_ap TYPE REF TO cl_gui_alv_grid,
      go_grid_vg TYPE REF TO cl_gui_alv_grid,
      go_ui      TYPE REF TO lcl_ui.

CONSTANTS: gc_stat_rueck TYPE j_status VALUE 'I0009',   "RUCK rueckgemeldet
           gc_std_tag    TYPE p LENGTH 3 DECIMALS 1 VALUE '16.0'.

PARAMETERS: p_werks TYPE werks_d OBLIGATORY,
            p_veran TYPE ap_veran OBLIGATORY,           "Verantwortlicher Meister
            p_tage  TYPE i DEFAULT 5.
