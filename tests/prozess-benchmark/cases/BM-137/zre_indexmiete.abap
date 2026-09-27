REPORT zre_indexmiete MESSAGE-ID zre.
*----------------------------------------------------------------------*
* RE-FX Indexmiete (Wertsicherungsklausel nach § 557b BGB)
* Anpassung der Grundmiete an die Veränderung des Verbraucherpreis-
* index gegenüber dem Basiswert des Vertrags, mit Schwellenwert und
* Mindestabstand von einem Jahr seit der letzten Anpassung.
* Ablauf: Berechnen -> (Echtlauf) Konditionen ändern -> Mieterbrief
* 2014 AKR  Ersterstellung
* 2016 AKR  Smart Form statt SAPscript für den Mieterbrief
* 2020 SWE  Sperre je Vertrag, Briefdruck über TVARVC abschaltbar
* 2022 SWE  Mail an die Objektbetreuung bei Nacharbeit
* Hinweis: Indexwerte (ZRE_INDEX_WERT) pflegt die Buchhaltung monatlich
*          aus der Veröffentlichung des Statistischen Bundesamts.
*----------------------------------------------------------------------*
INCLUDE zre_indexmiete_top.

AT SELECTION-SCREEN.
  IF p_ab+6(2) <> '01'.
    MESSAGE e210.            "Wirksamkeit nur zum Monatsersten
  ENDIF.

START-OF-SELECTION.
  PERFORM vertraege_lesen.
  IF gt_vtr IS INITIAL.
    MESSAGE s211 WITH p_bukrs DISPLAY LIKE 'E'.
    STOP.
  ENDIF.
  PERFORM anpassung_berechnen.
  IF p_test IS INITIAL.
    PERFORM vertraege_aendern.
    PERFORM briefe_drucken.
    PERFORM fehler_mailen.
  ENDIF.

END-OF-SELECTION.
  CHECK gt_erg IS NOT INITIAL.
  PERFORM ausgabe.

INCLUDE zre_indexmiete_f01.
INCLUDE zre_indexmiete_f02.
INCLUDE zre_indexmiete_f03.
