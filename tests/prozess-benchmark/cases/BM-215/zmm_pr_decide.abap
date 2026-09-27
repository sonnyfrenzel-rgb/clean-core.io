*&---------------------------------------------------------------------*
*& Report ZMM_PR_DECIDE
*&---------------------------------------------------------------------*
*& Freigabeentscheidung zur Banf (Aufruf aus Mail-Link / Transaktion ZMM_PRD)
*&---------------------------------------------------------------------*
REPORT zmm_pr_decide.

PARAMETERS: p_banfn TYPE banfn OBLIGATORY,
            p_dec   TYPE char1 OBLIGATORY,     " A = freigeben, R = ablehnen
            p_comm  TYPE text80 LOWER CASE.

DATA: go_appr TYPE REF TO zcl_mm_pr_approval,
      gx_appr TYPE REF TO zcx_mm_pr_approval.

AT SELECTION-SCREEN.
  IF p_dec NA 'AR'.
    MESSAGE e398(00) WITH 'Entscheidung A (freigeben) oder R (ablehnen)'.
  ENDIF.

START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'M_BANF_FRG'
    ID 'FRGCO' FIELD zcl_mm_pr_approval=>gc_rel_code.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'Keine Berechtigung fuer Banf-Freigabe'.
  ENDIF.

  SET HANDLER zcl_mm_pr_notifier=>on_state_changed FOR ALL INSTANCES.

  TRY.
      go_appr = zcl_mm_pr_approval=>load( p_banfn ).
      go_appr->decide( iv_decision = p_dec
                       iv_comment  = CONV #( p_comm ) ).
      COMMIT WORK.
      MESSAGE s398(00) WITH 'Entscheidung gespeichert, Status' go_appr->ms_appr-state.
    CATCH zcx_mm_pr_approval INTO gx_appr.
      ROLLBACK WORK.
      MESSAGE gx_appr TYPE 'I' DISPLAY LIKE 'E'.
  ENDTRY.
