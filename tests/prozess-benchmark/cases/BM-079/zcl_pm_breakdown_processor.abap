CLASS zcl_pm_breakdown_processor DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: BEGIN OF ty_notif,
             qmnum TYPE qmnum,
             qmart TYPE qmart,
             priok TYPE priok,
             qmtxt TYPE qmtxt,
             aufnr TYPE aufnr,
             equnr TYPE equnr,
             iwerk TYPE iwerk,
             ingrp TYPE ingrp,
           END OF ty_notif.

    "! Stoermeldung M2/Prio 1 in einen IH-Auftrag ueberfuehren
    METHODS process
      IMPORTING iv_qmnum       TYPE qmnum
      RETURNING VALUE(rv_text) TYPE string
      RAISING   zcx_pm_breakdown.

    "! Rueckgemeldete Stoerauftraege technisch abschliessen
    METHODS complete_confirmed
      IMPORTING iv_iwerk        TYPE iwerk
      RETURNING VALUE(rv_count) TYPE i.

    METHODS constructor
      IMPORTING iv_rfcdest TYPE rfcdest DEFAULT 'CMMS_PROD'.

  PRIVATE SECTION.
    CONSTANTS: c_auart TYPE aufart VALUE 'PM01',
               c_steus TYPE steus  VALUE 'PM01'.

    DATA mv_rfcdest TYPE rfcdest.

    METHODS read_notification
      IMPORTING iv_qmnum        TYPE qmnum
      RETURNING VALUE(rs_notif) TYPE ty_notif
      RAISING   zcx_pm_breakdown.
    METHODS is_critical
      IMPORTING iv_equnr       TYPE equnr
      RETURNING VALUE(rv_crit) TYPE abap_bool.
    METHODS create_order
      IMPORTING is_notif        TYPE ty_notif
                iv_priok        TYPE priok
      RETURNING VALUE(rv_aufnr) TYPE aufnr
      RAISING   zcx_pm_breakdown.
    METHODS release_order
      IMPORTING iv_aufnr     TYPE aufnr
      RETURNING VALUE(rv_ok) TYPE abap_bool.
    METHODS sync_cmms
      IMPORTING iv_aufnr TYPE aufnr
                is_notif TYPE ty_notif.
    METHODS raise_event
      IMPORTING iv_aufnr TYPE aufnr.
ENDCLASS.



CLASS zcl_pm_breakdown_processor IMPLEMENTATION.

  METHOD constructor.
    mv_rfcdest = iv_rfcdest.
  ENDMETHOD.


  METHOD process.
    DATA: ls_notif TYPE ty_notif,
          lv_crit  TYPE abap_bool,
          lv_aufnr TYPE aufnr,
          lv_priok TYPE priok.

    ls_notif = read_notification( iv_qmnum ).

    IF ls_notif-aufnr IS NOT INITIAL.
      rv_text = |Meldung { iv_qmnum } hat bereits Auftrag { ls_notif-aufnr }|.
      RETURN.
    ENDIF.

    CALL FUNCTION 'ENQUEUE_EIQMEL'
      EXPORTING
        qmnum          = iv_qmnum
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_pm_breakdown
        EXPORTING iv_text = |Meldung { iv_qmnum } gesperrt|.
    ENDIF.

