FUNCTION z_sd_bonus_post_upd.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein (Start sofort)
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IS_BELEG) TYPE  ZSD_BONUS_BELEG
*"----------------------------------------------------------------------
* Bonusbeleg je Kunde/VKORG/Jahr - Schlüssel verhindert Doppelabrechnung
  INSERT zsd_bonus_beleg FROM is_beleg.
  IF sy-subrc <> 0.
    MESSAGE a951(zsd) WITH is_beleg-kunnr is_beleg-gjahr.
  ENDIF.
ENDFUNCTION.
