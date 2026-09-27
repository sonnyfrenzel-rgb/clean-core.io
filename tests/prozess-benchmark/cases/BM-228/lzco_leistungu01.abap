FUNCTION z_co_leistung_verrechnen.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_KOKRS) TYPE  KOKRS
*"     VALUE(IV_GJAHR) TYPE  GJAHR
*"     VALUE(IV_PERIO) TYPE  POPER
*"     VALUE(IV_TESTRUN) TYPE  XFELD DEFAULT 'X'
*"  EXPORTING
*"     VALUE(EV_BELNR) TYPE  CO_BELNR
*"  TABLES
*"      ET_RETURN STRUCTURE  BAPIRET2
*"  EXCEPTIONS
*"      GESPERRT
*"      KEINE_DATEN
*"----------------------------------------------------------------------
  DATA: ls_leist TYPE gty_leist,
        ls_item  TYPE bapiaaitm,
        lv_ok    TYPE xfeld,
        lv_docno TYPE co_belnr.

  CLEAR: gt_return, gt_items, ev_belnr.

* Sperre auf Z-Tabelle, damit der Job nicht doppelt laeuft
  CALL FUNCTION 'ENQUEUE_EZCO_IT_LEIST'
    EXPORTING
      kokrs          = iv_kokrs
      gjahr          = iv_gjahr
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    MESSAGE e001 WITH sy-msgv1 RAISING gesperrt.
  ENDIF.

  SELECT * FROM zco_it_leist INTO CORRESPONDING FIELDS OF TABLE gt_leist
    WHERE kokrs  = iv_kokrs
      AND gjahr  = iv_gjahr
      AND perio  = iv_perio
      AND status = gc_offen.
  IF sy-subrc <> 0.
    CALL FUNCTION 'DEQUEUE_EZCO_IT_LEIST'
      EXPORTING
        kokrs = iv_kokrs
        gjahr = iv_gjahr.
    RAISE keine_daten.
  ENDIF.

  LOOP AT gt_leist INTO ls_leist.
    PERFORM kostl_pruefen USING ls_leist CHANGING lv_ok.
    IF lv_ok IS INITIAL.
      CONTINUE.
    ENDIF.
    PERFORM lstar_pruefen USING ls_leist CHANGING lv_ok.
    CHECK lv_ok = 'X'.

    CLEAR ls_item.
    ls_item-send_cctr  = ls_leist-skostl.
    ls_item-acttype    = ls_leist-lstar.
    ls_item-rec_cctr   = ls_leist-ekostl.
    ls_item-actvty_qty = ls_leist-menge.
    ls_item-activityun = ls_leist-meinh.
    APPEND ls_item TO gt_items.
  ENDLOOP.

  IF gt_items IS INITIAL.
    PERFORM return_add USING 'E' '010' space.
    et_return[] = gt_return[].
    CALL FUNCTION 'DEQUEUE_EZCO_IT_LEIST'
      EXPORTING
        kokrs = iv_kokrs
        gjahr = iv_gjahr.
    RETURN.
  ENDIF.

  gs_header-co_area    = iv_kokrs.
  gs_header-docdate    = sy-datum.
  gs_header-postgdate  = sy-datum.
  gs_header-doc_hdr_tx = 'IT-Leistungsverrechnung'.
  gs_header-username   = sy-uname.

  CALL FUNCTION 'BAPI_ACC_ACTIVITY_ALLOC_POST'
    EXPORTING
      doc_header      = gs_header
      ignore_warnings = 'X'
    IMPORTING
      doc_no          = lv_docno
    TABLES
      doc_items       = gt_items
      return          = et_return.

  LOOP AT et_return TRANSPORTING NO FIELDS WHERE type CA 'EAX'.
    EXIT.
  ENDLOOP.
  IF sy-subrc = 0.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    UPDATE zco_it_leist SET status = gc_fehler
      WHERE kokrs  = iv_kokrs
        AND gjahr  = iv_gjahr
        AND perio  = iv_perio
        AND status = gc_offen.
    COMMIT WORK.
  ELSEIF iv_testrun = 'X'.
*   Testlauf: BAPI hat nur geprueft (kein Commit)
    PERFORM return_add USING 'S' '020' space.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
    ev_belnr = lv_docno.
    UPDATE zco_it_leist SET status = gc_verrechnet
                            belnr  = lv_docno
      WHERE kokrs  = iv_kokrs
        AND gjahr  = iv_gjahr
        AND perio  = iv_perio
        AND status = gc_offen.
    COMMIT WORK.
    PERFORM return_add USING 'S' '021' lv_docno.
  ENDIF.

  APPEND LINES OF gt_return TO et_return.

  CALL FUNCTION 'DEQUEUE_EZCO_IT_LEIST'
    EXPORTING
      kokrs = iv_kokrs
      gjahr = iv_gjahr.
ENDFUNCTION.
