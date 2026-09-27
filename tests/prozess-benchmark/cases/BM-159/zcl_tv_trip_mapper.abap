CLASS zcl_tv_trip_mapper DEFINITION PUBLIC FINAL CREATE PUBLIC.
************************************************************************
* Abbildung der Portaldaten auf die Reise (BAPI-Strukturen)
*  - Pruefung Mitarbeiter aktiv / Datumslogik
*  - Verpflegungspauschale nach Abwesenheitsdauer (ZTV_PERDIEM)
*  - Fremdwaehrungsbelege in Hauswaehrung EUR umrechnen
************************************************************************
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_trip,
             header  TYPE bapitrmain,
             receipts TYPE STANDARD TABLE OF bapitrvreo WITH DEFAULT KEY,
             perdiem TYPE bapitrvpd,
           END OF ty_trip.

    METHODS validate
      IMPORTING is_head TYPE z1triph
      RAISING   zcx_tv_trip.
    METHODS map
      IMPORTING is_head        TYPE z1triph
                it_rec         TYPE STANDARD TABLE
      RETURNING VALUE(rs_trip) TYPE ty_trip
      RAISING   zcx_tv_trip.

  PRIVATE SECTION.
    CONSTANTS gc_home TYPE land1 VALUE 'DE'.
    METHODS perdiem_amount
      IMPORTING is_head         TYPE z1triph
      RETURNING VALUE(rv_amount) TYPE ptrv_rec_amount.
    METHODS to_local
      IMPORTING iv_amount       TYPE ptrv_rec_amount
                iv_waers        TYPE waers
                iv_date         TYPE datum
      RETURNING VALUE(rv_local) TYPE ptrv_rec_amount
      RAISING   zcx_tv_trip.
ENDCLASS.


CLASS zcl_tv_trip_mapper IMPLEMENTATION.

  METHOD validate.
    IF is_head-datb1 < is_head-datv1.
      RAISE EXCEPTION TYPE zcx_tv_trip
        EXPORTING textid = zcx_tv_trip=>end_before_start.
    ENDIF.

*   Reisen aelter als zwei Jahre werden nicht mehr erstattet (BV 2016)
    IF is_head-datb1 < sy-datum - 730.
      RAISE EXCEPTION TYPE zcx_tv_trip
        EXPORTING textid = zcx_tv_trip=>too_old.
    ENDIF.

    SELECT SINGLE stat2 FROM pa0000 INTO @DATA(lv_stat2)
      WHERE pernr = @is_head-pernr
        AND begda <= @is_head-datv1
        AND endda >= @is_head-datv1.
    IF sy-subrc <> 0 OR lv_stat2 <> '3'.
      RAISE EXCEPTION TYPE zcx_tv_trip
        EXPORTING textid = zcx_tv_trip=>employee_inactive.
    ENDIF.
  ENDMETHOD.


  METHOD map.
    DATA: ls_rec   TYPE z1tripr,
          ls_bapi  TYPE bapitrvreo.

    rs_trip-header-employeenumber = is_head-pernr.
    rs_trip-header-datev          = is_head-datv1.
    rs_trip-header-timev          = is_head-uhrv1.
    rs_trip-header-dateb          = is_head-datb1.
    rs_trip-header-timeb          = is_head-uhrb1.
    rs_trip-header-country        = is_head-land.
    rs_trip-header-location       = is_head-zort.
    rs_trip-header-customer       = is_head-kunde.
    rs_trip-header-trip_activity  = SWITCH #( is_head-zweck
                                      WHEN 'KUNDE'   THEN 'K'
                                      WHEN 'MESSE'   THEN 'M'
                                      WHEN 'SCHULUNG' THEN 'S'
                                      ELSE 'A' ).

    LOOP AT it_rec INTO ls_rec.
*     Belege ausserhalb des Reisezeitraums werden verworfen
      IF ls_rec-datum < is_head-datv1 OR ls_rec-datum > is_head-datb1.
        CONTINUE.
      ENDIF.
      CLEAR ls_bapi.
      ls_bapi-exp_type  = ls_rec-spkzl.
      ls_bapi-rec_date  = ls_rec-datum.
      IF ls_rec-waers = 'EUR'.
        ls_bapi-rec_amount = ls_rec-betrg.
      ELSE.
        ls_bapi-rec_amount = to_local( iv_amount = ls_rec-betrg
                                       iv_waers  = ls_rec-waers
                                       iv_date   = ls_rec-datum ).
      ENDIF.
      ls_bapi-rec_curr = 'EUR'.
      APPEND ls_bapi TO rs_trip-receipts.
    ENDLOOP.

    rs_trip-perdiem-amount = perdiem_amount( is_head ).
  ENDMETHOD.


  METHOD perdiem_amount.
    DATA: lv_hours TYPE i,
          ls_rate  TYPE ztv_perdiem.

    lv_hours = ( ( is_head-datb1 - is_head-datv1 ) * 86400
               + ( is_head-uhrb1 - is_head-uhrv1 ) ) / 3600.

    SELECT SINGLE * FROM ztv_perdiem INTO ls_rate
      WHERE land = COND land1( WHEN is_head-land IS INITIAL
                               THEN gc_home ELSE is_head-land )
        AND begda <= is_head-datv1
        AND endda >= is_head-datv1.
    IF sy-subrc <> 0.
*     Land ohne Satz: Inlandssatz
      SELECT SINGLE * FROM ztv_perdiem INTO ls_rate
        WHERE land = gc_home
          AND begda <= is_head-datv1
          AND endda >= is_head-datv1.
    ENDIF.

    IF lv_hours >= 24.
      rv_amount = ls_rate-full_day * ( is_head-datb1 - is_head-datv1 ).
    ELSEIF lv_hours >= 8.
      rv_amount = ls_rate-part_day.
    ELSE.
      rv_amount = 0.
    ENDIF.
  ENDMETHOD.


  METHOD to_local.
    CALL FUNCTION 'CONVERT_TO_LOCAL_CURRENCY'
      EXPORTING
        date             = iv_date
        foreign_amount   = iv_amount
        foreign_currency = iv_waers
        local_currency   = 'EUR'
      IMPORTING
        local_amount     = rv_local
      EXCEPTIONS
        no_rate_found    = 1
        OTHERS           = 2.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_tv_trip
        EXPORTING textid = zcx_tv_trip=>no_exchange_rate.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
