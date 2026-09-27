FUNCTION z_fi_payrel_update.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein:
*"
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_LAUFD) TYPE  LAUFD
*"     VALUE(IV_LAUFI) TYPE  LAUFI
*"     VALUE(IV_UNAME) TYPE  SYUNAME
*"  TABLES
*"      IT_PAY STRUCTURE  ZFI_S_PAYREL_UI
*"----------------------------------------------------------------------
* Fortschreibung der Freigabetabelle ZFI_PAYREL (Verbuchung V1),
* jede Sicherung zusaetzlich in der Historie ZFI_PAYREL_H

  DATA: ls_pay  TYPE zfi_s_payrel_ui,
        ls_rel  TYPE zfi_payrel,
        ls_old  TYPE zfi_payrel,
        ls_hist TYPE zfi_payrel_h,
        lt_hist TYPE STANDARD TABLE OF zfi_payrel_h,
        lv_ts   TYPE timestampl.

  GET TIME STAMP FIELD lv_ts.

  LOOP AT it_pay INTO ls_pay WHERE status <> space.
    CLEAR: ls_old, ls_rel.
    SELECT SINGLE * FROM zfi_payrel INTO ls_old
      WHERE laufd = iv_laufd
        AND laufi = iv_laufi
        AND zbukr = ls_pay-zbukr
        AND vblnr = ls_pay-vblnr.
*   endgueltig freigegeben (z. B. zweite Sitzung) - nie zuruecksetzen
    IF sy-subrc = 0 AND ls_old-status = 'F' AND ls_pay-status <> 'F'.
      MESSAGE a060(zfi_pay) WITH ls_pay-vblnr ls_old-rel2_user.
    ENDIF.

    ls_rel-mandt     = sy-mandt.
    ls_rel-laufd     = iv_laufd.
    ls_rel-laufi     = iv_laufi.
    ls_rel-zbukr     = ls_pay-zbukr.
    ls_rel-vblnr     = ls_pay-vblnr.
    ls_rel-status    = ls_pay-status.
    ls_rel-rwbtr     = ls_pay-rwbtr.
    ls_rel-waers     = ls_pay-waers.
    ls_rel-rel1_user = ls_pay-rel1_user.
    ls_rel-rel2_user = ls_pay-rel2_user.
    ls_rel-reason    = ls_pay-reason.
    ls_rel-aenam     = iv_uname.
    ls_rel-aedat     = sy-datum.
    ls_rel-aezet     = sy-uzeit.
    MODIFY zfi_payrel FROM ls_rel.

    MOVE-CORRESPONDING ls_rel TO ls_hist.
    ls_hist-tstmp = lv_ts.
    APPEND ls_hist TO lt_hist.
  ENDLOOP.

  INSERT zfi_payrel_h FROM TABLE lt_hist ACCEPTING DUPLICATE KEYS.
ENDFUNCTION.
