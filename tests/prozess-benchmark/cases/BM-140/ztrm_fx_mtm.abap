REPORT ztrm_fx_mtm LINE-SIZE 132.
*----------------------------------------------------------------------*
* Treasury: tägliche Marktbewertung (Mark-to-Market) offener
* Devisentermingeschäfte, Kontrahentenlimit-Prüfung, XML-Export an das
* Risikosystem und Vergleich mit dem Vortag (INDX-Cluster ZM).
* Läuft täglich 19:00 nach dem Kursimport.
* 2015 FXT  Ersterstellung
* 2017 FXT  Kontrahentenlimits (ZCL_TRM_CPTY_LIMIT), Positionsliste
* 2020 KFR  Vortagesvergleich über INDX statt Z-Tabelle
* 2021 KFR  Positionsliste über Listenspeicher statt Spool
* Ablauf:
*   1. offene Geschäfte lesen, Terminpunkte lesen
*   2. Marktterminkurs und Marktwert je Geschäft
*   3. Veränderung zum Vortagesstand
*   4. positive Marktwerte je Kontrahent gegen Limit
*   5. XML an das Risikosystem, Stand sichern (nur Echtlauf), Liste
*----------------------------------------------------------------------*
INCLUDE ztrm_fx_mtm_top.
INCLUDE ztrm_fx_mtm_f01.
INCLUDE ztrm_fx_mtm_f02.

START-OF-SELECTION.
  PERFORM geschaefte_lesen.
  IF gt_deal IS INITIAL.
    MESSAGE s310(ztrm) WITH p_datum.
    RETURN.
  ENDIF.
  PERFORM terminpunkte_lesen.
  PERFORM bewerten.
  PERFORM vortag_vergleichen.
  PERFORM limite_pruefen.

END-OF-SELECTION.
  CHECK gt_mtm IS NOT INITIAL.
  PERFORM xml_export.
  IF p_test IS INITIAL.
    PERFORM stand_sichern.
  ENDIF.
  PERFORM ausgabe.
