*&---------------------------------------------------------------------*
*& Hand-written fixture for tests/golden-master.spec.ts: a small report
*& with in-code demo data and three demo cases, in the shape of the SD
*& and PM review programs (fixture routines, a baseline, a CASE on the
*& case number with a title per case). Not a customer program.
*&---------------------------------------------------------------------*
REPORT zfx_gm_credit.

TYPES: BEGIN OF ty_claim,
         org   TYPE c LENGTH 4,
         cid   TYPE c LENGTH 10,
         qty   TYPE p LENGTH 8 DECIMALS 3,
         price TYPE p LENGTH 8 DECIMALS 2,
       END OF ty_claim,
       tt_claim TYPE STANDARD TABLE OF ty_claim WITH DEFAULT KEY.
TYPES: BEGIN OF ty_rate,
         org TYPE c LENGTH 4,
         pct TYPE i,
       END OF ty_rate.

DATA: gt_claims TYPE tt_claim,
      gt_rates  TYPE STANDARD TABLE OF ty_rate WITH DEFAULT KEY,
      gv_title  TYPE c LENGTH 80,
      gv_sealed TYPE c LENGTH 1.

PARAMETERS: p_demo AS CHECKBOX DEFAULT 'X',
            p_case TYPE i DEFAULT 0,
            p_org  TYPE c LENGTH 4 DEFAULT '1000'.

START-OF-SELECTION.
  gv_sealed = 'X'.
  IF p_demo = 'X'.
    PERFORM build_demo.
    PERFORM apply_case.
  ELSE.
    RETURN.
  ENDIF.
  PERFORM credit.

FORM add_claim USING iv_org TYPE c iv_cid TYPE c iv_qty TYPE c iv_price TYPE c.
  DATA ls TYPE ty_claim.
  ls-org = iv_org. ls-cid = iv_cid.
  ls-qty = iv_qty. ls-price = iv_price.
  APPEND ls TO gt_claims.
ENDFORM.

FORM add_rate USING VALUE(iv_org) TYPE c VALUE(iv_pct) TYPE i.
  DATA ls_rate TYPE ty_rate.
  ls_rate-org = iv_org.
  ls_rate-pct = iv_pct.
  APPEND ls_rate TO gt_rates.
ENDFORM.

FORM build_demo.
  PERFORM add_claim USING '1000' '0000000001' '2' '10.00'.
  PERFORM add_claim USING '1000' '0000000002' '0.300' '3.30'.
  PERFORM add_claim USING '2000' '0000000003' '1' '99.00'.
  PERFORM add_rate USING '1000' 50.
ENDFORM.

FORM apply_case.
  DATA: ls_claim TYPE ty_claim, lv_index TYPE sy-tabix.
  CASE p_case.
    WHEN 0.
      gv_title = 'Baseline: two claims of one org at half rate'.
    WHEN 1.
      gv_title = 'A rejected quantity of zero proposes no credit'.
      LOOP AT gt_claims INTO ls_claim WHERE org = '1000' AND cid = '0000000002'.
        lv_index = sy-tabix.
        ls_claim-qty = '0'.
        MODIFY gt_claims FROM ls_claim INDEX lv_index.
      ENDLOOP.
    WHEN 2.
      gv_title = 'A duplicate claim row with another price is held, not summed'.
      READ TABLE gt_claims INTO ls_claim WITH KEY org = '1000' cid = '0000000001'.
      IF sy-subrc <> 0. MESSAGE 'Broken demo anchor' TYPE 'E'. ENDIF.
      ls_claim-price = '12.00'.
      APPEND ls_claim TO gt_claims.
      DELETE gt_rates WHERE org = '1000'.
      PERFORM add_rate USING '1000' 25.
      p_org = '2000'.
      gv_sealed = space.
    WHEN OTHERS.
      MESSAGE 'Unsupported demo case' TYPE 'E'.
  ENDCASE.
ENDFORM.

FORM credit.
  DATA ls_claim TYPE ty_claim.
  DATA lv_amount TYPE p LENGTH 8 DECIMALS 2.
  LOOP AT gt_claims INTO ls_claim WHERE org = p_org.
    lv_amount = ls_claim-qty * ls_claim-price.
    WRITE: / ls_claim-cid, lv_amount.
  ENDLOOP.
ENDFORM.
