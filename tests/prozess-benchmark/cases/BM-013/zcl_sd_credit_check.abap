CLASS zcl_sd_credit_check DEFINITION PUBLIC FINAL CREATE PUBLIC.
*----------------------------------------------------------------------*
* Kreditprüfung Kundenauftrag: Obligo aus Infostrukturen S066/S067 und
* offenen Posten gegen das Kreditlimit (KNKK) mit Toleranz je Risikoklasse
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_result,
             decision TYPE char1,
             exposure TYPE klimk,
             limit    TYPE klimk,
           END OF ty_result.

    CONSTANTS: c_ok     TYPE char1 VALUE 'O',
               c_block  TYPE char1 VALUE 'B',
               c_reject TYPE char1 VALUE 'R'.

    METHODS constructor
      IMPORTING iv_kunnr TYPE kunnr
                iv_kkber TYPE kkber.
    METHODS check
      IMPORTING iv_new_value     TYPE netwr_ak
                iv_old_value     TYPE netwr_ak
      RETURNING VALUE(rs_result) TYPE ty_result.
    METHODS notify_credit_manager
      IMPORTING iv_vbeln TYPE vbeln_va.

  PRIVATE SECTION.
    DATA: mv_kunnr TYPE kunnr,
          mv_kkber TYPE kkber,
          ms_knkk  TYPE knkk,
          mv_found TYPE abap_bool.

    METHODS get_exposure
      RETURNING VALUE(rv_exposure) TYPE klimk.
ENDCLASS.



CLASS zcl_sd_credit_check IMPLEMENTATION.

  METHOD constructor.
    mv_kunnr = iv_kunnr.
    mv_kkber = iv_kkber.
    SELECT SINGLE * FROM knkk INTO ms_knkk
      WHERE kunnr = iv_kunnr
        AND kkber = iv_kkber.
    IF sy-subrc = 0.
      mv_found = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD check.
    DATA lv_toleranz TYPE p LENGTH 3 DECIMALS 2.

    rs_result-decision = c_ok.

*   ohne Kreditstammsatz keine Prüfung (Vorgabe Vertrieb 2011)
    IF mv_found = abap_false.
      RETURN.
    ENDIF.

*   im Kreditmanagement gesperrter Kunde: Auftrag ablehnen
    IF ms_knkk-crblb = abap_true.
      rs_result-decision = c_reject.
      RETURN.
    ENDIF.

    rs_result-limit    = ms_knkk-klimk.
    rs_result-exposure = get_exposure( ) + iv_new_value - iv_old_value.

*   Toleranz je Risikoklasse
    CASE ms_knkk-ctlpc.
      WHEN '001'.
        lv_toleranz = '1.10'.
      WHEN '002'.
        lv_toleranz = '1.05'.
      WHEN OTHERS.
        lv_toleranz = '1.00'.
    ENDCASE.

    IF rs_result-exposure > rs_result-limit * lv_toleranz.
      rs_result-decision = c_block.
    ENDIF.

    CALL FUNCTION 'Z_SD_CREDIT_LOG_UPD' IN UPDATE TASK
      EXPORTING
        iv_kunnr  = mv_kunnr
        iv_kkber  = mv_kkber
        is_result = rs_result
        iv_uname  = sy-uname.
  ENDMETHOD.


  METHOD get_exposure.
    DATA: lv_oeikw TYPE klimk,
          lv_olikw TYPE klimk,
          lv_ofakw TYPE klimk,
          lv_op    TYPE klimk,
          lv_dmbtr TYPE bsid-dmbtr,
          lv_shkzg TYPE bsid-shkzg.

*   offene Aufträge (Kreditwert)
    SELECT SUM( oeikw ) FROM s066 INTO lv_oeikw
      WHERE knkli = mv_kunnr
        AND kkber = mv_kkber.

*   offene Lieferungen und offene Fakturen
    SELECT SUM( olikw ) SUM( ofakw ) FROM s067 INTO (lv_olikw, lv_ofakw)
      WHERE knkli = mv_kunnr
        AND kkber = mv_kkber.

*   offene Posten aller Buchungskreise des Kreditkontrollbereichs
    SELECT dmbtr shkzg FROM bsid INTO (lv_dmbtr, lv_shkzg)
      WHERE kunnr = mv_kunnr
        AND bukrs IN ( SELECT bukrs FROM t001 WHERE kkber = mv_kkber ).
      IF lv_shkzg = 'H'.
        lv_op = lv_op - lv_dmbtr.
      ELSE.
        lv_op = lv_op + lv_dmbtr.
      ENDIF.
    ENDSELECT.

    rv_exposure = lv_oeikw + lv_olikw + lv_ofakw + lv_op.
  ENDMETHOD.


  METHOD notify_credit_manager.
    DATA lv_objkey TYPE swo_typeid.

    lv_objkey = iv_vbeln.
    CALL FUNCTION 'SWE_EVENT_CREATE'
      EXPORTING
        objtype           = 'BUS2032'
        objkey            = lv_objkey
        event             = 'ZCREDITBLOCK'
      EXCEPTIONS
        objtype_not_found = 1
        OTHERS            = 2.
    IF sy-subrc <> 0.
      MESSAGE s212(zsd) DISPLAY LIKE 'W'.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
