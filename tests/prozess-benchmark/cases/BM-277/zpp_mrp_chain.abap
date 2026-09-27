REPORT zpp_mrp_chain.
*----------------------------------------------------------------------*
* Nachtkette Disposition (Werke aus ZPP_CHAIN_STEP)
*   P = Kette einplanen, M = Status ueberwachen, R = ab Fehlerschritt neu
* Schritte: MRP-Lauf je Werk, Umsetzung Planauftraege, Ausnahmemail ...
*----------------------------------------------------------------------*
* 2018-04 DW  Anlage (Abloesung SM36-Kette nach Werkszusammenlegung)
* 2020-01 DW  Wiederaufsetzen ab Fehlerschritt
*----------------------------------------------------------------------*
PARAMETERS: p_chain TYPE zpp_chain_id OBLIGATORY DEFAULT 'MRP_NIGHT',
            p_mode  TYPE c LENGTH 1 OBLIGATORY DEFAULT 'P',
            p_run   TYPE zpp_run_id,
            p_date  TYPE sy-datum DEFAULT sy-datum,
            p_time  TYPE sy-uzeit DEFAULT '010000'.

DATA: go_orch  TYPE REF TO zcl_pp_chain_orchestrator,
      gx_chain TYPE REF TO zcx_pp_chain,
      gt_state TYPE zcl_pp_chain_orchestrator=>ty_t_state,
      gv_run   TYPE zpp_run_id.

START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'S_BTCH_JOB'
    ID 'JOBACTION' FIELD 'RELE'
    ID 'JOBGROUP'  FIELD '*'.
  IF sy-subrc <> 0 AND p_mode <> 'M'.
    MESSAGE e301(zpp).
  ENDIF.

  go_orch = NEW #( iv_chain_id = p_chain ).

  TRY.
      CASE p_mode.
        WHEN 'P'.
          gv_run = go_orch->plan( iv_date = p_date iv_time = p_time ).
          MESSAGE s302(zpp) WITH p_chain gv_run.
        WHEN 'M'.
          gt_state = go_orch->monitor( p_run ).
          LOOP AT gt_state INTO DATA(gs_state).
            WRITE: / gs_state-step_no, gs_state-jobname, gs_state-status.
            IF gs_state-status = 'A'.
              FORMAT COLOR COL_NEGATIVE.
              WRITE 'abgebrochen - Neustart mit Modus R'(001).
              FORMAT COLOR OFF.
            ENDIF.
          ENDLOOP.
        WHEN 'R'.
          go_orch->restart( iv_run_id = p_run ).
          MESSAGE s303(zpp) WITH p_run.
        WHEN OTHERS.
          MESSAGE e304(zpp) WITH p_mode.
      ENDCASE.
    CATCH zcx_pp_chain INTO gx_chain.
      MESSAGE gx_chain TYPE 'I' DISPLAY LIKE 'E'.
  ENDTRY.
