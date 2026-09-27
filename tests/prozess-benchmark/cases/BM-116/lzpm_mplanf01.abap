*----------------------------------------------------------------------*
***INCLUDE LZPM_MPLANF01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form PROCESS_PLAN
*&---------------------------------------------------------------------*
* Ein Zyklus eines Wartungsplans: Fälligkeit hochrechnen, ggf. Auftrag
*----------------------------------------------------------------------*
FORM process_plan USING    ps_cyc  TYPE zpm_s_mplan_cycle
                           pv_test TYPE xfeld
                  CHANGING ps_res  TYPE zpm_s_mplan_result.
  CONSTANTS lc_horizon TYPE i VALUE 30.          "Vorlauf in Tagen

  DATA: lo_fc   TYPE REF TO zcl_pm_usage_forecast,
        lt_ret  TYPE STANDARD TABLE OF bapiret2,
        lt_meth TYPE STANDARD TABLE OF bapi_alm_order_method,
        lt_hdr  TYPE STANDARD TABLE OF bapi_alm_order_headers_i,
        lt_num  TYPE STANDARD TABLE OF bapi_alm_numbers.

  lo_fc = NEW #( ).
  TRY.
      ps_res-due = lo_fc->due_date( iv_point = ps_cyc-point
                                    iv_cycle = ps_cyc-zykl1 ).
    CATCH zcx_pm_forecast INTO DATA(lx_fc).
      ps_res-status = 'F'.
      ps_res-text   = lx_fc->get_text( ).
      RETURN.
  ENDTRY.

  IF ps_res-due > sy-datum + lc_horizon.
    ps_res-status = 'N'.
    ps_res-text   = 'noch nicht fällig'.
    RETURN.
  ENDIF.

* offener Auftrag zum Plan (nicht technisch abgeschlossen, nicht gelöscht)
  SELECT SINGLE a~aufnr FROM afih AS a
    INNER JOIN aufk AS k ON k~aufnr = a~aufnr
    WHERE a~warpl = @ps_cyc-warpl
      AND k~idat2 = '00000000'
      AND k~loekz = @space
    INTO @DATA(lv_open).
  IF sy-subrc = 0.
    ps_res-status = 'O'.
    ps_res-aufnr  = lv_open.
    ps_res-text   = 'offener Auftrag vorhanden'.
    RETURN.
  ENDIF.

  IF pv_test = abap_true.
    ps_res-status = 'T'.
    ps_res-text   = 'fällig (Testlauf)'.
    RETURN.
  ENDIF.

  lt_meth = VALUE #( ( refnumber  = 1
                       objecttype = 'HEADER'
                       method     = 'CREATE'
                       objectkey  = '%00000000001' )
                     ( method     = 'SAVE' ) ).
  lt_hdr  = VALUE #( ( orderid    = '%00000000001'
                       order_type = ps_cyc-auart
                       planplant  = ps_cyc-iwerk
                       equipment  = ps_cyc-equnr
                       pmacttype  = ps_cyc-ilart
                       start_date = ps_res-due
                       short_text = |Leistungsabh. Wartung { ps_cyc-warpl }| ) ).

  CALL FUNCTION 'BAPI_ALM_ORDER_MAINTAIN'
    TABLES
      it_methods = lt_meth
      it_header  = lt_hdr
      return     = lt_ret
      et_numbers = lt_num.

  IF line_exists( lt_ret[ type = 'E' ] ) OR line_exists( lt_ret[ type = 'A' ] ).
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    ps_res-status = 'F'.
    ps_res-text   = VALUE #( lt_ret[ type = 'E' ]-message OPTIONAL ).
  ELSE.
    ps_res-aufnr  = VALUE #( lt_num[ 1 ]-aufnr_new OPTIONAL ).
    INSERT zpm_mplan_run FROM @( VALUE #( warpl = ps_cyc-warpl
                                          point = ps_cyc-point
                                          aufnr = ps_res-aufnr
                                          due   = ps_res-due
                                          readg = lo_fc->mv_last_readg
                                          erdat = sy-datum ) ).
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
    ps_res-status = 'A'.
    ps_res-text   = 'Auftrag angelegt'.
  ENDIF.
ENDFORM.
