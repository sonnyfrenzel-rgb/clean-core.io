REPORT zsd_mass_va02 MESSAGE-ID zsd LINE-SIZE 255.
*----------------------------------------------------------------------*
* Massenänderung Kundenaufträge per Batch-Input VA02
*
* Datei (CSV, Trenner ';', erste Zeile = Überschrift):
*   VBELN;POSNR;FELD;WERT
*   FELD = MENGE | LIFSK | ABGRU | EDATU
* Quelle: Frontend (Dialog) oder Applikationsserver (Hintergrundjob)
*----------------------------------------------------------------------*
* 2012-03 GHE  Ersterstellung
* 2014-09 GHE  Absagegrund, Liefersperre auf Kopfebene
* 2018-06 NWO  Applikationsserver für Jobs, Anwendungsprotokoll
* 2021-02 NWO  Prüfung Positionsstatus vor Änderung
*----------------------------------------------------------------------*
INCLUDE zsd_mass_va02_top.
INCLUDE zsd_mass_va02_f01.
INCLUDE zsd_mass_va02_f02.
INCLUDE zsd_mass_va02_f03.

INITIALIZATION.
  p_mode = 'N'.

AT SELECTION-SCREEN.
* Applikationsserver nur mit absolutem Pfad
  IF p_appl = abap_true AND p_file(1) <> '/'.
    MESSAGE e600.
  ENDIF.

START-OF-SELECTION.
  PERFORM datei_lesen.
  IF gt_upload IS INITIAL.
    MESSAGE s601 DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  PERFORM log_anlegen.
  PERFORM zeilen_pruefen.
  PERFORM aenderungen_ausfuehren.
  PERFORM log_sichern.
  PERFORM ergebnis_anzeigen.
