*&---------------------------------------------------------------------*
*& Report  ZFI_PERIODENABSCHLUSS
*&
*& Monatsabschluss Buchungskreis: Vorpruefungen und Schliessen der
*& Buchungsperiode in der Periodenvariante (T001B).
*&
*& Ablauf:
*&   1. Anwendungslog anlegen (Objekt ZFI / Unterobjekt ABSCHLUSS)
*&   2. Pruefungen: Parkbelege, offene Abgrenzungen, WE/RE-Konto
*&   3. bei Fehlern kein Abschluss (ausser "Erzwingen")
*&   4. Periode schliessen = Von-Periode im Intervall 1 weitersetzen
*&   5. Log sichern und anzeigen
*&---------------------------------------------------------------------*
*& 2006-11  GBR  Erstellung
*& 2009-03  GBR  WE/RE-Pruefung, Toleranz als Parameter
*& 2013-07  SKL  Anwendungslog statt WRITE-Liste
*& 2017-01  SKL  Pruefung abgebrochene Verbuchungen entfernt (Basis)
*&---------------------------------------------------------------------*
REPORT zfi_periodenabschluss MESSAGE-ID zfi_pa.

INCLUDE zfi_periodenabschluss_top.
INCLUDE zfi_periodenabschluss_sel.
INCLUDE zfi_periodenabschluss_f01.
INCLUDE zfi_periodenabschluss_f02.
INCLUDE zfi_periodenabschluss_f03.

*----------------------------------------------------------------------*
AT SELECTION-SCREEN.
*----------------------------------------------------------------------*
  SELECT SINGLE opvar FROM t001 INTO gv_opvar
    WHERE bukrs = p_bukrs.
  IF sy-subrc <> 0 OR gv_opvar IS INITIAL.
    MESSAGE e001 WITH p_bukrs.
  ENDIF.

*----------------------------------------------------------------------*
START-OF-SELECTION.
*----------------------------------------------------------------------*
  PERFORM zeitraum_setzen.
  PERFORM log_anlegen.
  PERFORM berechtigung_pruefen.

  PERFORM pruefung_parkbelege.
* PERFORM pruefung_abgrenzungen.   "deaktiviert bis ZFI_ABGRENZUNG live
  PERFORM pruefung_were_konto.
* PERFORM pruefung_verbuchung.     "entfernt 2017, siehe Kopf

  IF gv_fehler > 0 AND p_force IS INITIAL.
    PERFORM log_meldung USING 'E' 'Abschluss wegen Pruefungsfehlern nicht durchgefuehrt'.
  ELSEIF p_test = 'X'.
    PERFORM log_meldung USING 'I' 'Testlauf - Periode wird nicht geschlossen'.
  ELSE.
    PERFORM periode_schliessen.
  ENDIF.

*----------------------------------------------------------------------*
END-OF-SELECTION.
*----------------------------------------------------------------------*
  PERFORM log_sichern.
  PERFORM log_anzeigen.
