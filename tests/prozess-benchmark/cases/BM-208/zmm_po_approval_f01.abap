*&---------------------------------------------------------------------*
*& Include ZMM_PO_APPROVAL_F01
*&---------------------------------------------------------------------*
FORM select_orders.
* nur gesperrte, nicht geloeschte Bestellungen mit Freigabestrategie
  SELECT ebeln bsart ekgrp frgke frgzu
    FROM ekko
    INTO TABLE gt_ekko
    WHERE bsart IN s_bsart
      AND ekgrp IN s_ekgrp
      AND frgke = 'B'
      AND loekz = space.
ENDFORM.

FORM process_order USING is_ekko TYPE ty_ekko.
  DATA: lo_appr TYPE REF TO lcl_approval,
        lx_appr TYPE REF TO lcx_approval.

  lo_appr = lcl_approval=>create( is_ekko ).
  SET HANDLER go_log->on_released FOR lo_appr.
  TRY.
      lo_appr->run( ).
    CATCH lcx_approval INTO lx_appr.
      PERFORM log_error USING is_ekko-ebeln lx_appr->mv_text.
  ENDTRY.
ENDFORM.

FORM log_error USING iv_ebeln TYPE ebeln
                     iv_text  TYPE string.
  gv_cnt_err = gv_cnt_err + 1.
  WRITE: / iv_ebeln COLOR COL_NEGATIVE, iv_text.
ENDFORM.
