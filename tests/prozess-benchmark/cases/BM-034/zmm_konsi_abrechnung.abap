REPORT zmm_konsi_abrechnung MESSAGE-ID zmm.
*----------------------------------------------------------------------*
* Monatliche Konsignationsabrechnung
*  1. offene Entnahmen (RKWA) je Lieferant lesen
*  2. Entnahmeaufstellung als Datei fuer das Lieferantenportal
*  3. Abrechnung ueber Standard (MRKO / RMVKON00) anstossen
*  4. Ergebnis im Anwendungsprotokoll (Objekt ZMM, Unterobj. KONSI)
* Nur Lieferanten mit Abrechnungskennzeichen in ZMM_KONSI_LIEF.
*----------------------------------------------------------------------*
TABLES rkwa.
SELECT-OPTIONS: s_bukrs FOR rkwa-bukrs OBLIGATORY,
                s_lifnr FOR rkwa-lifnr,
                s_budat FOR rkwa-budat.
PARAMETERS: p_dir  TYPE string LOWER CASE DEFAULT '/interface/out/konsi/',
            p_abr  AS CHECKBOX DEFAULT 'X',
            p_test AS CHECKBOX.

TYPES: BEGIN OF ty_rkwa,
         lifnr TYPE rkwa-lifnr,
         bukrs TYPE rkwa-bukrs,
         werks TYPE rkwa-werks,
         matnr TYPE rkwa-matnr,
         mblnr TYPE rkwa-mblnr,
         mjahr TYPE rkwa-mjahr,
         zeile TYPE rkwa-zeile,
         budat TYPE rkwa-budat,
         menge TYPE rkwa-menge,
         meins TYPE rkwa-meins,
         wrbtr TYPE rkwa-wrbtr,
         waers TYPE rkwa-waers,
       END OF ty_rkwa.

DATA: gt_rkwa   TYPE STANDARD TABLE OF ty_rkwa,
      gt_konsi  TYPE SORTED TABLE OF zmm_konsi_lief WITH UNIQUE KEY lifnr,
      gv_handle TYPE balloghndl.

INCLUDE zmm_konsi_abrechnung_f01.

START-OF-SELECTION.
  PERFORM log_anlegen.
  PERFORM daten_lesen.
  IF gt_rkwa IS INITIAL.
    MESSAGE s020.
    PERFORM log_meldung USING 'W' space 'Keine offenen Entnahmen'.
    PERFORM log_sichern.
    RETURN.
  ENDIF.
  PERFORM je_lieferant.
  PERFORM log_sichern.
