CLASS zcl_fscm_limit_info DEFINITION PUBLIC FINAL CREATE PUBLIC.
* FSCM-Kreditmanagement: schnelle Limitprüfung für das Web-Shop-Backend
* (Freigabe ohne Kreditprüfung im Auftrag, siehe Konzept CM-07)
  PUBLIC SECTION.
    METHODS check_order_value
      IMPORTING iv_partner       TYPE bu_partner
                iv_segment       TYPE ukm_credit_sgmnt
                iv_exposure      TYPE ukm_credit_limit
                iv_value         TYPE ukm_credit_limit
      RETURNING VALUE(rv_ok)     TYPE abap_bool
      RAISING   zcx_fscm_credit.
ENDCLASS.

CLASS zcl_fscm_limit_info IMPLEMENTATION.
  METHOD check_order_value.
    SELECT SINGLE credit_limit, xblocked, limit_valid_date
      FROM ukmbp_cms_sgm
      WHERE partner = @iv_partner
        AND credit_sgmnt = @iv_segment
      INTO @DATA(ls_sgm).
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_fscm_credit
        EXPORTING textid = zcx_fscm_credit=>no_segment.
    ENDIF.
    IF ls_sgm-xblocked = abap_true.
      RETURN.   "gesperrt: rv_ok bleibt initial
    ENDIF.
    rv_ok = xsdbool( ( ls_sgm-limit_valid_date IS INITIAL
                       OR ls_sgm-limit_valid_date >= sy-datum )
                     AND iv_exposure + iv_value <= ls_sgm-credit_limit ).
  ENDMETHOD.
ENDCLASS.
