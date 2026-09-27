*&---------------------------------------------------------------------*
*&  Include           ZRE_INDEX_F01
*&---------------------------------------------------------------------*
*&  Berechnung und Parallelverarbeitung
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  CALCULATE_RENTS
*&---------------------------------------------------------------------*
*       Aenderung VPI ggue. Basis, Schwellwert, Kappung, neue Miete
*----------------------------------------------------------------------*
FORM calculate_rents.

  DATA: lv_change TYPE p LENGTH 7 DECIMALS 2,
        lv_pct    TYPE p LENGTH 7 DECIMALS 2,
        lv_msgno  TYPE symsgno,
        ls_adjust TYPE ty_adjust.

  LOOP AT gt_contracts INTO DATA(ls_cn).

*   prozentuale Veraenderung des VPI seit der letzten Anpassung
    lv_change = COND #( WHEN ls_cn-base_vpi > 0
                        THEN ( gv_vpi_act - ls_cn-base_vpi ) / ls_cn-base_vpi * 100 ).

*   Ausschlussgruende
*   010 keine Grundmiete, 011 Sperrjahr Indexmiete, 012 Basis fehlt,
*   013 Schwellwert (z. B. 5 %) in keiner Richtung erreicht
    lv_msgno = COND #( WHEN ls_cn-unitprice IS INITIAL THEN '010'
                       WHEN ls_cn-last_adj IS NOT INITIAL
                        AND ls_cn-last_adj > p_stich - 365 THEN '011'
                       WHEN ls_cn-base_vpi <= 0 THEN '012'
                       WHEN abs( lv_change ) < ls_cn-thresh_pct THEN '013' ).
    IF lv_msgno IS NOT INITIAL.
      APPEND VALUE #( msgty = 'I' msgno = lv_msgno
                      msgv1 = ls_cn-recnnr msgv2 = |{ lv_change }| ) TO gt_msg.
      CONTINUE.
    ENDIF.

*   Kappung nur nach oben (Gewerbe), Wohnen ohne Kappung (cap_pct = 0)
    lv_pct = COND #( WHEN ls_cn-cap_pct > 0 AND lv_change > ls_cn-cap_pct
                     THEN ls_cn-cap_pct
                     ELSE lv_change ).

    CLEAR ls_adjust.
    ls_adjust-intreno   = ls_cn-intreno.
    ls_adjust-bukrs     = ls_cn-bukrs.
    ls_adjust-recnnr    = ls_cn-recnnr.
    ls_adjust-condtype  = ls_cn-condtype.
    ls_adjust-old_price = ls_cn-unitprice.
    ls_adjust-new_price = round( val = ls_cn-unitprice * ( 100 + lv_pct ) / 100
                                 dec = 2 ).
    ls_adjust-condcurr  = ls_cn-condcurr.
    ls_adjust-pct       = lv_pct.
    ls_adjust-new_vpi   = gv_vpi_act.
    ls_adjust-new_per   = gv_period.
    APPEND ls_adjust TO gt_adjust.

  ENDLOOP.

ENDFORM.                    " CALCULATE_RENTS

*&---------------------------------------------------------------------*
*&      Form  DISPATCH_PACKAGES
*&---------------------------------------------------------------------*
*       Pakete zu P_PKG Vertraegen bilden und je Paket eine Task in der
*       RFC-Servergruppe starten. Rueckmeldung in RECEIVE_RESULT.
*----------------------------------------------------------------------*
FORM dispatch_packages.

  DATA: lt_pkg  TYPE ty_t_adjust,
        lv_task TYPE char32,
        lv_msg  TYPE char255.

  LOOP AT gt_adjust INTO DATA(ls_adj).
    DATA(lv_idx) = sy-tabix.
    APPEND ls_adj TO lt_pkg.
    CHECK lines( lt_pkg ) >= p_pkg OR lv_idx = lines( gt_adjust ).

    gv_taskno = gv_taskno + 1.
    lv_task = |ZRE_IDX_{ gv_taskno }|.

    DO.
      CALL FUNCTION 'Z_RE_INDEX_TASK'
        STARTING NEW TASK lv_task
        DESTINATION IN GROUP p_rfcgr
        PERFORMING receive_result ON END OF TASK
        EXPORTING
          iv_keydate            = p_stich
          it_adjust             = lt_pkg
        EXCEPTIONS
          system_failure        = 1 MESSAGE lv_msg
          communication_failure = 2 MESSAGE lv_msg
          resource_failure      = 3
          OTHERS                = 4.
      CASE sy-subrc.
        WHEN 0.
          gv_started = gv_started + 1.
          EXIT.
        WHEN 3.
*         keine freien Workprozesse - kurz warten, dann erneut
          WAIT UNTIL gv_done >= gv_started UP TO 5 SECONDS.
        WHEN OTHERS.
*         Paket verloren - Vertraege im naechsten Lauf wieder faellig
          APPEND VALUE #( msgty = 'E' msgno = '007'
                          msgv1 = lv_task msgv2 = lv_msg(50) ) TO gt_msg.
          EXIT.
      ENDCASE.
    ENDDO.

    CLEAR lt_pkg.
  ENDLOOP.

ENDFORM.                    " DISPATCH_PACKAGES

*&---------------------------------------------------------------------*
*&      Form  RECEIVE_RESULT
*&---------------------------------------------------------------------*
*       Callback ON END OF TASK
*----------------------------------------------------------------------*
FORM receive_result USING uv_task TYPE clike.

  DATA lt_res TYPE ty_t_result.

  RECEIVE RESULTS FROM FUNCTION 'Z_RE_INDEX_TASK'
    IMPORTING
      et_result             = lt_res
    EXCEPTIONS
      system_failure        = 1
      communication_failure = 2
      OTHERS                = 3.

  APPEND LINES OF lt_res TO gt_result.

* nicht angepasste Vertraege (gesperrt, ohne Kondition, Fehler) ins Protokoll
  gt_msg = VALUE #( BASE gt_msg
                    FOR ls_r IN lt_res WHERE ( status <> 'OK' )
                    ( msgty = 'W' msgno = '030'
                      msgv1 = ls_r-recnnr msgv2 = ls_r-status ) ).

  gv_done = gv_done + 1.

ENDFORM.                    " RECEIVE_RESULT

*&---------------------------------------------------------------------*
*&      Form  CALC_OLD_2019
*&---------------------------------------------------------------------*
*       Berechnung vor Umstellung VPI 2020 - Umbasierung 2015->2020
*----------------------------------------------------------------------*
FORM calc_old_2019 USING    us_cn    TYPE ty_contract
                   CHANGING cv_price TYPE recdunitprice.
  cv_price = us_cn-unitprice * gv_vpi_act / ( us_cn-base_vpi * '1.059' ).
ENDFORM.                    " CALC_OLD_2019
