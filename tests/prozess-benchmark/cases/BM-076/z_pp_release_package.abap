FUNCTION z_pp_release_package.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:  (remotefaehig, fuer aRFC-Verteilung)
*"  IMPORTING
*"     VALUE(IV_TEST) TYPE  XFELD DEFAULT 'X'
*"  TABLES
*"      IT_ORDERS STRUCTURE  ZPP_S_AUFNR
*"      ET_RESULT STRUCTURE  ZPP_S_REL_RESULT OPTIONAL
*"----------------------------------------------------------------------
  DATA: lt_keys   TYPE STANDARD TABLE OF bapi_order_key,
        lt_detail TYPE STANDARD TABLE OF bapi_order_return,
        ls_return TYPE bapiret2.

  LOOP AT it_orders.
    CLEAR et_result.
    et_result-aufnr = it_orders-aufnr.

    CALL FUNCTION 'ENQUEUE_ESORDER'
      EXPORTING
        aufnr          = it_orders-aufnr
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      et_result-status = 'L'.
      et_result-text   = |gesperrt durch { sy-msgv1 }|.
      APPEND et_result.
      CONTINUE.
    ENDIF.

    IF iv_test = abap_true.
      et_result-status = 'T'.
      et_result-text   = 'Testlauf - nicht freigegeben'.
      APPEND et_result.
      CALL FUNCTION 'DEQUEUE_ESORDER'
        EXPORTING
          aufnr = it_orders-aufnr.
      CONTINUE.
    ENDIF.

    CLEAR: lt_keys, lt_detail, ls_return.
    APPEND VALUE #( order_number = it_orders-aufnr ) TO lt_keys.

    CALL FUNCTION 'BAPI_PRODORD_RELEASE'
      IMPORTING
        return        = ls_return
      TABLES
        orders        = lt_keys
        detail_return = lt_detail.

    IF ls_return-type CA 'EA' OR line_exists( lt_detail[ type = 'E' ] ).
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      et_result-status = 'E'.
      et_result-text   = COND #( WHEN ls_return-message IS NOT INITIAL
                                 THEN ls_return-message
                                 ELSE lt_detail[ type = 'E' ]-message ).
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = abap_true.
      et_result-status = 'S'.
      et_result-text   = 'freigegeben'.
    ENDIF.

    CALL FUNCTION 'DEQUEUE_ESORDER'
      EXPORTING
        aufnr = it_orders-aufnr.
    APPEND et_result.
  ENDLOOP.

ENDFUNCTION.