*   Kritische Anlagen (ABC = A): Prio 1, sofort freigeben, CMMS informieren
    lv_crit = is_critical( ls_notif-equnr ).
    IF lv_crit = abap_true.
      lv_priok = '1'.
    ELSE.
      lv_priok = '2'.
    ENDIF.

    TRY.
        lv_aufnr = create_order( is_notif = ls_notif
                                 iv_priok = lv_priok ).
      CATCH zcx_pm_breakdown INTO DATA(lx_create).
        CALL FUNCTION 'DEQUEUE_EIQMEL'
          EXPORTING
            qmnum = iv_qmnum.
        RAISE EXCEPTION lx_create.
    ENDTRY.

    rv_text = |Meldung { iv_qmnum }: Auftrag { lv_aufnr } angelegt|.

    IF lv_crit = abap_true.
      DATA(lv_frei) = release_order( lv_aufnr ).
      IF lv_frei = abap_true.
        rv_text = |{ rv_text }, freigegeben|.
      ELSE.
        rv_text = |{ rv_text }, Freigabe fehlgeschlagen|.
      ENDIF.
      sync_cmms( iv_aufnr = lv_aufnr
                 is_notif = ls_notif ).
    ENDIF.

    raise_event( lv_aufnr ).

    CALL FUNCTION 'DEQUEUE_EIQMEL'
      EXPORTING
        qmnum = iv_qmnum.
  ENDMETHOD.


  METHOD read_notification.
    SELECT SINGLE m~qmnum m~qmart m~priok m~qmtxt m~aufnr
                  i~equnr i~iwerk i~ingrp
      INTO CORRESPONDING FIELDS OF rs_notif
      FROM qmel AS m
      INNER JOIN qmih AS i ON i~qmnum = m~qmnum
      WHERE m~qmnum = iv_qmnum.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_pm_breakdown
        EXPORTING iv_text = |Meldung { iv_qmnum } nicht gefunden|.
    ENDIF.

    IF rs_notif-qmart <> 'M2'.
      RAISE EXCEPTION TYPE zcx_pm_breakdown
        EXPORTING iv_text = |Meldung { iv_qmnum } ist keine Stoermeldung|.
    ENDIF.
  ENDMETHOD.


  METHOD is_critical.
    DATA lv_abckz TYPE abckz.

    rv_crit = abap_false.
    CHECK iv_equnr IS NOT INITIAL.

    SELECT SINGLE l~abckz
      INTO lv_abckz
      FROM equz AS z
      INNER JOIN iloa AS l ON l~iloan = z~iloan
      WHERE z~equnr = iv_equnr
        AND z~datbi = '99991231'.
    IF lv_abckz = 'A'.
      rv_crit = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD create_order.
    DATA: lt_methods TYPE STANDARD TABLE OF bapi_alm_order_method,
          lt_header  TYPE STANDARD TABLE OF bapi_alm_order_headers_i,
          lt_oper    TYPE STANDARD TABLE OF bapi_alm_order_operation,
          lt_return  TYPE STANDARD TABLE OF bapiret2,
          lt_numbers TYPE STANDARD TABLE OF bapi_alm_numbers.

    lt_methods = VALUE #( ( refnumber = '000001' objecttype = 'HEADER'
                            method    = 'CREATE' objectkey  = '%00000000001' )
                          ( refnumber = '000001' objecttype = 'OPERATION'
                            method    = 'CREATE' objectkey  = '%000000000010010' )
                          ( refnumber = '000001' method = 'SAVE' ) ).

    lt_header = VALUE #( ( orderid    = '%00000000001'
                           order_type = c_auart
                           planplant  = is_notif-iwerk
                           plangroup  = is_notif-ingrp
                           equipment  = is_notif-equnr
                           notif_no   = is_notif-qmnum
                           priority   = iv_priok
                           short_text = is_notif-qmtxt
                           start_date = sy-datum ) ).

    lt_oper = VALUE #( ( activity    = '0010'
                         control_key = c_steus
                         description = 'Stoerungsbeseitigung' ) ).

    CALL FUNCTION 'BAPI_ALM_ORDER_MAINTAIN'
      TABLES
        it_methods   = lt_methods
        it_header    = lt_header
        it_operation = lt_oper
        return       = lt_return
        et_numbers   = lt_numbers.

    IF line_exists( lt_return[ type = 'E' ] ) OR line_exists( lt_return[ type = 'A' ] ).
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      RAISE EXCEPTION TYPE zcx_pm_breakdown
        EXPORTING iv_text = |Auftrag zu { is_notif-qmnum } nicht angelegt: | &&
                            |{ lt_return[ type = 'E' ]-message }|.
    ENDIF.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.

    READ TABLE lt_numbers INTO DATA(ls_number) INDEX 1.
    rv_aufnr = ls_number-aufnr_new.
  ENDMETHOD.


  METHOD release_order.
    DATA: lt_methods TYPE STANDARD TABLE OF bapi_alm_order_method,
          lt_return  TYPE STANDARD TABLE OF bapiret2.

    lt_methods = VALUE #( ( refnumber = '000001' objecttype = 'HEADER'
                            method    = 'RELEASE' objectkey  = iv_aufnr )
                          ( refnumber = '000001' method = 'SAVE' ) ).

    CALL FUNCTION 'BAPI_ALM_ORDER_MAINTAIN'
      TABLES
        it_methods = lt_methods
        return     = lt_return.

    IF line_exists( lt_return[ type = 'E' ] ).
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      rv_ok = abap_false.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = abap_true.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD sync_cmms.
    DATA: lv_msg   TYPE c LENGTH 200,
          ls_queue TYPE zpm_cmms_queue.

