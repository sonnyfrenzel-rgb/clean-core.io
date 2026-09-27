FUNCTION z_qm_pruefe_ve_freigabe.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_PRUEFLOS) TYPE  QPLOS
*"  EXPORTING
*"     VALUE(EV_FREIGABE) TYPE  XFELD
*"     VALUE(EV_VCODE) TYPE  QVCODE
*"  EXCEPTIONS
*"      LOS_NICHT_GEFUNDEN
*"----------------------------------------------------------------------
* Aufruf aus Versandvorbereitung: darf die Charge raus?
  DATA: ls_qals TYPE qals,
        ls_qave TYPE qave.

  CLEAR: ev_freigabe, ev_vcode.

  SELECT SINGLE * FROM qals INTO ls_qals
    WHERE prueflos = iv_prueflos.
  IF sy-subrc <> 0.
    RAISE los_nicht_gefunden.
  ENDIF.

* Verwendungsentscheid auf Losebene (KZART = L)
  SELECT SINGLE * FROM qave INTO ls_qave
    WHERE prueflos = iv_prueflos
      AND kzart    = 'L'.
  IF sy-subrc = 0 AND ls_qave-vbewertung = 'A'.
    ev_freigabe = abap_true.
    ev_vcode    = ls_qave-vcode.
  ENDIF.

ENDFUNCTION.
