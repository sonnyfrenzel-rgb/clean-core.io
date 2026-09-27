CLASS zcl_tv_trip_poster DEFINITION PUBLIC FINAL CREATE PUBLIC.
************************************************************************
* Anlage der Reise ueber BAPI_TRIP_CREATE_FROM_DATA
* Zuordnung externe Reise-ID -> Reisenummer in ZTV_EXT_TRIP
* (Verbuchung ueber Z_TV_EXT_TRIP_INSERT, gemeinsam mit dem BAPI-Commit)
************************************************************************
  PUBLIC SECTION.
    METHODS exists
      IMPORTING iv_ext_id        TYPE char20
      RETURNING VALUE(rv_exists) TYPE abap_bool.
    METHODS post
      IMPORTING is_trip         TYPE zcl_tv_trip_mapper=>ty_trip
                iv_ext_id       TYPE char20
      RETURNING VALUE(rv_reinr) TYPE reinr
      RAISING   zcx_tv_trip.

  PRIVATE SECTION.
    METHODS lock
      IMPORTING iv_pernr TYPE pernr_d
      RAISING   zcx_tv_trip.
    METHODS unlock
      IMPORTING iv_pernr TYPE pernr_d.
ENDCLASS.


CLASS zcl_tv_trip_poster IMPLEMENTATION.

  METHOD exists.
    SELECT SINGLE @abap_true FROM ztv_ext_trip
      WHERE ext_id = @iv_ext_id
      INTO @rv_exists.
  ENDMETHOD.


  METHOD post.
    DATA: lt_receipts TYPE STANDARD TABLE OF bapitrvreo,
          lt_return   TYPE STANDARD TABLE OF bapiret2,
          ls_perdiem  TYPE bapitrvpd,
          lv_pernr    TYPE pernr_d.

    lv_pernr    = is_trip-header-employeenumber.
    lt_receipts = is_trip-receipts.
    ls_perdiem  = is_trip-perdiem.

    lock( lv_pernr ).

    TRY.
        CALL FUNCTION 'BAPI_TRIP_CREATE_FROM_DATA'
          EXPORTING
            framedata      = is_trip-header
            perdiem        = ls_perdiem
          IMPORTING
            tripnumber     = rv_reinr
          TABLES
            receipts       = lt_receipts
            return         = lt_return.

        LOOP AT lt_return INTO DATA(ls_ret) WHERE type CA 'EAX'.
          CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
          RAISE EXCEPTION TYPE zcx_tv_trip
            EXPORTING textid = zcx_tv_trip=>bapi_error
                      msg    = ls_ret-message.
        ENDLOOP.

        IF rv_reinr IS INITIAL.
          CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
          RAISE EXCEPTION TYPE zcx_tv_trip
            EXPORTING textid = zcx_tv_trip=>no_trip_number.
        ENDIF.

        CALL FUNCTION 'Z_TV_EXT_TRIP_INSERT' IN UPDATE TASK
          EXPORTING
            iv_ext_id = iv_ext_id
            iv_pernr  = lv_pernr
            iv_reinr  = rv_reinr.

        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
          EXPORTING
            wait = abap_true.
      CLEANUP.
        unlock( lv_pernr ).
    ENDTRY.

    unlock( lv_pernr ).
  ENDMETHOD.


  METHOD lock.
    DATA ls_return TYPE bapireturn1.
    DO 3 TIMES.
      CALL FUNCTION 'HR_EMPLOYEE_ENQUEUE'
        EXPORTING
          number = iv_pernr
        IMPORTING
          return = ls_return.
      IF ls_return-type <> 'E'.
        RETURN.
      ENDIF.
*     Mitarbeiter bearbeitet gerade selbst im Portal -> kurz warten
      WAIT UP TO 2 SECONDS.
    ENDDO.
    RAISE EXCEPTION TYPE zcx_tv_trip
      EXPORTING textid = zcx_tv_trip=>employee_locked.
  ENDMETHOD.


  METHOD unlock.
    CALL FUNCTION 'HR_EMPLOYEE_DEQUEUE'
      EXPORTING
        number = iv_pernr.
  ENDMETHOD.

ENDCLASS.
