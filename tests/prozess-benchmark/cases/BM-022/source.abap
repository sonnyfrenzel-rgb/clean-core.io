FUNCTION z_mm_get_blocked_stock.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_MATNR) TYPE  MATNR
*"     VALUE(IV_WERKS) TYPE  WERKS_D
*"  EXPORTING
*"     VALUE(EV_SPERR) TYPE  LABST
*"     VALUE(EV_QUAL)  TYPE  LABST
*"  EXCEPTIONS
*"      NOT_FOUND
*"----------------------------------------------------------------------
* Gesperrter und QM-Bestand ueber alle Lagerorte eines Werks
* (wird vom Dispo-Cockpit per RFC gerufen)
  DATA: lt_mard TYPE STANDARD TABLE OF mard,
        ls_mard TYPE mard.

  CLEAR: ev_sperr, ev_qual.

  SELECT * FROM mard INTO TABLE lt_mard
    WHERE matnr = iv_matnr
      AND werks = iv_werks
      AND lvorm = space.
  IF sy-subrc <> 0.
    RAISE not_found.
  ENDIF.

  LOOP AT lt_mard INTO ls_mard.
    ev_sperr = ev_sperr + ls_mard-speme.
    ev_qual  = ev_qual  + ls_mard-insme.
  ENDLOOP.

ENDFUNCTION.
