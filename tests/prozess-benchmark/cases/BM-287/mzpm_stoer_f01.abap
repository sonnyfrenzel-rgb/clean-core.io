*&---------------------------------------------------------------------*
*&  Include           MZPM_STOER_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  MELDUNG_ANLEGEN
*&---------------------------------------------------------------------*
FORM meldung_anlegen.

  DATA: ls_header  TYPE bapi2080_nothdri,
        ls_hdr_exp TYPE bapi2080_nothdre,
        ls_hdr_sav TYPE bapi2080_nothdre,
        lt_item    TYPE STANDARD TABLE OF bapi2080_notitemi,
        ls_item    TYPE bapi2080_notitemi,
        lt_return  TYPE STANDARD TABLE OF bapiret2,
        ls_return  TYPE bapiret2.

  ls_header-equipment    = gs_meld-equnr.
  ls_header-short_text   = gs_meld-qmtxt.
  ls_header-priority     = gs_meld-priok.
  ls_header-reportedby   = sy-uname.
  ls_header-notif_date   = sy-datum.
  ls_header-notiftime    = sy-uzeit.
  ls_header-breakdown    = gs_meld-ausfall.
  ls_header-strmlfrmdate = sy-datum.
  ls_header-strmlfrmtime = sy-uzeit.

  ls_item-item_key     = '0001'.
  ls_item-item_sort_no = '0001'.
  ls_item-d_codegrp    = gs_meld-fegrp.
  ls_item-d_code       = gs_meld-fecod.
  ls_item-dl_codegrp   = gs_meld-otgrp.
  ls_item-dl_code      = gs_meld-oteil.
  APPEND ls_item TO lt_item.

  CALL FUNCTION 'BAPI_ALM_NOTIF_CREATE'
    EXPORTING
      notif_type         = gs_meld-qmart
      notifheader        = ls_header
    IMPORTING
      notifheader_export = ls_hdr_exp
    TABLES
      notitem            = lt_item
      return             = lt_return.

  LOOP AT lt_return INTO ls_return WHERE type CA 'EA'.
    PERFORM log_msg USING 'E' '020' ls_return-message.
    MESSAGE ls_return-message TYPE 'S' DISPLAY LIKE 'E'.
    RETURN.
  ENDLOOP.

  CALL FUNCTION 'BAPI_ALM_NOTIF_SAVE'
    EXPORTING
      number      = ls_hdr_exp-notif_no
    IMPORTING
      notifheader = ls_hdr_sav
    TABLES
      return      = lt_return.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.

* PERFORM log_msg USING 'S' '011' ls_hdr_sav-notif_no.  "Erfolg nicht loggen
  MESSAGE s012 WITH ls_hdr_sav-notif_no.        "Meldung & angelegt
  CLEAR gs_meld.
  LEAVE TO SCREEN 0100.

ENDFORM.                    " MELDUNG_ANLEGEN

*&---------------------------------------------------------------------*
*&      Form  LOG_MSG  - nur Protokoll, keine Prozesswirkung
*&---------------------------------------------------------------------*
FORM log_msg USING iv_type TYPE symsgty
                   iv_no   TYPE symsgno
                   iv_v1   TYPE any.

  DATA ls_msg TYPE bal_s_msg.

  IF gv_log IS INITIAL.
    RETURN.                                 "Log nicht aktiv (Customizing)
  ENDIF.

  ls_msg-msgty = iv_type.
  ls_msg-msgid = 'ZPM_ST'.
  ls_msg-msgno = iv_no.
  ls_msg-msgv1 = iv_v1.
  CALL FUNCTION 'BAL_LOG_MSG_ADD'
    EXPORTING
      i_log_handle = gv_log
      i_s_msg      = ls_msg
    EXCEPTIONS
      OTHERS       = 1.

ENDFORM.                    " LOG_MSG
