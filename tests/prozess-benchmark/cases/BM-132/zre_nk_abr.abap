REPORT zre_nk_abr.
*----------------------------------------------------------------------*
* RE-FX Nebenkostenabrechnung (Eigenentwicklung, vor Einführung SCS)
* Verteilung der Kosten einer Abrechnungseinheit nach Fläche oder
* Personen, zeitanteilig; Verrechnung mit den NK-Vorauszahlungen (Z200);
* Buchung von Nachzahlung/Guthaben je Mieter ins FI.
* 2013 AKR  Ersterstellung
* 2016 AKR  Umlageschlüssel Personen
* 2021 SWE  Testlauf, Ergebnisprotokoll ZRE_NK_ERG
*----------------------------------------------------------------------*
INCLUDE zre_nk_abr_top.

START-OF-SELECTION.
  gv_beginn = |{ p_gjahr }0101|.
  gv_ende   = |{ p_gjahr }1231|.

  SELECT SINGLE * FROM zre_nk_ae INTO gs_ae
    WHERE ae_id = p_ae.
  IF sy-subrc <> 0.
    MESSAGE e030(zre) WITH p_ae.
  ENDIF.

* umlagefähige Kosten des Jahres (aus CO-Übernahme ZRE_NK_KOSTEN)
  SELECT SUM( betrag ) FROM zre_nk_kosten INTO gv_gesamt
    WHERE ae_id = p_ae
      AND gjahr = p_gjahr.

  PERFORM teilnehmer_lesen.
  PERFORM verteilen.
  IF p_test IS INITIAL.
    PERFORM buchen.
  ENDIF.

  LOOP AT gt_teiln INTO DATA(ls_t).
    WRITE: / ls_t-recnnr, ls_t-kosten, ls_t-voraus, ls_t-saldo,
             ls_t-belnr, ls_t-meldung.
  ENDLOOP.

INCLUDE zre_nk_abr_f01.
