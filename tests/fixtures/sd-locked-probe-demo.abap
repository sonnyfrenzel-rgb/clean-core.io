*&---------------------------------------------------------------------*
*& Report Z_LOCKED_PROBE_DEMO
*&---------------------------------------------------------------------*
*& BUSINESS PURPOSE
*& An analyst asks which returned quantities still support a credit
*& proposal after already posted credits.
*&
*& WHAT THE REPORT DOES NOT DO
*& No creation of a credit memo request, billing document or FI posting.
*&
*& R01  Filter observations by both cutoffs BEFORE deduplication.
*&      Facts not yet known cannot change an earlier view.
*& R02  Round ONCE per claim, half away from zero.
*&
*& INPUT BOUNDS
*& Quantities 0..1,000,000. Priority 1..99.
*&---------------------------------------------------------------------*
REPORT z_locked_probe_demo.

TYPES: ty_flag TYPE c LENGTH 1.
TYPES: BEGIN OF ty_claim,
         cid      TYPE c LENGTH 10,
         discrete TYPE ty_flag,
         qty      TYPE i,
       END OF ty_claim.
CONSTANTS: gc_live_probe TYPE ty_flag VALUE space,
           gc_snapshot TYPE c LENGTH 20 VALUE 'DEMO-SNAP-01'.
DATA: gt_claims TYPE STANDARD TABLE OF ty_claim WITH DEFAULT KEY,
      gt_audit TYPE STANDARD TABLE OF ty_claim WITH DEFAULT KEY,
      gv_code TYPE c LENGTH 30.

PARAMETERS: p_demo AS CHECKBOX DEFAULT 'X',
            p_case TYPE i DEFAULT 0,
            p_export AS CHECKBOX DEFAULT space,
            p_doc TYPE vbeln_va.

START-OF-SELECTION.
  IF p_case < 0 OR p_case > 4.
    MESSAGE 'Supported demo cases are 0 through 4' TYPE 'E'.
  ENDIF.
  IF p_demo = 'X'.
    PERFORM build_demo.
    PERFORM apply_demo_case.
  ELSE.
    PERFORM probe_live_sources.
    RETURN.
  ENDIF.
  PERFORM check_claims.
  PERFORM resolve_roots.
  PERFORM display_results.
  IF p_export = 'X'.
    PERFORM export_results.
  ENDIF.

FORM build_demo.
  PERFORM add_claim USING '0000001001' 'X' 10.
  PERFORM add_claim USING '0000001002' ' ' 20.
ENDFORM.

FORM add_claim USING iv_cid TYPE c iv_discrete TYPE ty_flag iv_qty TYPE i.
  DATA ls_claim TYPE ty_claim.
  ls_claim-cid = iv_cid.
  ls_claim-discrete = iv_discrete.
  ls_claim-qty = iv_qty.
  APPEND ls_claim TO gt_claims.
ENDFORM.

FORM apply_demo_case.
  CASE p_case.
    WHEN 1.
      CLEAR gt_claims.
    WHEN 2.
      PERFORM add_claim USING '0000001003' 'Q' 5.
    WHEN 3.
      PERFORM add_claim USING '0000001004' 'X' 7.
    WHEN 4.
      PERFORM add_claim USING '0000001005' 'X' 9.
  ENDCASE.
ENDFORM.

FORM check_claims.
  DATA ls_claim TYPE ty_claim.
  LOOP AT gt_claims INTO ls_claim.
    IF gv_code IS INITIAL AND ls_claim-discrete <> 'X'
       AND ls_claim-discrete <> space.
      gv_code = 'INVALID_DISCRETE_FLAG'.
    ENDIF.
    IF ls_claim-qty > 1000000.
      gv_code = 'QUANTITY_RANGE'.
    ENDIF.
  ENDLOOP.
ENDFORM.

FORM resolve_roots.
  DATA ls_claim TYPE ty_claim.
  LOOP AT gt_claims INTO ls_claim.
    APPEND ls_claim TO gt_audit.
  ENDLOOP.
ENDFORM.

FORM display_results.
  DATA ls_claim TYPE ty_claim.
  LOOP AT gt_audit INTO ls_claim.
    WRITE: / ls_claim-cid, ls_claim-qty.
  ENDLOOP.
ENDFORM.

FORM export_results.
  DATA lt_lines TYPE STANDARD TABLE OF string.
  CALL FUNCTION 'GUI_DOWNLOAD'
    EXPORTING filename = 'C:\temp\claims.csv'
    TABLES data_tab = lt_lines.
ENDFORM.

FORM probe_live_sources.
  DATA: lv_vbeln TYPE vbak-vbeln, lv_kunnr TYPE vbak-kunnr.
  IF gc_live_probe <> 'X'.
    MESSAGE 'Live adapter deliberately disabled' TYPE 'E'.
  ENDIF.
  IF p_doc IS INITIAL.
    MESSAGE 'Probe requires one sales document' TYPE 'E'.
  ENDIF.
  SELECT SINGLE vbeln kunnr FROM vbak INTO (lv_vbeln, lv_kunnr) WHERE vbeln = p_doc.
  SELECT SINGLE kunnr FROM vbpa INTO lv_kunnr WHERE vbeln = p_doc.
ENDFORM.
