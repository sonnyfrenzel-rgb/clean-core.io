*&---------------------------------------------------------------------*
*&  Include  ZFI_IC_SETTLE_F02
*&---------------------------------------------------------------------*
*&  Buchungen: lokal (Ausgangsseite), Partner (RFC), Statusfortschreibung
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  POST_LOCAL
*&---------------------------------------------------------------------*
*       IC-Ausgangsrechnung: IC-Debitor an IC-Erloes
*----------------------------------------------------------------------*
FORM post_local USING    is_serv     TYPE zfi_ic_serv
                         is_dest     TYPE zfi_ic_dest
                         iv_amount_f TYPE wrbtr
                         iv_amount_l TYPE wrbtr
                CHANGING cv_belnr    TYPE belnr_d
                         cv_ok       TYPE abap_bool
                         cv_text     TYPE char80.
  DATA: ls_header TYPE bapiache09,
        lt_gl     TYPE STANDARD TABLE OF bapiacgl09,
        lt_ar     TYPE STANDARD TABLE OF bapiacar09,
        lt_curr   TYPE STANDARD TABLE OF bapiaccr09,
        lt_return TYPE STANDARD TABLE OF bapiret2,
        ls_return TYPE bapiret2,
        lv_objkey TYPE bapiache09-obj_key.

  ls_header-bus_act    = 'RFBU'.
  ls_header-username   = sy-uname.
  ls_header-comp_code  = is_serv-bukrs.
  ls_header-doc_date   = p_budat.
  ls_header-pstng_date = p_budat.
  ls_header-doc_type   = gc_blart.
  ls_header-ref_doc_no = is_serv-servid.
  ls_header-header_txt = |IC { is_serv-pbukrs } { p_gjahr }/{ p_monat }|.

* Pos. 1: IC-Debitor (Partnergesellschaft) im Soll
  APPEND VALUE #( itemno_acc = 1 customer = is_dest-kunnr comp_code = is_serv-bukrs
                  item_text = is_serv-sgtxt ) TO lt_ar.
* Pos. 2: IC-Erloes im Haben, Partnergesellschaft fuer Konsolidierung
  APPEND VALUE #( itemno_acc = 2 gl_account = is_dest-hkont_erl comp_code = is_serv-bukrs
                  item_text = is_serv-sgtxt trade_id = is_serv-pbukrs ) TO lt_gl.

* Betraege in Belegwaehrung (00) und Hauswaehrung (10)
  APPEND VALUE #( itemno_acc = 1 curr_type = '00' currency = is_serv-waers
                  amt_doccur = iv_amount_f ) TO lt_curr.
  APPEND VALUE #( itemno_acc = 1 curr_type = '10' currency = gv_waers_l
                  amt_doccur = iv_amount_l ) TO lt_curr.
  APPEND VALUE #( itemno_acc = 2 curr_type = '00' currency = is_serv-waers
                  amt_doccur = - iv_amount_f ) TO lt_curr.
  APPEND VALUE #( itemno_acc = 2 curr_type = '10' currency = gv_waers_l
                  amt_doccur = - iv_amount_l ) TO lt_curr.

  IF p_test = abap_true.
    CALL FUNCTION 'BAPI_ACC_DOCUMENT_CHECK'
      EXPORTING
        documentheader    = ls_header
      TABLES
        accountgl         = lt_gl
        accountreceivable = lt_ar
        currencyamount    = lt_curr
        return            = lt_return.
  ELSE.
    CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'
      EXPORTING
        documentheader    = ls_header
      IMPORTING
        obj_key           = lv_objkey
      TABLES
        accountgl         = lt_gl
        accountreceivable = lt_ar
        currencyamount    = lt_curr
        return            = lt_return.
  ENDIF.

  READ TABLE lt_return INTO ls_return WITH KEY type = 'E'.
  IF sy-subrc = 0.
    cv_ok   = abap_false.
    cv_text = ls_return-message.
    APPEND VALUE #( msgty = 'E' msgid = ls_return-id msgno = ls_return-number
                    msgv1 = ls_return-message_v1 msgv2 = ls_return-message_v2
                    msgv3 = ls_return-message_v3 msgv4 = ls_return-message_v4 ) TO gt_msg.
    IF p_test IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    ENDIF.
  ELSEIF p_test IS INITIAL.
*   erst der Commit schreibt den Beleg fort
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    cv_belnr = lv_objkey(10).
    cv_ok    = abap_true.
    APPEND VALUE #( msgty = 'S' msgid = 'ZFI_IC' msgno = '030'
                    msgv1 = is_serv-servid msgv2 = cv_belnr ) TO gt_msg.
  ELSE.
    cv_ok = abap_true.                 " Testlauf: Beleg waere buchbar
  ENDIF.
