*----------------------------------------------------------------------*
* Workflow-Objekt "Bankverbindung Kreditor" (WS90000012)
* Schlüssel: Kreditor (10) + Buchungskreis (4)
* Schritte: Zahlsperre setzen -> Freigabe (Agentenregel 90000031)
*           -> Freigeben / Ablehnen -> Antragsteller informieren
*----------------------------------------------------------------------*
CLASS zcl_wf_vendor_bank DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_workflow.

    DATA mv_lifnr TYPE lifnr READ-ONLY.
    DATA mv_bukrs TYPE bukrs READ-ONLY.

    METHODS block_payment
      RAISING
        zcx_wf_bank.
    METHODS approve
      IMPORTING
        iv_approver TYPE syuname
      RAISING
        zcx_wf_bank.
    METHODS reject
      IMPORTING
        iv_approver TYPE syuname
        iv_reason   TYPE string
      RAISING
        zcx_wf_bank.
    METHODS notify_requester
      IMPORTING
        iv_result    TYPE char1
        iv_requester TYPE syuname.

  PRIVATE SECTION.
    DATA ms_lpor TYPE sibflpor.
    METHODS last_change
      RETURNING
        VALUE(rs_hdr) TYPE cdhdr.
    METHODS restore_bank_data
      RAISING
        zcx_wf_bank.
ENDCLASS.



CLASS zcl_wf_vendor_bank IMPLEMENTATION.

  METHOD bi_persistent~find_by_lpor.
    DATA lo_obj TYPE REF TO zcl_wf_vendor_bank.
    CREATE OBJECT lo_obj.
    lo_obj->mv_lifnr = lpor-instid(10).
    lo_obj->mv_bukrs = lpor-instid+10(4).
    lo_obj->ms_lpor  = lpor.
    result = lo_obj.
  ENDMETHOD.

  METHOD bi_persistent~lpor.
    result = ms_lpor.
  ENDMETHOD.

  METHOD bi_persistent~refresh.
  ENDMETHOD.

  METHOD bi_object~default_attribute_value.
    result = REF #( mv_lifnr ).
  ENDMETHOD.

  METHOD bi_object~execute_default_method.
  ENDMETHOD.

  METHOD bi_object~release.
  ENDMETHOD.


  METHOD last_change.
    DATA lt_hdr TYPE STANDARD TABLE OF cdhdr.

    SELECT * FROM cdhdr INTO TABLE lt_hdr
      UP TO 1 ROWS
      WHERE objectclas = 'KRED'
        AND objectid   = mv_lifnr
      ORDER BY udate DESCENDING utime DESCENDING.
    READ TABLE lt_hdr INTO rs_hdr INDEX 1.
  ENDMETHOD.


  METHOD block_payment.
    DATA: lv_zahls TYPE lfb1-zahls,
          ls_hist  TYPE zwf_bank_hist.

    SELECT SINGLE zahls FROM lfb1 INTO lv_zahls
      WHERE lifnr = mv_lifnr
        AND bukrs = mv_bukrs.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_wf_bank
        EXPORTING
          textid = zcx_wf_bank=>vendor_not_in_bukrs.
    ENDIF.
    IF lv_zahls = 'B'.
      RETURN.                               "bereits gesperrt
    ENDIF.

*   Zahlsperre B bis zur Freigabe, bisherige Sperre merken
    UPDATE lfb1 SET zahls = 'B'
      WHERE lifnr = mv_lifnr
        AND bukrs = mv_bukrs.

    ls_hist-lifnr     = mv_lifnr.
    ls_hist-bukrs     = mv_bukrs.
    ls_hist-datum     = sy-datum.
    ls_hist-uzeit     = sy-uzeit.
    ls_hist-action    = 'BLOCK'.
    ls_hist-old_zahls = lv_zahls.
    ls_hist-uname     = sy-uname.
    INSERT zwf_bank_hist FROM ls_hist.
  ENDMETHOD.


  METHOD approve.
    DATA: ls_hdr  TYPE cdhdr,
          lt_hist TYPE STANDARD TABLE OF zwf_bank_hist,
          ls_hist TYPE zwf_bank_hist.

*   Vier-Augen-Prinzip: der Änderer darf nicht selbst freigeben
    ls_hdr = last_change( ).
    IF ls_hdr-username = iv_approver.
      RAISE EXCEPTION TYPE zcx_wf_bank
        EXPORTING
          textid = zcx_wf_bank=>same_user.
    ENDIF.

