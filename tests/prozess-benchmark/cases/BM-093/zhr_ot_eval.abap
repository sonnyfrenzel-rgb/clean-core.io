*&---------------------------------------------------------------------*
*& Report ZHR_OT_EVAL - Überstundenmonitor je Monat
*&---------------------------------------------------------------------*
*& Vergleicht Ist-Anwesenheit (IT2002) plus erfasste Mehrarbeit (IT2005)
*& mit der Sollarbeitszeit (IT0007) und alarmiert die Führungskraft per
*& Workflow, wenn die Monatsgrenze des Personalbereichs überschritten ist.
*&---------------------------------------------------------------------*
*& 2017-10  HB  Erstellung (Betriebsvereinbarung Arbeitszeit)
*& 2018-03  HB  Gelbstufe ab 80 % der Grenze
*&---------------------------------------------------------------------*
REPORT zhr_ot_eval.

TABLES: pa0001.

DATA: go_eval   TYPE REF TO zcl_hr_overtime,
      gt_pernr  TYPE STANDARD TABLE OF persno,
      gv_pernr  TYPE persno,
      gs_res    TYPE zhr_s_ot_result,
      gt_out    TYPE STANDARD TABLE OF zhr_s_ot_result,
      gv_begda  TYPE begda,
      gv_endda  TYPE endda,
      gv_alerts TYPE i.

SELECT-OPTIONS: s_pernr FOR pa0001-pernr,
                s_orgeh FOR pa0001-orgeh,
                s_persa FOR pa0001-werks.
PARAMETERS: p_spmon TYPE spmon OBLIGATORY,
            p_alert AS CHECKBOX.

START-OF-SELECTION.
* Monatsgrenzen aus Periode JJJJMM
  gv_begda = p_spmon && '01'.
  gv_endda = gv_begda + 31.
  gv_endda+6(2) = '01'.
  gv_endda = gv_endda - 1.

  CREATE OBJECT go_eval
    EXPORTING
      iv_begda = gv_begda
      iv_endda = gv_endda.

  SELECT DISTINCT pernr FROM pa0001 INTO TABLE gt_pernr
    WHERE pernr IN s_pernr
      AND orgeh IN s_orgeh
      AND werks IN s_persa
      AND begda <= gv_endda
      AND endda >= gv_begda.
  IF gt_pernr IS INITIAL.
    MESSAGE s003(zhr_ot).
    RETURN.
  ENDIF.

  LOOP AT gt_pernr INTO gv_pernr.
*   Berechtigung Anwesenheiten (IT2002) lesen
    CALL FUNCTION 'HR_CHECK_AUTHORITY_INFTY'
      EXPORTING
        tclas            = 'A'
        pernr            = gv_pernr
        infty            = '2002'
        subty            = space
        begda            = gv_begda
        endda            = gv_endda
        level            = 'R'
      EXCEPTIONS
        no_authorization = 1
        internal_error   = 2
        OTHERS           = 3.
    IF sy-subrc <> 0.
      CONTINUE.
    ENDIF.

    gs_res = go_eval->evaluate( gv_pernr ).
    IF gs_res-status = 'R' AND p_alert = 'X'.
      go_eval->raise_alert( gs_res ).
      gv_alerts = gv_alerts + 1.
    ENDIF.
    APPEND gs_res TO gt_out.
  ENDLOOP.

  IF gv_alerts > 0.
    COMMIT WORK.
  ENDIF.

  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program = sy-repid
      i_structure_name   = 'ZHR_S_OT_RESULT'
      i_grid_title       = 'Überstundenmonitor'
    TABLES
      t_outtab           = gt_out
    EXCEPTIONS
      program_error      = 1
      OTHERS             = 2.
