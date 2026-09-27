FUNCTION z_sd_get_customer_blocks.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_KUNNR) TYPE  KUNNR
*"     VALUE(IV_VKORG) TYPE  VKORG
*"     VALUE(IV_VTWEG) TYPE  VTWEG
*"     VALUE(IV_SPART) TYPE  SPART
*"  EXPORTING
*"     VALUE(EV_AUFSD) TYPE  AUFSD_X
*"     VALUE(EV_LIFSD) TYPE  LIFSD_X
*"     VALUE(EV_FAKSD) TYPE  FAKSD_X
*"  EXCEPTIONS
*"      CUSTOMER_NOT_FOUND
*"----------------------------------------------------------------------
  SELECT SINGLE aufsd lifsd faksd FROM kna1
    INTO (ev_aufsd, ev_lifsd, ev_faksd)
    WHERE kunnr = iv_kunnr.
  IF sy-subrc <> 0.
    RAISE customer_not_found.
  ENDIF.

* zentrale Sperre hat Vorrang vor der Sperre im Vertriebsbereich
  IF ev_aufsd IS INITIAL AND ev_lifsd IS INITIAL AND ev_faksd IS INITIAL.
    SELECT SINGLE aufsd lifsd faksd FROM knvv
      INTO (ev_aufsd, ev_lifsd, ev_faksd)
      WHERE kunnr = iv_kunnr
        AND vkorg = iv_vkorg
        AND vtweg = iv_vtweg
        AND spart = iv_spart.
  ENDIF.
ENDFUNCTION.
