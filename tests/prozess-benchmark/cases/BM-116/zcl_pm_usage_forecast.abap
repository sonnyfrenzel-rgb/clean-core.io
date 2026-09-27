CLASS zcl_pm_usage_forecast DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Hochrechnung der Fälligkeit eines leistungsabhängigen Zyklus
* Tagesleistung = (letzter - erster Zählerstand) / Tage, Basis: die
* Messbelege der letzten 365 Tage. Nächster Abruf = Zählerstand beim
* letzten Abruf (ZPM_MPLAN_RUN) + Zykluslänge.
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    DATA mv_last_readg TYPE imrc_readg READ-ONLY.

    METHODS due_date
      IMPORTING
        iv_point       TYPE imrc_point
        iv_cycle       TYPE f
      RETURNING
        VALUE(rv_date) TYPE datum
      RAISING
        zcx_pm_forecast.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_read,
             idate TYPE imrg-idate,
             readg TYPE imrg-readg,
           END OF ty_read.

    DATA: mv_point TYPE imrc_point,
          mt_read  TYPE STANDARD TABLE OF ty_read WITH EMPTY KEY.

    METHODS load_readings
      RAISING
        zcx_pm_forecast.
    METHODS daily_usage
      RETURNING
        VALUE(rv_rate) TYPE f.
ENDCLASS.


CLASS zcl_pm_usage_forecast IMPLEMENTATION.

  METHOD due_date.
    DATA: lv_call TYPE f,
          lv_days TYPE f.

    mv_point = iv_point.
    load_readings( ).

    DATA(lv_rate) = daily_usage( ).
    IF lv_rate <= 0.
      RAISE EXCEPTION TYPE zcx_pm_forecast
        EXPORTING
          textid = zcx_pm_forecast=>no_usage
          point  = mv_point.
    ENDIF.

    DATA(ls_last) = mt_read[ lines( mt_read ) ].
    mv_last_readg = ls_last-readg.

*   Zählerstand beim letzten Abruf; ohne Abruf gilt die älteste Ablesung
    SELECT MAX( readg ) FROM zpm_mplan_run
      WHERE point = @mv_point
      INTO @lv_call.
    IF lv_call IS INITIAL.
      lv_call = mt_read[ 1 ]-readg.
    ENDIF.

    lv_days = ( lv_call + iv_cycle - ls_last-readg ) / lv_rate.
    rv_date = ls_last-idate + COND i( WHEN lv_days < 0 THEN 0
                                      ELSE lv_days ).
  ENDMETHOD.


  METHOD load_readings.
    SELECT idate, readg FROM imrg
      WHERE point = @mv_point
        AND cancl = @space
        AND idate >= @( sy-datum - 365 )
      ORDER BY idate, itime
      INTO TABLE @mt_read.
    IF lines( mt_read ) < 2.
      RAISE EXCEPTION TYPE zcx_pm_forecast
        EXPORTING
          textid = zcx_pm_forecast=>too_few_readings
          point  = mv_point.
    ENDIF.
  ENDMETHOD.


  METHOD daily_usage.
    DATA(ls_first) = mt_read[ 1 ].
    DATA(ls_last)  = mt_read[ lines( mt_read ) ].
    DATA(lv_days)  = ls_last-idate - ls_first-idate.
    rv_rate = COND #( WHEN lv_days > 0
                      THEN ( ls_last-readg - ls_first-readg ) / lv_days
                      ELSE 0 ).
  ENDMETHOD.

ENDCLASS.
