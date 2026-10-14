*&---------------------------------------------------------------------*
*& Hand-written fixture for tests/transformation-rap-contract.spec.ts,
*& modelled on the shapes the two external reviews of the SD example found
*& broken in the RAP package (14.10.2026): FORM parameters with types,
*& TYPE i, d and packed components, a select-option read through its
*& header line, a constant safety gate before a live read, an internal
*& invariant, demo data behind a checkbox, a list. Not a customer program.
*&---------------------------------------------------------------------*
REPORT zfx_contract_sim.

TYPES: ty_i TYPE p LENGTH 16 DECIMALS 0,
       ty_raw TYPE p LENGTH 12 DECIMALS 6,
       ty_flag TYPE c LENGTH 1,
       ty_stamp TYPE c LENGTH 14,
       ty_cid TYPE c LENGTH 10,
       ty_code TYPE c LENGTH 32.
TYPES: BEGIN OF ty_claim,
         cid TYPE ty_cid,
         qty TYPE ty_raw,
         day TYPE d,
         priority TYPE i,
         item TYPE n LENGTH 6,
       END OF ty_claim.
TYPES tt_claim TYPE STANDARD TABLE OF ty_claim WITH DEFAULT KEY.
TYPES: BEGIN OF ty_row,
         cid TYPE ty_cid,
         milli TYPE ty_i,
         status TYPE ty_code,
       END OF ty_row.
TYPES tt_row TYPE STANDARD TABLE OF ty_row WITH DEFAULT KEY.

CONSTANTS: gc_live_probe TYPE ty_flag VALUE space,
           gc_max_raw TYPE ty_raw VALUE '1000000000'.
DATA: gt_claims TYPE tt_claim,
      gt_rows TYPE tt_row,
      gt_issues TYPE STANDARD TABLE OF ty_code WITH DEFAULT KEY,
      gv_status TYPE ty_code,
      gv_cid TYPE ty_cid.

PARAMETERS: p_demo AS CHECKBOX DEFAULT 'X',
            p_eff TYPE ty_stamp DEFAULT '20261012235959',
            p_doc TYPE c LENGTH 10.
SELECT-OPTIONS s_show FOR gv_cid NO INTERVALS.

AT SELECTION-SCREEN.
  PERFORM validate_selection.

START-OF-SELECTION.
  IF p_demo = 'X'.
    PERFORM build_demo.
  ELSE.
    PERFORM probe_live_sources.
    RETURN.
  ENDIF.
  PERFORM calculate.
  PERFORM display_results.

FORM validate_selection.
  DATA lv_code TYPE ty_code.
  PERFORM check_stamp USING p_eff CHANGING lv_code.
  IF lv_code IS NOT INITIAL.
    MESSAGE 'P_EFF must be a valid UTC stamp' TYPE 'E'.
  ENDIF.
  LOOP AT s_show.
    IF s_show-sign <> 'I' OR s_show-option <> 'EQ'.
      MESSAGE 'S_SHOW takes single claim IDs only' TYPE 'E'.
    ENDIF.
  ENDLOOP.
ENDFORM.

FORM check_stamp USING iv_stamp TYPE ty_stamp CHANGING cv_code TYPE ty_code.
  DATA lv_date TYPE d.
  CLEAR cv_code.
  IF iv_stamp CN '0123456789' OR iv_stamp+8(2) > '23'.
    cv_code = 'INVALID_TIMESTAMP'.
    RETURN.
  ENDIF.
  lv_date = iv_stamp(8).
  CALL FUNCTION 'DATE_CHECK_PLAUSIBILITY'
    EXPORTING date = lv_date
    EXCEPTIONS plausibility_check_failed = 1 OTHERS = 2.
  IF sy-subrc <> 0.
    cv_code = 'INVALID_TIMESTAMP'.
  ENDIF.
ENDFORM.

FORM round_ratio USING iv_num TYPE ty_i iv_den TYPE ty_i
                 CHANGING cv_value TYPE ty_i.
  DATA lv_rem TYPE ty_i.
  IF iv_den <= 0.
    MESSAGE 'Internal invariant: nonpositive ratio denominator' TYPE 'E'.
  ENDIF.
  cv_value = abs( iv_num ) DIV iv_den.
  lv_rem = abs( iv_num ) MOD iv_den.
  IF lv_rem * 2 >= iv_den.
    cv_value = cv_value + 1.
  ENDIF.
ENDFORM.

FORM calculate.
  DATA: ls_claim TYPE ty_claim, ls_row TYPE ty_row, lv_milli TYPE ty_i.
  LOOP AT gt_claims INTO ls_claim.
    IF ls_claim-qty < 0 OR ls_claim-qty > gc_max_raw.
      PERFORM add_issue USING ls_claim-cid 'QUANTITY_RANGE'.
      CONTINUE.
    ENDIF.
    IF ls_claim-priority < 1 OR ls_claim-priority > 99.
      PERFORM add_issue USING ls_claim-cid 'PRIORITY_RANGE'.
      CONTINUE.
    ENDIF.
    PERFORM round_ratio USING ls_claim-qty 1000 CHANGING lv_milli.
    ls_row-cid = ls_claim-cid.
    ls_row-milli = lv_milli.
    ls_row-status = 'PROPOSE'.
    APPEND ls_row TO gt_rows.
  ENDLOOP.
  gv_status = 'DONE'.
ENDFORM.

FORM add_issue USING iv_cid TYPE c iv_code TYPE c.
  DATA lv_code TYPE ty_code.
  lv_code = iv_code.
  READ TABLE gt_issues WITH KEY table_line = lv_code TRANSPORTING NO FIELDS.
  IF sy-subrc <> 0.
    APPEND lv_code TO gt_issues.
  ENDIF.
ENDFORM.

FORM display_results.
  DATA: ls_row TYPE ty_row, lv_count TYPE i.
  DESCRIBE TABLE gt_rows LINES lv_count.
  WRITE: / 'Rows:', lv_count, 'Status:', gv_status.
  ULINE.
  LOOP AT gt_rows INTO ls_row.
    WRITE: / ls_row-cid, ls_row-milli, ls_row-status.
  ENDLOOP.
ENDFORM.

FORM probe_live_sources.
  DATA lv_vbeln TYPE c LENGTH 10.
  IF gc_live_probe <> 'X'.
    MESSAGE 'Live adapter deliberately disabled' TYPE 'E'.
  ENDIF.
  IF p_doc IS INITIAL.
    MESSAGE 'The probe needs one sales document' TYPE 'E'.
  ENDIF.
  SELECT SINGLE vbeln FROM vbak INTO lv_vbeln WHERE vbeln = p_doc.
  IF sy-subrc <> 0.
    MESSAGE 'No such document' TYPE 'E'.
  ENDIF.
ENDFORM.

FORM build_demo.
  APPEND VALUE #( cid = '0000001001' qty = '2' day = '20261012' priority = 1 item = '000010' ) TO gt_claims.
  APPEND VALUE #( cid = '0000001002' qty = '-1' day = '20261012' priority = 1 item = '000020' ) TO gt_claims.
ENDFORM.
