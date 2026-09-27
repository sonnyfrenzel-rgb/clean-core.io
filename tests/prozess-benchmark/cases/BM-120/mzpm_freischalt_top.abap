*&---------------------------------------------------------------------*
*& Include MZPM_FREISCHALT_TOP - globale Daten
*&---------------------------------------------------------------------*
* Freischaltschritt (Tabelle ZPM_FREISCH):
*   AUFPL/APLZL  Vorgang (nur Steuerschlüssel ZWCM)
*   SCHRITT      laufende Nummer
*   OBJEKT       Trennstelle (Schalter, Schieber, Sicherung)
*   AKTION       AUS / ZU / ERDEN / SICHERN
*   STATUS       OFFEN   -> noch nicht gesetzt
*                GESETZT -> vom Monteur gesetzt
*                AKT     -> von zweiter Person geprüft, wirksam
*                ZURUECK -> nach Arbeitsende zurückgenommen
*
* Nachrichtenklasse ZPM (Auszug):
*   230  Auftrag &1 ist kein Instandhaltungsauftrag
*   231  Auftrag &1 ist nicht freigegeben
*   232  Auftrag &1 wird von &2 bearbeitet
*   233  Zu Auftrag &1 sind keine Freischaltschritte erfasst
*   234  Schritt &1/&2 ist bereits gesetzt
*   236  Schritt &1/&2: Prüfer darf nicht der Setzende sein
*   237  Auftrag &1 ist nicht technisch abgeschlossen
*   238  Keine Änderungen vorhanden
*   240  Freischaltung zu Auftrag &1 gesichert
*
* Anwenderstatus (Statusschema ZPM00001):
*   E0010  FREI  "freigeschaltet" - Voraussetzung für Arbeitsbeginn
*---------------------------------------------------------------------*
TYPES: BEGIN OF ty_step,
         mark         TYPE c LENGTH 1,
         aufpl        TYPE zpm_freisch-aufpl,
         aplzl        TYPE zpm_freisch-aplzl,
         vornr        TYPE afvc-vornr,
         ltxa1        TYPE afvc-ltxa1,
         schritt      TYPE zpm_freisch-schritt,
         objekt       TYPE zpm_freisch-objekt,
         objtx        TYPE zpm_freisch-objtx,
         aktion       TYPE zpm_freisch-aktion,
         status       TYPE zpm_freisch-status,
         gesetzt_von  TYPE zpm_freisch-gesetzt_von,
         gesetzt_am   TYPE zpm_freisch-gesetzt_am,
         geprueft_von TYPE zpm_freisch-geprueft_von,
         geprueft_am  TYPE zpm_freisch-geprueft_am,
         zurueck_von  TYPE zpm_freisch-zurueck_von,
         bemerkung    TYPE zpm_freisch-bemerkung,
       END OF ty_step,
       BEGIN OF ty_hdr,
         aufnr TYPE aufk-aufnr,
         auart TYPE aufk-auart,
         objnr TYPE aufk-objnr,
         werks TYPE aufk-werks,
         iwerk TYPE afih-iwerk,
         ktext TYPE aufk-ktext,
         equnr TYPE afih-equnr,
         tplnr TYPE iloa-tplnr,
       END OF ty_hdr.

DATA: ok_code    TYPE sy-ucomm,
      gv_aufnr   TYPE aufk-aufnr,
      gs_hdr     TYPE ty_hdr,
      gt_steps   TYPE STANDARD TABLE OF ty_step,
      gs_step    TYPE ty_step,
      gv_teco    TYPE abap_bool,
      gv_changed TYPE abap_bool.

CONTROLS tc_steps TYPE TABLEVIEW USING SCREEN 0200.