ENDFORM.                    "post_local

*&---------------------------------------------------------------------*
*&      Form  POST_PARTNER
*&---------------------------------------------------------------------*
*       Eingangsseite beim Partner buchen (synchroner RFC)
*----------------------------------------------------------------------*
FORM post_partner USING    is_serv     TYPE zfi_ic_serv
                           is_dest     TYPE zfi_ic_dest
                           iv_amount_f TYPE wrbtr
                           iv_belnr_l  TYPE belnr_d
                  CHANGING cv_belnr_p  TYPE belnr_d
                           cv_ok       TYPE abap_bool
                           cv_text     TYPE char80.
  DATA: lt_return TYPE STANDARD TABLE OF bapiret2,
        ls_return TYPE bapiret2,
        lv_rfcmsg TYPE char80.

  cv_ok = abap_false.

* 2014: Versuch asynchron - wieder ausgebaut, Status nicht nachvollziehbar
*  CALL FUNCTION 'Z_FI_IC_POST_PARTNER'
*    STARTING NEW TASK 'ZIC'
*    DESTINATION is_dest-rfcdest
*    PERFORMING partner_back ON END OF TASK
*    EXPORTING
*      iv_bukrs = is_serv-pbukrs.

  CALL FUNCTION 'Z_FI_IC_POST_PARTNER'
    DESTINATION is_dest-rfcdest
    EXPORTING
      iv_bukrs              = is_serv-pbukrs
      iv_partner            = is_serv-bukrs
      iv_servid             = is_serv-servid
      iv_budat              = p_budat
      iv_amount             = iv_amount_f
      iv_waers              = is_serv-waers
      iv_xblnr              = iv_belnr_l
      iv_sgtxt              = is_serv-sgtxt
      iv_test               = p_test
    IMPORTING
      ev_belnr              = cv_belnr_p
    TABLES
      et_return             = lt_return
    EXCEPTIONS
      system_failure        = 1  MESSAGE lv_rfcmsg
      communication_failure = 2  MESSAGE lv_rfcmsg
      OTHERS                = 3.

  CASE sy-subrc.
    WHEN 0.
      READ TABLE lt_return INTO ls_return WITH KEY type = 'E'.
      IF sy-subrc = 0.
        cv_text = ls_return-message.
        APPEND VALUE #( msgty = 'E' msgid = 'ZFI_IC' msgno = '024'
                        msgv1 = is_serv-servid msgv2 = is_serv-pbukrs
                        msgv3 = ls_return-message(50) ) TO gt_msg.
      ELSE.
        cv_ok = abap_true.
      ENDIF.
    WHEN 1 OR 2.
*     Verbindung abgebrochen / Partnersystem nicht erreichbar
      cv_text = lv_rfcmsg.
      APPEND VALUE #( msgty = 'E' msgid = 'ZFI_IC' msgno = '025'
                      msgv1 = is_dest-rfcdest msgv2 = lv_rfcmsg(50) ) TO gt_msg.
*     Verbindung zuruecksetzen, sonst haengt der naechste Aufruf
      CALL FUNCTION 'RFC_CONNECTION_CLOSE'
        EXPORTING
          destination          = is_dest-rfcdest
        EXCEPTIONS
          destination_not_open = 1
          OTHERS               = 2.
    WHEN OTHERS.
      cv_text = 'Partnerbuchung: unbekannter Fehler'(e01).
  ENDCASE.
ENDFORM.                    "post_partner

*&---------------------------------------------------------------------*
*&      Form  UPDATE_STATUS
*&---------------------------------------------------------------------*
*       Status und Belegnummern an der Leistung fortschreiben
*----------------------------------------------------------------------*
FORM update_status USING is_serv    TYPE zfi_ic_serv
                         iv_status  TYPE zfi_ic_status
                         iv_belnr_l TYPE belnr_d
                         iv_belnr_p TYPE belnr_d.

* Testlauf schreibt nichts fort
  CHECK p_test IS INITIAL.

  UPDATE zfi_ic_serv
     SET status  = iv_status
         belnr_l = iv_belnr_l
         belnr_p = iv_belnr_p
         aedat   = sy-datum
         aenam   = sy-uname
   WHERE bukrs  = is_serv-bukrs
     AND pbukrs = is_serv-pbukrs
     AND servid = is_serv-servid.
  IF sy-subrc = 0.
    COMMIT WORK.
  ELSE.
    ROLLBACK WORK.
    APPEND VALUE #( msgty = 'E' msgid = 'ZFI_IC' msgno = '026'
                    msgv1 = is_serv-servid msgv2 = iv_status ) TO gt_msg.
  ENDIF.
ENDFORM.                    "update_status
