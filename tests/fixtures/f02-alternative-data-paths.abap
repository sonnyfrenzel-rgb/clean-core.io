*&---------------------------------------------------------------------*
*& Minimal fixture for CO review F02 (12.10.2026): two alternative ways to
*& get the data before one shared calculation, an authorization check on
*& one of them only, and an optional export before the display. Written
*& for the spec, after the shape of the CO close simulation.
*&---------------------------------------------------------------------*
REPORT zf02_alternative_data_paths.

CONSTANTS gc_x TYPE c VALUE 'X'.

PARAMETERS: p_kokrs TYPE kokrs DEFAULT 'A100',
            p_demo  AS CHECKBOX DEFAULT 'X',
            p_csv   AS CHECKBOX.

DATA: gt_csks   TYPE STANDARD TABLE OF csks,
      gt_cosp   TYPE STANDARD TABLE OF cosp,
      gt_result TYPE STANDARD TABLE OF cosp,
      gs_cosp   TYPE cosp.

START-OF-SELECTION.
  PERFORM load_policy.
  PERFORM validate_policy.
  IF p_demo = gc_x.
    PERFORM load_demo_totals.
    PERFORM apply_demo_case.
  ELSE.
    PERFORM authorize_scope.
    PERFORM read_live_masters.
    PERFORM read_live_totals.
  ENDIF.
  PERFORM normalize_totals.
  PERFORM simulate_periods.
  PERFORM build_result.
  IF p_csv = gc_x.
    PERFORM export_csv.
  ENDIF.
  PERFORM display_result.

FORM load_policy.
  SELECT * FROM tka01 INTO TABLE @DATA(lt_area) WHERE kokrs = @p_kokrs.
  IF sy-subrc <> 0.
    MESSAGE 'Controlling area not found' TYPE 'E'.
  ENDIF.
  LOOP AT lt_area INTO DATA(ls_area).
    CALL FUNCTION 'Z_F02_POLICY_ROW' EXPORTING is_area = ls_area.
  ENDLOOP.
ENDFORM.

FORM validate_policy.
  LOOP AT gt_csks INTO DATA(ls_csks).
    IF ls_csks-kostl IS INITIAL.
      MESSAGE 'Policy names an empty cost center' TYPE 'E'.
    ENDIF.
    CALL FUNCTION 'Z_F02_POLICY_CHECK' EXPORTING iv_kostl = ls_csks-kostl.
  ENDLOOP.
ENDFORM.

FORM load_demo_totals.
  DO 12 TIMES.
    gs_cosp-objnr = |KS{ sy-index }|.
    APPEND gs_cosp TO gt_cosp.
  ENDDO.
  IF gt_cosp IS INITIAL.
    MESSAGE 'No demo totals' TYPE 'E'.
  ENDIF.
  CALL FUNCTION 'Z_F02_DEMO_TOTALS' TABLES ct_cosp = gt_cosp.
ENDFORM.

FORM apply_demo_case.
  LOOP AT gt_cosp ASSIGNING FIELD-SYMBOL(<ls_cosp>).
    <ls_cosp>-wkg001 = <ls_cosp>-wkg001 * 2.
  ENDLOOP.
  IF lines( gt_cosp ) > 100.
    MESSAGE 'Too many demo rows' TYPE 'E'.
  ENDIF.
  CALL FUNCTION 'Z_F02_DEMO_CASE' TABLES ct_cosp = gt_cosp.
ENDFORM.

FORM authorize_scope.
  AUTHORITY-CHECK OBJECT 'K_CSKS' ID 'KOKRS' FIELD p_kokrs ID 'ACTVT' FIELD '03'.
  IF sy-subrc <> 0.
    MESSAGE 'No authorization for the controlling area' TYPE 'E'.
  ENDIF.
  AUTHORITY-CHECK OBJECT 'K_CCA' ID 'KOKRS' FIELD p_kokrs ID 'ACTVT' FIELD '03'.
  IF sy-subrc <> 0.
    MESSAGE 'No authorization for cost center accounting' TYPE 'E'.
  ENDIF.
ENDFORM.

FORM read_live_masters.
  SELECT * FROM csks INTO TABLE gt_csks WHERE kokrs = p_kokrs.
  IF sy-subrc <> 0.
    MESSAGE 'No cost centers' TYPE 'E'.
  ENDIF.
  LOOP AT gt_csks INTO DATA(ls_master).
    CALL FUNCTION 'Z_F02_MASTER_ROW' EXPORTING is_csks = ls_master.
  ENDLOOP.
ENDFORM.

FORM read_live_totals.
  SELECT * FROM cosp INTO TABLE gt_cosp WHERE gjahr = '2026'.
  IF sy-subrc <> 0.
    MESSAGE 'No totals' TYPE 'E'.
  ENDIF.
  LOOP AT gt_cosp INTO DATA(ls_total).
    CALL FUNCTION 'Z_F02_TOTAL_ROW' EXPORTING is_cosp = ls_total.
  ENDLOOP.
ENDFORM.

FORM normalize_totals.
  LOOP AT gt_cosp ASSIGNING FIELD-SYMBOL(<ls_norm>).
    IF <ls_norm>-wkg001 < 0.
      <ls_norm>-wkg001 = 0.
    ENDIF.
    CALL FUNCTION 'Z_F02_NORMALIZE' CHANGING cs_cosp = <ls_norm>.
  ENDLOOP.
ENDFORM.

FORM simulate_periods.
  DO 12 TIMES.
    CALL FUNCTION 'Z_F02_SIMULATE_PERIOD' EXPORTING iv_period = sy-index TABLES ct_cosp = gt_cosp.
    IF sy-subrc <> 0.
      MESSAGE 'Simulation failed' TYPE 'E'.
    ENDIF.
  ENDDO.
ENDFORM.

FORM build_result.
  LOOP AT gt_cosp INTO DATA(ls_row).
    IF ls_row-wkg001 <> 0.
      APPEND ls_row TO gt_result.
    ENDIF.
  ENDLOOP.
  CALL FUNCTION 'Z_F02_RECONCILE' TABLES it_result = gt_result.
ENDFORM.

FORM export_csv.
  DATA lv_file TYPE string VALUE 'result.csv'.
  OPEN DATASET lv_file FOR OUTPUT IN TEXT MODE ENCODING UTF-8.
  IF sy-subrc <> 0.
    MESSAGE 'File cannot be opened' TYPE 'E'.
  ENDIF.
  LOOP AT gt_result INTO DATA(ls_out).
    TRANSFER ls_out-objnr TO lv_file.
  ENDLOOP.
  CLOSE DATASET lv_file.
ENDFORM.

FORM display_result.
  LOOP AT gt_result INTO DATA(ls_show).
    WRITE: / ls_show-objnr, ls_show-wkg001.
  ENDLOOP.
  IF gt_result IS INITIAL.
    MESSAGE 'Nothing to show' TYPE 'S'.
  ENDIF.
  CALL FUNCTION 'Z_F02_DISPLAY_DONE'.
ENDFORM.
