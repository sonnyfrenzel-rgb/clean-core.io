CLASS zcl_co_act_alloc DEFINITION PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_log,
             sender   TYPE kostl,
             lstar    TYPE lstar,
             receiver TYPE char12,
             menge    TYPE menge_d,
             status   TYPE char1,      " V verrechnet, T Test ok, E Fehler, I Info
             text     TYPE bapi_msg,
           END OF ty_log,
           tt_log TYPE STANDARD TABLE OF ty_log WITH DEFAULT KEY.
    METHODS run
      IMPORTING iv_kokrs      TYPE kokrs
                iv_gjahr      TYPE gjahr
                iv_perio      TYPE co_perio
                iv_budat      TYPE budat
                iv_test       TYPE abap_bool
      RETURNING VALUE(rt_log) TYPE tt_log.
  PRIVATE SECTION.
    TYPES: BEGIN OF ty_sum,
             skostl TYPE kostl,
             lstar  TYPE lstar,
             ekostl TYPE kostl,
             aufnr  TYPE aufnr,
             meinh  TYPE meins,
             menge  TYPE menge_d,
           END OF ty_sum.
    DATA: mv_kokrs TYPE kokrs,
          mv_gjahr TYPE gjahr,
          mv_perio TYPE co_perio,
          mt_ts    TYPE STANDARD TABLE OF zco_timesheet,
          mt_sum   TYPE STANDARD TABLE OF ty_sum.
    METHODS load.
    METHODS validate CHANGING ct_log TYPE tt_log.
ENDCLASS.

CLASS zcl_co_act_alloc IMPLEMENTATION.

  METHOD run.
    DATA: ls_hdr   TYPE bapidochdru12p,
          lt_items TYPE STANDARD TABLE OF bapiaaitm,
          lt_ret   TYPE STANDARD TABLE OF bapiret2,
          ls_ret   TYPE bapiret2,
          lv_docno TYPE co_belnr,
          ls_sum   TYPE ty_sum,
          ls_log   TYPE ty_log.

    mv_kokrs = iv_kokrs.
    mv_gjahr = iv_gjahr.
    mv_perio = iv_perio.

    load( ).
    IF mt_ts IS INITIAL.
      APPEND VALUE #( status = 'I' text = 'Keine freigegebenen Zeiten' ) TO rt_log.
      RETURN.
    ENDIF.

    validate( CHANGING ct_log = rt_log ).

*   Periode gegen parallele Verrechnung sperren
    CALL FUNCTION 'ENQUEUE_EZCO_TIMESHEET'
      EXPORTING
        kokrs          = mv_kokrs
        gjahr          = mv_gjahr
        perio          = mv_perio
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      APPEND VALUE #( status = 'E' text = |Periode gesperrt von { sy-msgv1 }| ) TO rt_log.
      RETURN.
    ENDIF.

    ls_hdr-co_area    = mv_kokrs.
    ls_hdr-docdate    = iv_budat.
    ls_hdr-postgdate  = iv_budat.
    ls_hdr-doc_hdr_tx = |Zeiterfassung { mv_perio }/{ mv_gjahr }|.
    ls_hdr-username   = sy-uname.

    LOOP AT mt_sum INTO ls_sum.
      CLEAR: lt_items, lt_ret, lv_docno, ls_ret.
      APPEND VALUE #( send_cctr  = ls_sum-skostl
                      acttype    = ls_sum-lstar
                      actvty_qty = ls_sum-menge
                      activityun = ls_sum-meinh
                      rec_cctr   = ls_sum-ekostl
                      rec_order  = ls_sum-aufnr ) TO lt_items.

      IF iv_test = abap_true.
        CALL FUNCTION 'BAPI_ACC_ACTIVITY_ALLOC_CHECK'
          EXPORTING
            doc_header = ls_hdr
          TABLES
            doc_items  = lt_items
            return     = lt_ret.
      ELSE.
        CALL FUNCTION 'BAPI_ACC_ACTIVITY_ALLOC_POST'
          EXPORTING
            doc_header = ls_hdr
          IMPORTING
            doc_no     = lv_docno
          TABLES
            doc_items  = lt_items
            return     = lt_ret.
      ENDIF.

      ls_log = VALUE #( sender   = ls_sum-skostl
                        lstar    = ls_sum-lstar
                        receiver = COND #( WHEN ls_sum-aufnr IS NOT INITIAL
                                           THEN ls_sum-aufnr
                                           ELSE ls_sum-ekostl )
                        menge    = ls_sum-menge ).

      READ TABLE lt_ret INTO ls_ret WITH KEY type = 'E'.
      IF sy-subrc = 0.
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
        ls_log-status = 'E'.
        ls_log-text   = ls_ret-message.
        IF iv_test = abap_false.
          UPDATE zco_timesheet SET status = 'E'
            WHERE kokrs  = mv_kokrs
              AND gjahr  = mv_gjahr
              AND perio  = mv_perio
              AND skostl = ls_sum-skostl
              AND lstar  = ls_sum-lstar
              AND ekostl = ls_sum-ekostl
              AND aufnr  = ls_sum-aufnr
              AND status = 'F'.
          COMMIT WORK.
        ENDIF.
      ELSEIF iv_test = abap_true.
        ls_log-status = 'T'.
        ls_log-text   = 'Pruefung ohne Fehler'.
      ELSE.
        UPDATE zco_timesheet SET status = 'V'
                                 belnr  = lv_docno
          WHERE kokrs  = mv_kokrs
            AND gjahr  = mv_gjahr
            AND perio  = mv_perio
            AND skostl = ls_sum-skostl
            AND lstar  = ls_sum-lstar
            AND ekostl = ls_sum-ekostl
            AND aufnr  = ls_sum-aufnr
            AND status = 'F'.
        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
          EXPORTING
            wait = abap_true.
        ls_log-status = 'V'.
        ls_log-text   = |CO-Beleg { lv_docno }|.
      ENDIF.
      APPEND ls_log TO rt_log.
    ENDLOOP.

    CALL FUNCTION 'DEQUEUE_EZCO_TIMESHEET'
      EXPORTING
        kokrs = mv_kokrs
        gjahr = mv_gjahr
        perio = mv_perio.
  ENDMETHOD.

  METHOD load.
