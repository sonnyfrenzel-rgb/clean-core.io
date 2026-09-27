*&---------------------------------------------------------------------*
*&  Include           ZSD_KASSLIM_PFLEGE_TOP
*&---------------------------------------------------------------------*
*  Pflege Barzahlungs-/Kassenlimit je Kunde (Tabelle ZSD_KASSLIMIT)
*  Aenderungsbelegobjekt ZKASSLIM (SCDO), Sperrobjekt EZSD_KASSLIM
*----------------------------------------------------------------------*

CLASS lcx_pflege DEFINITION DEFERRED.
CLASS lcl_pflege_base DEFINITION DEFERRED.
CLASS lcl_limit_pflege DEFINITION DEFERRED.

TABLES zsd_kasslimit.                   "Dynprofelder 0100

DATA: ok_code   TYPE sy-ucomm,
      go_pflege TYPE REF TO lcl_limit_pflege,
      gx_err    TYPE REF TO lcx_pflege.

CONSTANTS gc_limit_freigabe TYPE zsd_kasslimit-limit VALUE '50000.00'.

PARAMETERS p_kunnr TYPE kunnr OBLIGATORY.
