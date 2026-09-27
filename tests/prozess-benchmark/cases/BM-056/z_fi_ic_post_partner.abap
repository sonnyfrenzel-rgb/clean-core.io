FUNCTION z_fi_ic_post_partner.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_BUKRS) TYPE  BUKRS
*"     VALUE(IV_PARTNER) TYPE  BUKRS
*"     VALUE(IV_SERVID) TYPE  ZFI_IC_SERVID
*"     VALUE(IV_BUDAT) TYPE  BUDAT
*"     VALUE(IV_AMOUNT) TYPE  WRBTR
*"     VALUE(IV_WAERS) TYPE  WAERS
*"     VALUE(IV_XBLNR) TYPE  XBLNR1
*"     VALUE(IV_SGTXT) TYPE  SGTXT OPTIONAL
*"     VALUE(IV_TEST) TYPE  XFELD DEFAULT SPACE
*"  EXPORTING
*"     VALUE(EV_BELNR) TYPE  BELNR_D
*"  TABLES
*"      ET_RETURN STRUCTURE  BAPIRET2
*"----------------------------------------------------------------------
* Funktionsgruppe ZFI_IC_RFC (remotefaehig) - laeuft im PARTNERsystem.
* Bucht die Eingangsseite der IC-Leistung: Aufwand an IC-Kreditor.
* 2011-05 HBR  angelegt
* 2017-02 MSC  Doppelbuchungsschutz ueber ZFI_IC_INBOX

  DATA: ls_inbox  TYPE zfi_ic_inbox,
        ls_map    TYPE zfi_ic_accmap,
        ls_header TYPE bapiache09,
        lt_gl     TYPE STANDARD TABLE OF bapiacgl09,
        lt_ap     TYPE STANDARD TABLE OF bapiacap09,
        lt_curr   TYPE STANDARD TABLE OF bapiaccr09,
        lv_objkey TYPE bapiache09-obj_key.

  CLEAR ev_belnr.
  REFRESH et_return.

* Leistung schon eingegangen? (Wiederholungslauf im Sender)
  SELECT SINGLE * FROM zfi_ic_inbox INTO ls_inbox
    WHERE bukrs   = iv_bukrs
      AND partner = iv_partner
      AND servid  = iv_servid.
  IF sy-subrc = 0.
    ev_belnr = ls_inbox-belnr.
    et_return-type       = 'S'.
    et_return-id         = 'ZFI_IC'.
    et_return-number     = '040'.
    et_return-message_v1 = iv_servid.
    et_return-message_v2 = ls_inbox-belnr.
    et_return-message    = |Leistung { iv_servid } bereits gebucht ({ ls_inbox-belnr })|.
    APPEND et_return.
    RETURN.
  ENDIF.

* Kontenfindung je sendender Gesellschaft
  SELECT SINGLE * FROM zfi_ic_accmap INTO ls_map
    WHERE bukrs   = iv_bukrs
      AND partner = iv_partner.
  IF sy-subrc <> 0.
    et_return-type       = 'E'.
    et_return-id         = 'ZFI_IC'.
    et_return-number     = '041'.
    et_return-message_v1 = iv_partner.
    et_return-message    = |Keine IC-Kontenfindung fuer Partner { iv_partner }|.
    APPEND et_return.
    RETURN.
  ENDIF.

  ls_header-bus_act    = 'RFBU'.
  ls_header-username   = sy-uname.
  ls_header-comp_code  = iv_bukrs.
  ls_header-doc_date   = iv_budat.
  ls_header-pstng_date = iv_budat.
  ls_header-doc_type   = ls_map-blart.
  ls_header-ref_doc_no = iv_xblnr.           " lokale Belegnr. des Senders
  ls_header-header_txt = |IC { iv_partner } { iv_servid }|.

* Pos. 1: IC-Aufwand auf Kostenstelle, Partnergesellschaft = Sender
  APPEND VALUE #( itemno_acc = 1 gl_account = ls_map-hkont_aufw comp_code = iv_bukrs
                  costcenter = ls_map-kostl trade_id = iv_partner
                  item_text = iv_sgtxt ) TO lt_gl.
* Pos. 2: IC-Kreditor im Haben
  APPEND VALUE #( itemno_acc = 2 vendor_no = ls_map-lifnr comp_code = iv_bukrs
                  item_text = iv_sgtxt ) TO lt_ap.

  APPEND VALUE #( itemno_acc = 1 curr_type = '00' currency = iv_waers
                  amt_doccur = iv_amount ) TO lt_curr.
  APPEND VALUE #( itemno_acc = 2 curr_type = '00' currency = iv_waers
                  amt_doccur = - iv_amount ) TO lt_curr.

  IF iv_test = abap_true.
    CALL FUNCTION 'BAPI_ACC_DOCUMENT_CHECK'
      EXPORTING
        documentheader = ls_header
      TABLES
        accountgl      = lt_gl
        accountpayable = lt_ap
        currencyamount = lt_curr
        return         = et_return.
  ELSE.
    CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'
      EXPORTING
        documentheader = ls_header
      IMPORTING
        obj_key        = lv_objkey
      TABLES
        accountgl      = lt_gl
        accountpayable = lt_ap
        currencyamount = lt_curr
        return         = et_return.

    READ TABLE et_return WITH KEY type = 'E' TRANSPORTING NO FIELDS.
    IF sy-subrc = 0.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    ELSE.
      ev_belnr = lv_objkey(10).
*     Eingangsvermerk im selben LUW wie der Beleg
      ls_inbox-bukrs   = iv_bukrs.
      ls_inbox-partner = iv_partner.
      ls_inbox-servid  = iv_servid.
      ls_inbox-belnr   = ev_belnr.
      ls_inbox-gjahr   = iv_budat(4).        " GJ = Kalenderjahr im Konzern
      ls_inbox-wrbtr   = iv_amount.
      ls_inbox-waers   = iv_waers.
      ls_inbox-ernam   = sy-uname.
      ls_inbox-erdat   = sy-datum.
      INSERT zfi_ic_inbox FROM ls_inbox.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = abap_true.
    ENDIF.
  ENDIF.

ENDFUNCTION.
