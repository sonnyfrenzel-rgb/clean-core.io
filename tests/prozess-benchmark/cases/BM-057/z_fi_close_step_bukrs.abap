FUNCTION z_fi_close_step_bukrs.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_BUKRS) TYPE  BUKRS
*"     VALUE(IV_GJAHR) TYPE  GJAHR
*"     VALUE(IV_MONAT) TYPE  POPER
*"  EXPORTING
*"     VALUE(EV_RC) TYPE  SYSUBRC
*"     VALUE(EV_MSG) TYPE  BAPI_MSG
*"----------------------------------------------------------------------
* RFC-faehig, parallel gerufen aus ZFI_CLOSE_RUN (Schritttyp 'P').
* Prueft, ob die als Nullkonto gepflegten Verrechnungskonten
* (WE/RE, Geldtransit, Lohnverrechnung) zum Periodenende ausgeglichen
* sind.
*----------------------------------------------------------------------*
  DATA: lt_hkont TYPE STANDARD TABLE OF hkont,
        lv_hkont TYPE hkont,
        lv_monat TYPE monat,
        lv_shkzg TYPE shkzg,
        lv_dmbtr TYPE dmbtr,
        lv_saldo TYPE dmbtr.

  CLEAR: ev_rc, ev_msg.
  lv_monat = iv_monat+1(2).   "POPER 3-stellig -> MONAT 2-stellig

  SELECT hkont FROM zfi_close_acct INTO TABLE lt_hkont
    WHERE bukrs   = iv_bukrs
      AND chktype = 'NULL'.

  LOOP AT lt_hkont INTO lv_hkont.
    CLEAR lv_saldo.
*   offene Posten des Sachkontos bis einschliesslich Periode
    SELECT shkzg dmbtr FROM bsis INTO (lv_shkzg, lv_dmbtr)
      WHERE bukrs = iv_bukrs
        AND hkont = lv_hkont
        AND gjahr = iv_gjahr
        AND monat <= lv_monat.
      lv_saldo = lv_saldo + COND dmbtr( WHEN lv_shkzg = 'H' THEN - lv_dmbtr
                                        ELSE lv_dmbtr ).
    ENDSELECT.
    IF lv_saldo <> 0.
      ev_rc  = 4.
      ev_msg = |{ iv_bukrs }: Konto { lv_hkont } nicht ausgeglichen ({ lv_saldo })|.
      EXIT.
    ENDIF.
  ENDLOOP.

* IF ev_rc = 0. ev_msg = 'OK'. ENDIF.
  ev_msg = COND #( WHEN ev_rc = 0 THEN |{ iv_bukrs }: Verrechnungskonten ausgeglichen| ELSE ev_msg ).

ENDFUNCTION.