*   nur vom Vorgesetzten freigegebene Zeiten (Status F)
    SELECT * FROM zco_timesheet INTO TABLE mt_ts
      WHERE kokrs  = mv_kokrs
        AND gjahr  = mv_gjahr
        AND perio  = mv_perio
        AND status = 'F'.
  ENDMETHOD.

  METHOD validate.
    DATA: ls_ts    TYPE zco_timesheet,
          ls_sum   TYPE ty_sum,
          lv_datum TYPE sy-datum,
          lv_kostl TYPE kostl,
          lv_lstar TYPE lstar.

*   Stichtag = Periodenbeginn (Periode = Kalendermonat)
    lv_datum = mv_gjahr && mv_perio+1(2) && '01'.

    LOOP AT mt_ts INTO ls_ts.
*     Sender gueltig und nicht fuer sekundaere Istkosten gesperrt
      SELECT SINGLE kostl FROM csks INTO lv_kostl
        WHERE kokrs =  mv_kokrs
          AND kostl =  ls_ts-skostl
          AND datbi >= lv_datum
          AND datab <= lv_datum
          AND bkzks =  space.
      IF sy-subrc <> 0.
        APPEND VALUE #( sender = ls_ts-skostl lstar = ls_ts-lstar menge = ls_ts-menge
                        status = 'E' text = 'Sender ungueltig oder gesperrt' ) TO ct_log.
        CONTINUE.
      ENDIF.

      SELECT SINGLE lstar FROM csla INTO lv_lstar
        WHERE kokrs =  mv_kokrs
          AND lstar =  ls_ts-lstar
          AND datbi >= lv_datum
          AND datab <= lv_datum.
      IF sy-subrc <> 0.
        APPEND VALUE #( sender = ls_ts-skostl lstar = ls_ts-lstar menge = ls_ts-menge
                        status = 'E' text = 'Leistungsart unbekannt' ) TO ct_log.
        CONTINUE.
      ENDIF.

*     Verdichtung je Sender/Leistungsart/Empfaenger
      CLEAR ls_sum.
      ls_sum-skostl = ls_ts-skostl.
      ls_sum-lstar  = ls_ts-lstar.
      ls_sum-ekostl = ls_ts-ekostl.
      ls_sum-aufnr  = ls_ts-aufnr.
      ls_sum-meinh  = ls_ts-meinh.
      ls_sum-menge  = ls_ts-menge.
      COLLECT ls_sum INTO mt_sum.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
