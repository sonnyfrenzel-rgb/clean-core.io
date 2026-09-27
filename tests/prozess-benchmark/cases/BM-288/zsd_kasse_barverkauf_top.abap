*&---------------------------------------------------------------------*
*&  Include           ZSD_KASSE_BARVERKAUF_TOP
*&---------------------------------------------------------------------*
*  Globale Daten Barverkauf am Schalter (Auftragsart ZBV, Sofortauftrag)
*----------------------------------------------------------------------*

TYPES: BEGIN OF ty_pos,
         posnr TYPE posnr_va,
         matnr TYPE matnr,
         arktx TYPE arktx,
         menge TYPE kwmeng,
         vrkme TYPE vrkme,
         preis TYPE kbetr,
         waers TYPE waers,
       END OF ty_pos,
       tt_pos TYPE STANDARD TABLE OF ty_pos WITH DEFAULT KEY.

CLASS lcl_kasse DEFINITION DEFERRED.

DATA: ok_code      TYPE sy-ucomm,
      gv_answer    TYPE c LENGTH 1,
      go_kasse     TYPE REF TO lcl_kasse,
      go_container TYPE REF TO cl_gui_custom_container,
      go_grid      TYPE REF TO cl_gui_alv_grid,
      gt_fcat      TYPE lvc_t_fcat.

CONSTANTS: gc_vtweg    TYPE vtweg VALUE '10',
           gc_spart    TYPE spart VALUE '00',
           gc_auart    TYPE auart VALUE 'ZBV',
           gc_cpd_kund TYPE kunnr VALUE '0000900000'.   "CPD Barverkauf

PARAMETERS: p_vkorg TYPE vkorg OBLIGATORY MEMORY ID vko,
            p_vkbur TYPE vkbur OBLIGATORY MEMORY ID vkb,
            p_kasse TYPE c LENGTH 4 OBLIGATORY.
