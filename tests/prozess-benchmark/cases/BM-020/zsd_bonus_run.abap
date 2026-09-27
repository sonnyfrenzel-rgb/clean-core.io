REPORT zsd_bonus_run MESSAGE-ID zsd.
*----------------------------------------------------------------------*
* Jahresbonus Kunden (Ersatz für die SD-Bonusabwicklung mit Absprachen)
*
*  1. Fakturaumsatz je Regulierer des Geschäftsjahres ermitteln
*     (Native SQL - Laufzeit mit Open SQL auf VBRP > 4 Stunden, 2012)
*  2. Bonusprozentsatz aus Staffel ZSD_BONUS_STAFFEL ermitteln
*  3. je Kunde eine Gutschriftsanforderung ZG2 mit Kondition ZBON anlegen
*     und den Bonusbeleg ZSD_BONUS_BELEG verbuchen
*----------------------------------------------------------------------*
* 2012-01 RHA  Ersterstellung
* 2014-12 RHA  Mindestumsatz, Kappung je Staffel
* 2017-01 SVO  Fremdwährungsumsätze in EUR umrechnen
* 2019-12 SVO  Doppelabrechnung verhindern (ZSD_BONUS_BELEG)
*----------------------------------------------------------------------*
INCLUDE zsd_bonus_run_top.
INCLUDE zsd_bonus_run_f01.

INITIALIZATION.
  p_gjahr = sy-datum(4) - 1.

START-OF-SELECTION.
  PERFORM umsaetze_lesen.
  IF gt_umsatz IS INITIAL.
    MESSAGE s950 WITH p_gjahr p_vkorg.
    RETURN.
  ENDIF.

  TRY.
      go_calc = NEW zcl_sd_bonus_calc( iv_vkorg = p_vkorg
                                       iv_vtweg = p_vtweg
                                       iv_spart = p_spart
                                       iv_gjahr = p_gjahr ).
    CATCH zcx_sd_bonus INTO gx_bonus.
      MESSAGE gx_bonus TYPE 'E'.
  ENDTRY.

  LOOP AT gt_umsatz INTO gs_umsatz.
    PERFORM kunde_abrechnen USING gs_umsatz.
  ENDLOOP.

  PERFORM ergebnis_anzeigen.
