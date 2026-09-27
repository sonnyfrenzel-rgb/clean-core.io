REPORT zrt_katalog_import MESSAGE-ID zrt LINE-SIZE 160.
*----------------------------------------------------------------------*
* Lieferantenkatalog (XML) in den Artikelstamm uebernehmen
*----------------------------------------------------------------------*
* - Katalog vom Applikationsserver, Umsetzung per Transformation
* - Feldzuordnung je Lieferant aus ZRT_KATMAP (Standard = Lieferant leer),
*   optional Konvertierungsmethode je Feld
* - Status N/A: Artikel anlegen/aendern per Retail-BAPI, Neuanlage listen
* - Status D:   Auslaufstatus AU setzen
* - Wiederaufsetzpunkt alle 100 Zeilen in INDX (Bereich ZK)
*----------------------------------------------------------------------*
* 2014 Ersterstellung (Projekt Sortimentsdaten)
* 2016 Konvertierungsmethoden je Feld
* 2019 Wiederaufsetzen nach Abbruch
*----------------------------------------------------------------------*

INCLUDE zrt_katalog_import_top.
INCLUDE zrt_katalog_import_c01.
INCLUDE zrt_katalog_import_f01.
INCLUDE zrt_katalog_import_f02.

AT SELECTION-SCREEN ON p_lifnr.
  SELECT SINGLE lifnr FROM lfa1 INTO @DATA(lv_lifnr)
    WHERE lifnr = @p_lifnr
      AND sperr = @space.
  IF sy-subrc <> 0.
    MESSAGE e001 WITH p_lifnr.            "Lieferant & unbekannt/gesperrt
  ENDIF.

START-OF-SELECTION.
  PERFORM mapping_lesen.
  go_mapper = NEW lcl_mapper( gt_map ).
  PERFORM datei_lesen.
  PERFORM wiederaufsetzen.
  PERFORM verarbeiten.

END-OF-SELECTION.
  PERFORM protokoll_ausgeben.
