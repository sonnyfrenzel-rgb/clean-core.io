REPORT zmm_lief_bewertung.
*----------------------------------------------------------------------*
* Lieferantenbewertung (Ersatz fuer ME61/ME65 mit eigener Gewichtung)
* Termintreue 40 %, Mengentreue 30 %, Qualitaet 30 %
* Ergebnis je EKORG/Periode in ZMM_LIEF_SCORE, Anzeige als ALV
*----------------------------------------------------------------------*
* 2011-01 FB  Erstellung
* 2014-08 FB  Qualitaet aus QM (vorher manuelle Note)
* 2018-03 GH  Periodenschluessel, Loeschen vor Neuaufbau
*----------------------------------------------------------------------*
TABLES: ekko, ekbe.

SELECT-OPTIONS: s_lifnr FOR ekko-lifnr,
                s_budat FOR ekbe-budat OBLIGATORY.
PARAMETERS: p_ekorg TYPE ekko-ekorg OBLIGATORY,
            p_perio TYPE zmm_lief_score-perio OBLIGATORY,
            p_upd   AS CHECKBOX.

TYPES: BEGIN OF ty_we,
         lifnr TYPE ekko-lifnr,
         ebeln TYPE ekbe-ebeln,
         ebelp TYPE ekbe-ebelp,
         budat TYPE ekbe-budat,
         menge TYPE ekbe-menge,
         shkzg TYPE ekbe-shkzg,
       END OF ty_we.

TYPES: BEGIN OF ty_acc,
         lifnr     TYPE lifnr,
         n_we      TYPE i,
         pkt_zeit  TYPE i,
         n_pos     TYPE i,
         pkt_menge TYPE i,
         n_los     TYPE i,
         n_ok      TYPE i,
       END OF ty_acc.

DATA: gt_we    TYPE STANDARD TABLE OF ty_we,
      gt_acc   TYPE HASHED TABLE OF ty_acc WITH UNIQUE KEY lifnr,
      gt_score TYPE STANDARD TABLE OF zmm_lief_score,
      go_alv   TYPE REF TO cl_salv_table.

INCLUDE zmm_lief_bewertung_f01.

START-OF-SELECTION.
  PERFORM lesen_wareneingaenge.
  IF gt_we IS INITIAL.
    MESSAGE s002(zmm) DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.
  PERFORM termintreue.
  PERFORM mengentreue.
  PERFORM qualitaet.
  PERFORM gesamtnote.

  IF p_upd = 'X'.
    PERFORM speichern.
  ENDIF.

END-OF-SELECTION.
  PERFORM anzeigen.
