*&---------------------------------------------------------------------*
*& Report  ZCO_KALK_UEBERNAHME
*&
*& Plankalkulationen (Kalkulationsvariante, Kalkulationsdatum) pruefen
*& und das Ergebnis als neuen Standardpreis in die Materialbewertung
*& uebernehmen - Ersatz fuer Vormerken/Freigeben in CK24, weil das
*& Werk 2000 unterjaehrig Preise aendern muss (Genehmigung CFO 2012).
*&
*& Pruefregeln: ZCL_CO_KALK_REGEL (Status, Doppeluebernahme),
*&              ZCL_CO_KALK_REGEL_ABW (zusaetzlich Preisabweichung).
*& Abweichung ueber Schwelle = Warnung, Preis wird NICHT uebernommen.
*&---------------------------------------------------------------------*
*& 2012-04  HKO  Erstellung
*& 2016-09  HKO  Regelklassen, Protokoll-ALV entfernt (WRITE reicht)
*& 2022-02  MBR  Testlauf protokolliert jetzt auch bestandene Pruefung
*&---------------------------------------------------------------------*
REPORT zco_kalk_uebernahme MESSAGE-ID zco_ku.

INCLUDE zco_kalk_uebernahme_top.
INCLUDE zco_kalk_uebernahme_f01.

*----------------------------------------------------------------------*
AT SELECTION-SCREEN ON p_proz.
*----------------------------------------------------------------------*
  IF p_proz < 0 OR p_proz > 100.
    MESSAGE e001.
  ENDIF.

*----------------------------------------------------------------------*
START-OF-SELECTION.
*----------------------------------------------------------------------*
  PERFORM kalkulationen_lesen.
  IF gt_keko IS INITIAL.
    MESSAGE s002 WITH p_klvar p_kadky DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  go_regel = zcl_co_kalk_regel=>fabrik( p_proz ).

  LOOP AT gt_keko INTO gs_keko.
    TRY.
        PERFORM kalkulation_verarbeiten USING gs_keko.
      CATCH zcx_co_kalk INTO gx_kalk.
        PERFORM protokoll USING gs_keko gx_kalk->mv_schwere gx_kalk->mv_text.
    ENDTRY.
  ENDLOOP.

*----------------------------------------------------------------------*
END-OF-SELECTION.
*----------------------------------------------------------------------*
  PERFORM ausgabe.