*   Zahlsperre auf den Stand vor der Sperre zurücksetzen
    SELECT * FROM zwf_bank_hist INTO TABLE lt_hist
      UP TO 1 ROWS
      WHERE lifnr  = mv_lifnr
        AND bukrs  = mv_bukrs
        AND action = 'BLOCK'
      ORDER BY datum DESCENDING uzeit DESCENDING.
    READ TABLE lt_hist INTO ls_hist INDEX 1.
    UPDATE lfb1 SET zahls = ls_hist-old_zahls
      WHERE lifnr = mv_lifnr
        AND bukrs = mv_bukrs.

    CLEAR ls_hist.
    ls_hist-lifnr  = mv_lifnr.
    ls_hist-bukrs  = mv_bukrs.
    ls_hist-datum  = sy-datum.
    ls_hist-uzeit  = sy-uzeit.
    ls_hist-action = 'APPROVE'.
    ls_hist-uname  = iv_approver.
    INSERT zwf_bank_hist FROM ls_hist.
  ENDMETHOD.


  METHOD reject.
    DATA ls_hist TYPE zwf_bank_hist.

    restore_bank_data( ).

*   Kreditor zentral zum Buchen sperren; Zahlsperre bleibt bestehen
    UPDATE lfa1 SET sperr = 'X'
      WHERE lifnr = mv_lifnr.

    ls_hist-lifnr  = mv_lifnr.
    ls_hist-bukrs  = mv_bukrs.
    ls_hist-datum  = sy-datum.
    ls_hist-uzeit  = sy-uzeit.
    ls_hist-action = 'REJECT'.
    ls_hist-uname  = iv_approver.
    ls_hist-reason = iv_reason.
    INSERT zwf_bank_hist FROM ls_hist.
  ENDMETHOD.


  METHOD restore_bank_data.
    DATA: ls_hdr   TYPE cdhdr,
          lt_pos   TYPE STANDARD TABLE OF cdpos,
          ls_pos   TYPE cdpos,
          ls_lfbk  TYPE lfbk,
          lv_banks TYPE lfbk-banks,
          lv_bankl TYPE lfbk-bankl,
          lv_bankn TYPE lfbk-bankn.
    FIELD-SYMBOLS <lv_field> TYPE any.

    ls_hdr = last_change( ).
    SELECT * FROM cdpos INTO TABLE lt_pos
      WHERE objectclas = 'KRED'
        AND objectid   = mv_lifnr
        AND changenr   = ls_hdr-changenr
        AND tabname    = 'LFBK'.

    LOOP AT lt_pos INTO ls_pos.
*     Tabellenschlüssel LFBK: MANDT(3) LIFNR(10) BANKS(3) BANKL(15) BANKN(18)
      lv_banks = ls_pos-tabkey+13(3).
      lv_bankl = ls_pos-tabkey+16(15).
      lv_bankn = ls_pos-tabkey+31(18).
      CASE ls_pos-chngind.
        WHEN 'I'.
*         neu angelegte Bankverbindung wieder entfernen
          DELETE FROM lfbk
            WHERE lifnr = mv_lifnr
              AND banks = lv_banks
              AND bankl = lv_bankl
              AND bankn = lv_bankn.
        WHEN 'D'.
*         gelöschte Verbindung ist aus CDPOS nicht rekonstruierbar
          RAISE EXCEPTION TYPE zcx_wf_bank
            EXPORTING
              textid = zcx_wf_bank=>manual_restore.
        WHEN 'U'.
          SELECT SINGLE * FROM lfbk INTO ls_lfbk
            WHERE lifnr = mv_lifnr
              AND banks = lv_banks
              AND bankl = lv_bankl
              AND bankn = lv_bankn.
          ASSIGN COMPONENT ls_pos-fname OF STRUCTURE ls_lfbk TO <lv_field>.
          IF sy-subrc = 0.
            <lv_field> = ls_pos-value_old.
            MODIFY lfbk FROM ls_lfbk.
          ENDIF.
      ENDCASE.
    ENDLOOP.
  ENDMETHOD.


  METHOD notify_requester.
    DATA: ls_doc  TYPE sodocchgi1,
          lt_body TYPE STANDARD TABLE OF solisti1,
          ls_body TYPE solisti1,
          lt_rcv  TYPE STANDARD TABLE OF somlreci1,
          ls_rcv  TYPE somlreci1.

    IF iv_result = 'A'.
      ls_doc-obj_descr = |Bankverbindung Kreditor { mv_lifnr } freigegeben|.
    ELSE.
      ls_doc-obj_descr = |Bankverbindung Kreditor { mv_lifnr } abgelehnt|.
    ENDIF.
    ls_body-line = |Kreditor { mv_lifnr }, Buchungskreis { mv_bukrs }|.
    APPEND ls_body TO lt_body.

    ls_rcv-receiver = iv_requester.
    ls_rcv-rec_type = 'B'.                 "SAP-Benutzer
    APPEND ls_rcv TO lt_rcv.

    CALL FUNCTION 'SO_NEW_DOCUMENT_SEND_API1'
      EXPORTING
        document_data  = ls_doc
        document_type  = 'RAW'
      TABLES
        object_content = lt_body
        receivers      = lt_rcv
      EXCEPTIONS
        OTHERS         = 1.
  ENDMETHOD.

ENDCLASS.
