*&---------------------------------------------------------------------*
*& Modulpool SAPMZMM_PR_RELEASE - Freigabecockpit Bestellanforderungen
*& Transaktion ZME55 (Dynpro 0100 Liste, 0200 Ablehnungsgrund)
*&---------------------------------------------------------------------*
*& Zeigt dem Freigeber alle Banf-Positionen, fuer die sein Freigabecode
*& als naechster dran ist (Zuordnung Benutzer -> Code in ZMM_FRG_USER).
*& Funktionen: Freigeben, Ablehnen (mit Grund), Detail (ME53N), Auffrischen
*&---------------------------------------------------------------------*
*& 2007-02 SR  Erstellung
*& 2010-08 SR  Ablehnen mit Workflow-Ereignis an Anforderer
*& 2014-03 JT  Mehrfachmarkierung, Sperrlogik
*&---------------------------------------------------------------------*
PROGRAM sapmzmm_pr_release MESSAGE-ID zmm.

INCLUDE mzmm_pr_release_top.
INCLUDE mzmm_pr_release_o01.
INCLUDE mzmm_pr_release_i01.
INCLUDE mzmm_pr_release_f01.

LOAD-OF-PROGRAM.
* Aufruf nur ueber Transaktion ZME55 (auch per SUBMIT/Direktaufruf pruefen)
  AUTHORITY-CHECK OBJECT 'S_TCODE'
    ID 'TCD' FIELD 'ZME55'.
  IF sy-subrc <> 0.
    MESSAGE a059 WITH 'ZME55'.
  ENDIF.
