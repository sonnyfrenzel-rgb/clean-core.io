FUNCTION z_idoc_input_zorders.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(INPUT_METHOD) LIKE  BDWFAP_PAR-INPUTMETHD
*"     VALUE(MASS_PROCESSING) LIKE  BDWFAP_PAR-MASS_PROC
*"  EXPORTING
*"     VALUE(WORKFLOW_RESULT) LIKE  BDWF_PARAM-RESULT
*"     VALUE(APPLICATION_VARIABLE) LIKE  BDWF_PARAM-APPL_VAR
*"     VALUE(IN_UPDATE_TASK) LIKE  BDWFAP_PAR-UPDATETASK
*"     VALUE(CALL_TRANSACTION_DONE) LIKE  BDWFAP_PAR-CALLTRANS
*"  TABLES
*"      IDOC_CONTRL STRUCTURE  EDIDC
*"      IDOC_DATA STRUCTURE  EDIDD
*"      IDOC_STATUS STRUCTURE  BDIDOCSTAT
*"      RETURN_VARIABLES STRUCTURE  BDWFRETVAR
*"      SERIALIZATION_INFO STRUCTURE  BDI_SER
*"----------------------------------------------------------------------
* Eingangsverarbeitung Kundenbestellung per EDI -> Kundenauftrag
* 2013-02 EDI-Team (RKN), 2018-07 Dublettenprüfung (JHO)
* Hinweis: COMMIT WORK setzt die ALE-Eingangsschicht, nicht dieser FB!
  CLEAR: gv_anyerr.
  in_update_task        = space.
  call_transaction_done = space.

  LOOP AT idoc_contrl INTO gs_edidc.
    CLEAR: gs_head, gt_items, gv_error, gv_msg, gv_vbeln.

    PERFORM segmente_lesen TABLES idoc_data.
    IF gv_error = abap_false.
      PERFORM auftraggeber_ermitteln.
    ENDIF.
    IF gv_error = abap_false.
      PERFORM material_umschluesseln.
    ENDIF.
    IF gv_error = abap_false.
      PERFORM auftrag_anlegen.
    ENDIF.

    PERFORM status_setzen TABLES idoc_status return_variables.
  ENDLOOP.

  IF gv_anyerr = abap_true.
    workflow_result = c_wf_result_error.
  ELSE.
    workflow_result = c_wf_result_ok.
  ENDIF.
ENDFUNCTION.
