REPORT zmm_niederstwert MESSAGE-ID zmm LINE-SIZE 255.
*----------------------------------------------------------------------*
* Niederstwertpruefung zum Bilanzstichtag (HGB § 253 Abs. 4)
*  - Bestand und Buchpreis je Material/Bewertungskreis (MBEW)
*  - Marktpreis = letzter Bestellpreis der letzten 6 Monate
*  - Gaengigkeitsabschlag nach Reichweite (Verbrauch 12 Monate, MSEG)
*  - Abwertung ueber Schwelle -> Preisaenderung per MR21 (Batch-Input)
*  - Historie in ZMM_NSW_HIST
*----------------------------------------------------------------------*
* 2008-12 HW  Erstellung fuer Jahresabschluss 2008
* 2012-01 HW  Gaengigkeitsabschlag
* 2015-11 PS  Historie, Testlauf, ALV statt WRITE
* 2020-01 PS  Nur Materialien mit Preissteuerung S buchen (Ticket 3310)
*----------------------------------------------------------------------*

INCLUDE zmm_niederstwert_top.
INCLUDE zmm_niederstwert_sel.
INCLUDE zmm_niederstwert_f01.
INCLUDE zmm_niederstwert_f02.

INITIALIZATION.
  p_stich = sy-datum.
  p_stich+4(4) = '1231'.
  p_stich(4)   = p_stich(4) - 1.

AT SELECTION-SCREEN.
  PERFORM berechtigung_pruefen.

START-OF-SELECTION.
  PERFORM werke_ermitteln.
  IF gt_werks IS INITIAL.
    MESSAGE e040 WITH p_bukrs.
  ENDIF.

  PERFORM bestand_lesen.
  IF gt_bew IS INITIAL.
    MESSAGE s041.
    RETURN.
  ENDIF.

  PERFORM marktpreis_ermitteln.
  PERFORM gaengigkeit_ermitteln.
  PERFORM abwertung_berechnen.

  IF p_test = abap_false.
    PERFORM preise_aendern.
    PERFORM historie_schreiben.
  ENDIF.

END-OF-SELECTION.
  PERFORM ausgabe.
