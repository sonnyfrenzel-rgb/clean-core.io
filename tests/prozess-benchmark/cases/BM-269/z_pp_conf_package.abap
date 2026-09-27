FUNCTION z_pp_conf_package.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:  (RFC-faehig)
*"  IMPORTING
*"     VALUE(IT_CONF) TYPE  ZPP_T_CONF_STG
*"  EXPORTING
*"     VALUE(EV_OK) TYPE  I
*"     VALUE(EV_ERR) TYPE  I
*"----------------------------------------------------------------------
  DATA: lt_tt     TYPE STANDARD TABLE OF bapi_pp_timeticket,
        ls_tt     TYPE bapi_pp_timeticket,
        lt_detail TYPE STANDARD TABLE OF bapi_coru_return,
        ls_detail TYPE bapi_coru_return,
        ls_return TYPE bapiret1.

  LOOP AT it_conf INTO DATA(ls_conf).
    CLEAR: lt_tt, lt_detail, ls_return, ls_tt.
    ls_tt-orderid        = ls_conf-aufnr.
    ls_tt-operation      = ls_conf-vornr.
    ls_tt-yield          = ls_conf-lmnga.
    ls_tt-scrap          = ls_conf-xmnga.
    ls_tt-conf_activity1 = ls_conf-ism01.
    ls_tt-postg_date     = ls_conf-budat.
    ls_tt-fin_conf       = ls_conf-aueru.
    APPEND ls_tt TO lt_tt.

    CALL FUNCTION 'BAPI_PRODORDCONF_CREATE_TT'
      IMPORTING
        return        = ls_return
      TABLES
        timetickets   = lt_tt
        detail_return = lt_detail.

    READ TABLE lt_detail INTO ls_detail INDEX 1.
    IF ls_return-type CA 'EA' OR ls_detail-type CA 'EA'.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      UPDATE zpp_conf_stg
         SET status = 'E'
             msgtxt = ls_detail-message
       WHERE guid = ls_conf-guid.
      ev_err = ev_err + 1.
    ELSE.
      UPDATE zpp_conf_stg
         SET status = 'P'
             rueck  = ls_detail-conf_no
             rmzhl  = ls_detail-conf_cnt
       WHERE guid = ls_conf-guid.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = 'X'.
      ev_ok = ev_ok + 1.
    ENDIF.
  ENDLOOP.
  COMMIT WORK.

ENDFUNCTION.
