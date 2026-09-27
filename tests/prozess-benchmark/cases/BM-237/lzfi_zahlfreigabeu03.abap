FUNCTION z_fi_zf_status_upd.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein:
*"
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_LAUFD) TYPE  LAUFD
*"     VALUE(IV_LAUFI) TYPE  LAUFI
*"     VALUE(IV_STATUS) TYPE  CHAR1
*"     VALUE(IV_FREIGEBER) TYPE  XUBNAME
*"     VALUE(IV_KOMMENTAR) TYPE  CHAR255
*"----------------------------------------------------------------------
  DATA ls_hist TYPE zfi_zf_hist.

  UPDATE zfi_zf_pruef SET status    = iv_status
                          freigeber = iv_freigeber
                          frdat     = sy-datum
    WHERE laufd = iv_laufd
      AND laufi = iv_laufi.
  IF sy-subrc <> 0.
*   Verbuchungsabbruch - Satz wurde zwischenzeitlich geloescht
    MESSAGE a020 WITH iv_laufd iv_laufi.
  ENDIF.

  ls_hist-laufd     = iv_laufd.
  ls_hist-laufi     = iv_laufi.
  ls_hist-status    = iv_status.
  ls_hist-uname     = iv_freigeber.
  ls_hist-datum     = sy-datum.
  ls_hist-uzeit     = sy-uzeit.
  ls_hist-kommentar = iv_kommentar.
  INSERT zfi_zf_hist FROM ls_hist.
ENDFUNCTION.
