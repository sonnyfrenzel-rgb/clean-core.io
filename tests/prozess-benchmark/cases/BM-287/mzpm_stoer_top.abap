*&---------------------------------------------------------------------*
*& Modulpool       SAPMZPM_STOER
*& Include         MZPM_STOER_TOP
*&---------------------------------------------------------------------*
*& Stoermeldung Schnellerfassung Instandhaltung (Transaktion ZPM_STOER)
*& Dynpros:
*&   0100  Equipment scannen      PBO STATUS_0100 / PAI USER_COMMAND_0100
*&   0200  Meldungsdetail         PBO STATUS_0200 / PAI EXIT_0200 (AT
*&         EXIT-COMMAND), USER_COMMAND_0200
*&         Subscreen-Bereich SUB_SCHADEN: 0210 (Stoerung) / 0220 (Maengel)
*&---------------------------------------------------------------------*
*& 2008-11-03 JKL  Ersterstellung Werk 1000
*& 2012-07-19 JKL  Maengelmeldung M2 mit eigenem Subscreen
*& 2017-02-14 PWI  Anwendungslog ZPM/STOER
*&---------------------------------------------------------------------*
PROGRAM sapmzpm_stoer MESSAGE-ID zpm_st.

TABLES: equi, eqkt.

TYPES: BEGIN OF ty_meld,
         qmart    TYPE qmart,
         equnr    TYPE equnr,
         iwerk    TYPE iwerk,
         eqktx    TYPE ktx01,
         qmtxt    TYPE qmtxt,
         priok    TYPE priok,
         ausfall  TYPE c LENGTH 1,
         fegrp    TYPE fegrp,
         fecod    TYPE fecod,
         otgrp    TYPE otgrp,
         oteil    TYPE oteil,
       END OF ty_meld.

DATA: ok_code     TYPE sy-ucomm,
      gv_ok       TYPE sy-ucomm,
      gs_meld     TYPE ty_meld,
      gv_equnr_in TYPE equnr,
      gv_subscr   TYPE sy-dynnr VALUE '0210',
      gv_qmnum    TYPE qmnum,
      gv_log      TYPE balloghndl,
      gv_answer   TYPE c LENGTH 1.

CONSTANTS: gc_stoerung TYPE qmart VALUE 'M1',
           gc_maengel  TYPE qmart VALUE 'M2'.