*   externes CMMS (Anlagenlieferant) bekommt kritische Stoerauftraege sofort
    CALL FUNCTION 'Z_CMMS_ORDER_SYNC'
      DESTINATION mv_rfcdest
      EXPORTING
        iv_aufnr              = iv_aufnr
        iv_equnr              = is_notif-equnr
        iv_text               = is_notif-qmtxt
      EXCEPTIONS
        communication_failure = 1 MESSAGE lv_msg
        system_failure        = 2 MESSAGE lv_msg
        OTHERS                = 3.
    IF sy-subrc <> 0.
*     fuer Nachversand durch Job ZPM_CMMS_RETRY vormerken
      ls_queue-aufnr = iv_aufnr.
      ls_queue-equnr = is_notif-equnr.
      ls_queue-erdat = sy-datum.
      ls_queue-erzet = sy-uzeit.
      ls_queue-text  = lv_msg.
      INSERT zpm_cmms_queue FROM ls_queue.
      COMMIT WORK.
    ENDIF.
  ENDMETHOD.


  METHOD raise_event.
    DATA lv_key TYPE swo_typeid.

    lv_key = iv_aufnr.
    CALL FUNCTION 'SAP_WAPI_CREATE_EVENT'
      EXPORTING
        object_type = 'BUS2007'
        object_key  = lv_key
        event       = 'ZBREAKDOWN'
        commit_work = abap_true.
  ENDMETHOD.


  METHOD complete_confirmed.
    DATA: lt_orders  TYPE STANDARD TABLE OF aufk,
          lt_methods TYPE STANDARD TABLE OF bapi_alm_order_method,
          lt_return  TYPE STANDARD TABLE OF bapiret2.

    rv_count = 0.

    SELECT a~* FROM aufk AS a
      INNER JOIN afih AS i ON i~aufnr = a~aufnr
      WHERE a~auart = @c_auart
        AND i~iwerk = @iv_iwerk
        AND i~qmnum <> @space
      INTO TABLE @lt_orders.

    LOOP AT lt_orders INTO DATA(ls_order).
*     rueckgemeldet (I0009 RUECK) und noch nicht technisch abgeschlossen
      SELECT SINGLE @abap_true FROM jest
        WHERE objnr = @ls_order-objnr
          AND stat  = 'I0009'
          AND inact = @space
        INTO @DATA(lv_rueck).
      IF sy-subrc <> 0.
        CONTINUE.
      ENDIF.
      SELECT SINGLE @abap_true FROM jest
        WHERE objnr = @ls_order-objnr
          AND stat  = 'I0045'
          AND inact = @space
        INTO @DATA(lv_teco).
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.

      lt_methods = VALUE #( ( refnumber = '000001' objecttype = 'HEADER'
                              method = 'TECHNICALCOMPLETE' objectkey = ls_order-aufnr )
                            ( refnumber = '000001' method = 'SAVE' ) ).
      CLEAR lt_return.
      CALL FUNCTION 'BAPI_ALM_ORDER_MAINTAIN'
        TABLES
          it_methods = lt_methods
          return     = lt_return.
      IF line_exists( lt_return[ type = 'E' ] ).
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      ELSE.
        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
          EXPORTING
            wait = abap_true.
        rv_count = rv_count + 1.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
