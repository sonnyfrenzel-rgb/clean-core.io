FUNCTION z_hr_befristung_pruefen.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_PERNR) TYPE  PERSNO
*"     VALUE(IV_STICHTAG) TYPE  DATUM DEFAULT SY-DATUM
*"  EXPORTING
*"     VALUE(EV_TAGE_REST) TYPE  I
*"  EXCEPTIONS
*"      KEIN_VERTRAG
*"----------------------------------------------------------------------
  DATA: ls_p0016 TYPE p0016.

  CLEAR ev_tage_rest.
  CHECK iv_pernr IS NOT INITIAL.

* Vertragsbestandteile zum Stichtag
  SELECT SINGLE * FROM pa0016 INTO CORRESPONDING FIELDS OF ls_p0016
    WHERE pernr = iv_pernr
      AND begda <= iv_stichtag
      AND endda >= iv_stichtag.
  IF sy-subrc <> 0 OR ls_p0016-ctedt IS INITIAL.
    RAISE kein_vertrag.
  ENDIF.

  ev_tage_rest = ls_p0016-ctedt - iv_stichtag.
ENDFUNCTION.
