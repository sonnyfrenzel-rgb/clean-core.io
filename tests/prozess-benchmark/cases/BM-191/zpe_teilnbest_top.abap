*&---------------------------------------------------------------------*
*&  Include           ZPE_TEILNBEST_TOP
*&---------------------------------------------------------------------*
*&  Globale Daten und Selektionsbild Teilnahmebestaetigungen
*&---------------------------------------------------------------------*
TABLES: hrp1000.

TYPES: BEGIN OF ty_event,
         objid TYPE hrobjid,
         begda TYPE begda,
         endda TYPE endda,
         stext TYPE stext,
       END OF ty_event,
       BEGIN OF ty_rel,
         objid TYPE hrobjid,
         sclas TYPE sclas,
         sobid TYPE sobid,
       END OF ty_rel,
       BEGIN OF ty_attendee,
         sclas TYPE sclas,
         sobid TYPE sobid,
         name  TYPE char80,
         anred TYPE anrde,
       END OF ty_attendee.

CONSTANTS: gc_form   TYPE fpname VALUE 'ZPE_TEILNAHMEBEST',
*          gc_sform  TYPE tdsfname VALUE 'ZPE_TEILNBEST_SF',   "bis 2016
           gc_relat  TYPE relat  VALUE '025'.

DATA: gt_events   TYPE STANDARD TABLE OF ty_event,
      gs_event    TYPE ty_event,
      gt_rel      TYPE STANDARD TABLE OF ty_rel,
      gs_rel      TYPE ty_rel,
      gs_attendee TYPE ty_attendee,
      gs_outpar   TYPE sfpoutputparams,
      gv_fm_name  TYPE funcname,
      gv_ok       TYPE i,
      gv_err      TYPE i,
      gv_evt_cnt  TYPE i.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-b01.
PARAMETERS     p_plvar TYPE plvar DEFAULT '01' OBLIGATORY.
SELECT-OPTIONS: s_evid  FOR hrp1000-objid,
                s_endda FOR hrp1000-endda NO-EXTENSION OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-b02.
PARAMETERS: p_dest TYPE rspopname DEFAULT 'LOCL',
            p_prev AS CHECKBOX,
            p_rept AS CHECKBOX.
SELECTION-SCREEN END OF BLOCK b2.
