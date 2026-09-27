REPORT zqm_charge_freigabe MESSAGE-ID zqm.
*&---------------------------------------------------------------------*
*& Automatische Chargenfreigabe nach Pruefergebnis
*&---------------------------------------------------------------------*
*& Job ZQM_CHARGE_FREIGABE (stuendlich) oder Dialog durch QS-Leitung.
*& Je Prueflos ohne Verwendungsentscheid:
*&   1. Ergebnisse gegen Vorgaben bewerten (LCL_BEWERTUNG)
*&   2. Verwendungsentscheid A1 (Annahme) oder R1 (Rueckweisung)
*&   3. Chargenklassifizierung Z_FREIGABE fortschreiben
*&   4. Bei Rueckweisung: Charge nicht frei + Mail an QS-Verteiler
*&   5. Protokoll ZQM_FREIGABE_LOG + ALV
*&---------------------------------------------------------------------*
*& 2016-05  CB  Erstellung (GMP-Audit 2016, Massnahme 12)
*& 2017-02  CB  Toleranzpruefung zusaetzlich zur Merkmalsbewertung
*& 2020-10  LS  Mail ueber BCS statt SO_NEW_DOCUMENT_SEND_API1
*&---------------------------------------------------------------------*
INCLUDE zqm_charge_freigabe_top.
INCLUDE zqm_charge_freigabe_cl.
INCLUDE zqm_charge_freigabe_f01.
INCLUDE zqm_charge_freigabe_f02.

START-OF-SELECTION.
  PERFORM prueflose_lesen.
  IF gt_lose IS INITIAL.
    MESSAGE s100.
    RETURN.
  ENDIF.

  go_bew = NEW lcl_bewertung( ).

  LOOP AT gt_lose INTO gs_los.
    PERFORM los_verarbeiten USING gs_los.
  ENDLOOP.

END-OF-SELECTION.
  PERFORM ausgabe.
