*&---------------------------------------------------------------------*
*& Report ZQM_INSPECTION_RESULT
*&---------------------------------------------------------------------*
*& Synthetic QM-like fixture for the rule explanation engine (3.0.20).
*& Written for the spec tests/rule-decision-flow.spec.ts: a usage
*& decision under a first-test branch (QM-06 shape), a score limit, a
*& reviewer quorum around a final flag, a plant and a log level.
*&---------------------------------------------------------------------*
REPORT zqm_inspection_result.

CONSTANTS: c_plant      TYPE werks_d VALUE '1000',
           c_crit_score TYPE i VALUE 80,
           c_log_level  TYPE c LENGTH 4 VALUE 'WARN'.

DATA: gv_first     TYPE c LENGTH 1,
      gv_score     TYPE i,
      gv_retests   TYPE i,
      gv_result    TYPE c LENGTH 4,
      gv_reviewers TYPE i,
      gv_status    TYPE c LENGTH 10,
      gv_werks     TYPE werks_d,
      gv_level     TYPE c LENGTH 4.

PARAMETERS: p_final TYPE abap_bool AS CHECKBOX.

START-OF-SELECTION.
  PERFORM decide_usage.
  PERFORM decide_release.
  PERFORM write_log.

FORM decide_usage.
  IF gv_werks <> c_plant.
    RETURN.
  ENDIF.
  IF gv_first = 'F'.
    IF gv_score >= c_crit_score OR gv_retests = 0.
      gv_result = 'FAIL'.
      PERFORM block_stock.
    ELSE.
      gv_result = 'RTST'.
    ENDIF.
  ELSE.
    gv_result = 'PASS'.
  ENDIF.
ENDFORM.

FORM decide_release.
  IF gv_reviewers >= 2.
    IF p_final = abap_true.
      gv_status = 'ELIGIBLE'.
      PERFORM release_lot.
    ENDIF.
  ENDIF.
ENDFORM.

FORM block_stock.
  UPDATE mard SET speme = 1 WHERE werks = gv_werks.
ENDFORM.

FORM release_lot.
  WRITE: / 'Released'.
ENDFORM.

FORM write_log.
  IF gv_level = c_log_level.
    WRITE: / 'Warning logged'.
  ENDIF.
ENDFORM.
