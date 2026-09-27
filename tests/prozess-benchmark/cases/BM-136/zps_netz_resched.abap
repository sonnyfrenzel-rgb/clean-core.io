REPORT zps_netz_resched MESSAGE-ID zps.
*----------------------------------------------------------------------*
* Massen-Neuterminierung von Netzplänen je Projekt
*   - parallel über aRFC in einer Servergruppe
*   - Meilensteinverzug gegen eingefrorene Basistermine (ZPS_MLST_BASIS)
*   - ALV-Ergebnis mit Absprung in Netzplan bzw. Projekt
* 2010 PSC  Ersterstellung (Batch-Input CN24N abgelöst)
* 2013 PSC  Parallelisierung über RFC-Servergruppe
* 2019 MBR  Meilensteinverzug, ALV mit Absprung
* 2021 MBR  Anwendungslog ZPS/RESCHED für Fehler und Übersprungene
* Einplanung: Variante SAP&MONAT, monatlich nach dem Meilensteinlauf
* Hinweis: die Servergruppe muss in RZ12 gepflegt sein
*----------------------------------------------------------------------*
INCLUDE zps_netz_resched_top.
INCLUDE zps_netz_resched_c01.

START-OF-SELECTION.
  PERFORM projekte_lesen.
  IF gt_proj IS INITIAL.
    MESSAGE s102 DISPLAY LIKE 'W'.
    LEAVE PROGRAM.
  ENDIF.
  PERFORM parallel_starten.

END-OF-SELECTION.
  PERFORM meilensteine_bewerten.
  PERFORM protokoll_sichern.
  PERFORM alv_anzeigen.

INCLUDE zps_netz_resched_f01.
