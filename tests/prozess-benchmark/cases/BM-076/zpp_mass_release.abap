REPORT zpp_mass_release MESSAGE-ID zpp.
*&---------------------------------------------------------------------*
*& Massenfreigabe Fertigungsauftraege - parallelisiert
*&---------------------------------------------------------------------*
*& Hintergrund: COHV-Massenfreigabe lief im Werk 1000 ueber 4 Stunden.
*& Auftraege werden in Pakete geteilt und per aRFC auf die
*& Servergruppe verteilt. Ergebnis ins Anwendungs-Log (SLG1: ZPP/MASSREL).
*&
*& 2019-10  DR  Erstellung
*& 2020-03  DR  Fallback seriell, wenn Servergruppe nicht verfuegbar
*& 2022-06  KL  Loeschvormerkung ausschliessen (Ticket 4711)
*&---------------------------------------------------------------------*
INCLUDE zpp_mass_release_top.
INCLUDE zpp_mass_release_f01.
INCLUDE zpp_mass_release_f02.
INCLUDE zpp_mass_release_f03.

INITIALIZATION.
  p_bis = sy-datum + 3.

AT SELECTION-SCREEN.
  IF p_paket < 1 OR p_paket > 500.
    MESSAGE e201.
  ENDIF.
  AUTHORITY-CHECK OBJECT 'C_AFKO_AWK'
    ID 'WERKS'  FIELD p_werks
    ID 'AUFART' FIELD p_auart.
  IF sy-subrc <> 0.
    MESSAGE e202 WITH p_werks p_auart.
  ENDIF.

START-OF-SELECTION.
  PERFORM selektieren.
  IF gt_orders IS INITIAL.
    MESSAGE s203.
    RETURN.
  ENDIF.

  PERFORM pakete_bilden.

  IF p_para = abap_true.
    PERFORM verteilen.
  ELSE.
    PERFORM seriell.
  ENDIF.

END-OF-SELECTION.
  PERFORM protokoll_sichern.
  PERFORM ausgabe.
