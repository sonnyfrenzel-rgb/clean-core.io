*&---------------------------------------------------------------------*
*&  Include           ZPP_TERMINAL_TOP
*&---------------------------------------------------------------------*
*  Werkerterminal Fertigung: Anmelden per Ausweis, Vorgang starten/beenden
*  Dynpro 0100 (Vollbild, Touch): Felder GS_TERM-AUSWEIS/-AUFNR/-VORNR
*  Drucktasten: ANME STRT ENDE ABME, BACK nur fuer Admin
*----------------------------------------------------------------------*

TYPES: BEGIN OF ty_term,
         terminal TYPE char10,
         ausweis  TYPE char20,
         pernr    TYPE pernr_d,
         werks    TYPE werks_d,
         arbid    TYPE cr_objid,
         aufnr    TYPE aufnr,
         vornr    TYPE vornr,
       END OF ty_term.

INTERFACE lif_schritt DEFERRED.
CLASS lcx_terminal DEFINITION DEFERRED.

DATA: ok_code TYPE sy-ucomm,
      gs_term TYPE ty_term.

PARAMETERS p_term TYPE char10 OBLIGATORY DEFAULT 'T-HALLE3-01'.
